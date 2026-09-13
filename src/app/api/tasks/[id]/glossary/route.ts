import { withAuth } from '@/lib/http';
import { getTask } from '@/lib/tasks';
import { reapplyGlossary } from '@/worker/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Re-apply the glossary after adding terms mid-proofread (spec 10).
 * Only unconfirmed segments are touched — checked work is never overwritten.
 */
export const POST = withAuth(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!(await getTask(id))) return Response.json({ error: 'Task not found.' }, { status: 404 });
  const changed = await reapplyGlossary(id);
  return Response.json({ ok: true, changed });
});
