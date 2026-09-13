import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { segment } from '@/db/schema';
import { withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Per-segment save (spec 8.5). Called on an ~800 ms debounce while typing, and
 * for confirm toggles and inline speaker overrides. Small, frequent, cheap.
 */
export const PATCH = withAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    editedText?: string;
    confirmed?: boolean;
    speakerOverride?: string | null;
    /** Client's local edit time; used to recover work saved offline. */
    clientUpdatedAt?: number;
  };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.editedText === 'string') patch.editedText = body.editedText;
  if (typeof body.confirmed === 'boolean') patch.confirmed = body.confirmed;
  if ('speakerOverride' in body) {
    const value = body.speakerOverride;
    patch.speakerOverride = value && String(value).trim() ? String(value).trim() : null;
  }

  const [row] = await db.update(segment).set(patch).where(eq(segment.id, id)).returning();
  if (!row) return Response.json({ error: 'Segment not found.' }, { status: 404 });
  return Response.json({ segment: row });
});

/** Revert this segment to the machine transcript. */
export const DELETE = withAuth(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const [existing] = await db.select().from(segment).where(eq(segment.id, id));
  if (!existing) return Response.json({ error: 'Segment not found.' }, { status: 404 });
  const [row] = await db
    .update(segment)
    .set({ editedText: existing.originalText, updatedAt: new Date() })
    .where(eq(segment.id, id))
    .returning();
  return Response.json({ segment: row });
});
