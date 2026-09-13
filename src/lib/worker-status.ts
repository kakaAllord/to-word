import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

/** A single row; there is one worker. */
const WORKER_ID = 'transcription';

/** How long without a heartbeat before the worker counts as down. */
const STALE_AFTER_MS = 90_000;

export async function recordHeartbeat(note: string): Promise<void> {
  await db.execute(sql`
    insert into worker_status (id, last_seen, note)
    values (${WORKER_ID}, now(), ${note})
    on conflict (id) do update set last_seen = now(), note = excluded.note
  `);
}

export type WorkerHealth = {
  everSeen: boolean;
  alive: boolean;
  lastSeen: string | null;
  secondsAgo: number | null;
  note: string | null;
};

export async function getWorkerHealth(): Promise<WorkerHealth> {
  const result = await db.execute(sql`
    select last_seen, note from worker_status where id = ${WORKER_ID}
  `);
  const row = (result.rows as unknown as { last_seen: Date; note: string | null }[])[0];
  if (!row) {
    return { everSeen: false, alive: false, lastSeen: null, secondsAgo: null, note: null };
  }
  const lastSeen = new Date(row.last_seen);
  const age = Date.now() - lastSeen.getTime();
  return {
    everSeen: true,
    alive: age < STALE_AFTER_MS,
    lastSeen: lastSeen.toISOString(),
    secondsAgo: Math.round(age / 1000),
    note: row.note,
  };
}
