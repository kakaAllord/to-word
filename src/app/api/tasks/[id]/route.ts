import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { TASK_STATUSES, task, type TaskStatus } from '@/db/schema';
import { withAuth } from '@/lib/http';
import { deleteAudioFile } from '@/lib/audio';
import { getSegments, getSpeakerMap, getTask, setTaskStatus } from '@/lib/tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const row = await getTask(id);
  if (!row) return Response.json({ error: 'Task not found.' }, { status: 404 });
  return Response.json({
    task: row,
    segments: await getSegments(id),
    speakerMap: await getSpeakerMap(id),
  });
});

export const PATCH = withAuth(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    status?: string;
  };

  const existing = await getTask(id);
  if (!existing) return Response.json({ error: 'Task not found.' }, { status: 404 });

  if (typeof body.name === 'string' && body.name.trim()) {
    await db
      .update(task)
      .set({ name: body.name.trim(), updatedAt: new Date() })
      .where(eq(task.id, id));
  }

  if (body.status) {
    if (!TASK_STATUSES.includes(body.status as TaskStatus)) {
      return Response.json({ error: `Unknown status "${body.status}".` }, { status: 400 });
    }
    const updated = await setTaskStatus(id, body.status as TaskStatus);
    // Retention (spec 13): paid means the audio goes, the transcript stays.
    if (body.status === 'paid' && updated?.audioPath) {
      await deleteAudioFile(updated.audioPath);
      await db
        .update(task)
        .set({ audioPath: null, updatedAt: new Date() })
        .where(eq(task.id, id));
    }
  }

  return Response.json({ task: await getTask(id) });
});

export const DELETE = withAuth(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const row = await getTask(id);
  if (!row) return Response.json({ error: 'Task not found.' }, { status: 404 });
  await deleteAudioFile(row.audioPath);
  await db.delete(task).where(eq(task.id, id)); // segments/jobs cascade
  return Response.json({ ok: true });
});
