import { withAuth } from '@/lib/http';
import { enqueueTranscription, getTask } from '@/lib/tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Retry a failed transcription without re-uploading (spec 14.11). */
export const POST = withAuth(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const row = await getTask(id);
  if (!row) return Response.json({ error: 'Task not found.' }, { status: 404 });
  if (!row.audioPath) {
    return Response.json(
      { error: 'This task has no audio file any more, so it cannot be retried.' },
      { status: 400 },
    );
  }
  await enqueueTranscription(id);
  return Response.json({ ok: true, task: await getTask(id) });
});
