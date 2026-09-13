import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { glossaryTerm } from '@/db/schema';
import { withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withAuth(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await db.delete(glossaryTerm).where(eq(glossaryTerm.id, id));
  return Response.json({ ok: true });
});
