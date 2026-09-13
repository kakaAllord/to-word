import { withAuth } from '@/lib/http';
import { audioResponse } from '@/lib/audio';
import { getTask } from '@/lib/tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Audio is served through this authenticated route, never from /public. */
export const GET = withAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const row = await getTask(id);
  if (!row) return new Response('Task not found', { status: 404 });
  if (!row.audioPath) {
    return new Response('Audio for this task has been deleted (task was marked paid).', {
      status: 410,
    });
  }
  return audioResponse(row.audioPath, request.headers.get('range'));
});

export async function HEAD(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const response = await GET(request, { params });
  return new Response(null, { status: response.status, headers: response.headers });
}
