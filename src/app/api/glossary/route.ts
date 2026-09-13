import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { glossaryTerm } from '@/db/schema';
import { withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Glossary terms. `taskId` query param scopes the read:
 *   omitted    -> global terms only
 *   <task id>  -> global + that task's terms
 */
export const GET = withAuth(async (request: Request) => {
  const taskId = new URL(request.url).searchParams.get('taskId');
  const rows = await db
    .select()
    .from(glossaryTerm)
    .where(taskId ? undefined : isNull(glossaryTerm.taskId))
    .orderBy(asc(glossaryTerm.createdAt));
  const filtered = taskId
    ? rows.filter((r) => r.taskId === null || r.taskId === taskId)
    : rows;
  return Response.json({ terms: filtered });
});

export const POST = withAuth(async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as {
    wrong?: string;
    right?: string;
    taskId?: string | null;
  };
  const wrong = (body.wrong ?? '').trim();
  const right = (body.right ?? '').trim();
  if (!wrong || !right) {
    return Response.json({ error: 'Both "wrong" and "right" are required.' }, { status: 400 });
  }

  const scope = body.taskId ?? null;
  const [existing] = await db
    .select()
    .from(glossaryTerm)
    .where(
      and(
        scope ? eq(glossaryTerm.taskId, scope) : isNull(glossaryTerm.taskId),
        eq(glossaryTerm.wrong, wrong),
      ),
    );
  if (existing) {
    const [row] = await db
      .update(glossaryTerm)
      .set({ right })
      .where(eq(glossaryTerm.id, existing.id))
      .returning();
    return Response.json({ term: row });
  }

  const [row] = await db
    .insert(glossaryTerm)
    .values({ taskId: scope, wrong, right })
    .returning();
  return Response.json({ term: row }, { status: 201 });
});
