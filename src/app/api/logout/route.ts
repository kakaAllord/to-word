import { cookies } from 'next/headers';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return Response.json({ ok: true });
}
