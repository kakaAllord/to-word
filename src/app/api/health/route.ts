import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { hasElevenLabsKey, storageWarning } from '@/lib/env';
import { describeError } from '@/lib/http';
import { getWorkerHealth } from '@/lib/worker-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public (spec 12) and used as the Railway health check.
 *
 * Only the database gates the status code — a missing API key or a worker that
 * has just restarted are worth reporting, but not worth failing the deploy and
 * rolling back a UI that otherwise works.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    return Response.json(
      { ok: false, database: 'down', error: describeError(err) },
      { status: 503 },
    );
  }

  const worker = await getWorkerHealth().catch(() => null);

  return Response.json({
    ok: true,
    database: 'up',
    worker: worker
      ? {
          alive: worker.alive,
          lastSeen: worker.lastSeen,
          secondsAgo: worker.secondsAgo,
          state: worker.note,
        }
      : { alive: false, lastSeen: null, secondsAgo: null, state: 'unknown' },
    elevenLabsKey: hasElevenLabsKey(),
    storageWarning: storageWarning(),
  });
}
