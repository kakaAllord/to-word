/**
 * Queue worker. Polls `job`, claims rows with FOR UPDATE SKIP LOCKED, runs the
 * pipeline. Deployed as its own Railway service from this same repo, sharing
 * the database and the audio volume with `web`.
 */
import { sql } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import { type Job } from '@/db/schema';
import { runMigrations } from '@/db/migrate';
import { ProviderError } from '@/providers';
import { recordHeartbeat } from '@/lib/worker-status';
import { transcribeTask } from './pipeline';

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_MS || 3000);
const MAX_ATTEMPTS = 5;
/** A claimed job is leased; if the worker dies, the lease expires and it requeues. */
const LEASE_MINUTES = 30;

function log(message: string): void {
  console.log(`[worker ${new Date().toISOString()}] ${message}`);
}

function backoffMs(attempts: number): number {
  // 30s, 60s, 2m, 4m, 8m — plus jitter so retries never align.
  const base = 30_000 * 2 ** Math.max(0, attempts - 1);
  return Math.min(base, 15 * 60_000) + Math.floor(Math.random() * 5000);
}

/**
 * The raw shape db.execute returns: node-postgres hands back the database's
 * own snake_case column names, not the camelCase Drizzle uses.
 */
type JobRow = {
  id: string;
  task_id: string;
  state: string;
  attempts: number;
  last_error: string | null;
  run_after: Date;
  created_at: Date;
};

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    taskId: row.task_id,
    state: row.state,
    attempts: Number(row.attempts),
    lastError: row.last_error,
    runAfter: row.run_after,
    createdAt: row.created_at,
  };
}

/** Claim one job atomically. Concurrent workers never take the same row. */
async function claimJob(): Promise<Job | null> {
  const result = await db.execute(sql`
    update job
       set state = 'running',
           attempts = attempts + 1,
           run_after = now() + (${LEASE_MINUTES} * interval '1 minute')
     where id = (
       select id from job
        where state = 'queued'
          and run_after <= now()
        order by created_at
          for update skip locked
        limit 1
     )
    returning *
  `);
  const row = (result.rows as unknown as JobRow[])[0];
  return row ? toJob(row) : null;
}

/** Requeue jobs whose worker died mid-run. */
async function reapExpiredLeases(): Promise<void> {
  const result = await db.execute(sql`
    update job
       set state = 'queued', run_after = now(),
           last_error = coalesce(last_error, 'Worker stopped mid-run; requeued.')
     where state = 'running' and run_after < now()
    returning id
  `);
  if (result.rows.length > 0) {
    log(`requeued ${result.rows.length} job(s) with expired leases`);
  }
}

async function finishJob(job: Job): Promise<void> {
  await db.execute(sql`
    update job set state = 'done', last_error = null where id = ${job.id}
  `);
}

/** Never swallow the API error: it goes on both the job and the task (spec 15). */
async function failJob(job: Job, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const attempts = job.attempts;
  // A bad key or a rejected file will fail identically five times over; only
  // rate limits and transient faults are worth backing off for.
  const permanent = error instanceof ProviderError && !error.retryable;
  const giveUp = permanent || attempts >= MAX_ATTEMPTS;
  const retryAfterMs =
    (error as { retryAfterMs?: number })?.retryAfterMs ?? backoffMs(attempts);

  if (giveUp) {
    log(
      permanent
        ? `job ${job.id} failed permanently (not retryable): ${message}`
        : `job ${job.id} failed permanently after ${attempts} attempts: ${message}`,
    );
    await db.execute(sql`
      update job set state = 'failed', last_error = ${message} where id = ${job.id}
    `);
    await db.execute(sql`
      update task set status = 'failed', error = ${message}, updated_at = now()
       where id = ${job.taskId}
    `);
  } else {
    log(`job ${job.id} attempt ${attempts} failed, retrying: ${message}`);
    await db.execute(sql`
      update job
         set state = 'queued',
             last_error = ${message},
             run_after = now() + (${Math.round(retryAfterMs)} * interval '1 millisecond')
       where id = ${job.id}
    `);
    // Keep the message visible while it retries, but leave the task in-flight.
    await db.execute(sql`
      update task set error = ${message}, updated_at = now() where id = ${job.taskId}
    `);
  }
}

async function tick(): Promise<boolean> {
  const job = await claimJob();
  if (!job) return false;
  log(`claimed job ${job.id} for task ${job.taskId} (attempt ${job.attempts})`);
  try {
    await transcribeTask(job.taskId, log);
    await finishJob(job);
  } catch (err) {
    await failJob(job, err);
  }
  return true;
}

async function main(): Promise<void> {
  log('starting');
  if (process.env.WORKER_RUN_MIGRATIONS !== 'false') {
    await runMigrations();
  }

  let running = true;
  const stop = (signal: string) => {
    log(`${signal} received, finishing current job then exiting`);
    running = false;
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  let sinceReap = 0;
  while (running) {
    try {
      if (sinceReap++ % 20 === 0) await reapExpiredLeases();
      const didWork = await tick();
      // The web app reads this to tell the operator whether anything is
      // actually processing their file.
      await recordHeartbeat(didWork ? 'working' : 'idle');
      if (!didWork) await sleep(POLL_INTERVAL_MS);
    } catch (err) {
      // A database blip must not kill the worker.
      log(`loop error: ${(err as Error).message}`);
      await sleep(POLL_INTERVAL_MS * 2);
    }
  }

  await pool.end();
  log('stopped');
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
