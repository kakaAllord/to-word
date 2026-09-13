import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { speakerMap } from '@/db/schema';
import { withAuth } from '@/lib/http';
import { getSegments, getSpeakerMap, getTask } from '@/lib/tasks';
import { speakerStats } from '@/lib/speakers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  if (!(await getTask(id))) return Response.json({ error: 'Task not found.' }, { status: 404 });
  const segments = await getSegments(id);
  return Response.json({ stats: speakerStats(segments), map: await getSpeakerMap(id) });
});

/**
 * Replace the whole mapping. Many raw ids may share one label (spec 9) —
 * Scribe over-splits speakers, so this is the common case, not the exception.
 * Segment rows are never rewritten; display resolves through the map.
 */
export const PUT = withAuth(async (request: Request, { params }: Params) => {
  const { id } = await params;
  if (!(await getTask(id))) return Response.json({ error: 'Task not found.' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    map?: { rawSpeaker: string; label: string }[];
  };
  const entries = (body.map ?? []).filter((e) => e.rawSpeaker);

  await db.transaction(async (tx) => {
    await tx.delete(speakerMap).where(eq(speakerMap.taskId, id));
    const rows = entries
      .filter((e) => e.label?.trim())
      .map((e) => ({ taskId: id, rawSpeaker: e.rawSpeaker, label: e.label.trim() }));
    if (rows.length) await tx.insert(speakerMap).values(rows);
  });

  return Response.json({ map: await getSpeakerMap(id) });
});

export const DELETE = withAuth(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const raw = new URL(request.url).searchParams.get('rawSpeaker');
  if (!raw) return Response.json({ error: 'rawSpeaker is required.' }, { status: 400 });
  await db
    .delete(speakerMap)
    .where(and(eq(speakerMap.taskId, id), eq(speakerMap.rawSpeaker, raw)));
  return Response.json({ map: await getSpeakerMap(id) });
});
