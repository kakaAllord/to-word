import { withAuth } from '@/lib/http';
import { listTasks } from '@/lib/tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sidebar data: every task with its confirmed/total progress. */
export const GET = withAuth(async () => {
  return Response.json({ tasks: await listTasks() });
});
