import { cookies } from 'next/headers';
import { checkPassword } from '@/lib/auth';
import { SESSION_COOKIE, createSessionValue, sessionCookieOptions } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let password = '';
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    password = (await request.json().catch(() => ({})))?.password ?? '';
  } else {
    password = String((await request.formData()).get('password') ?? '');
  }

  if (!(await checkPassword(password))) {
    // Constant-ish delay so the endpoint is not a fast oracle.
    await new Promise((r) => setTimeout(r, 400));
    return Response.json({ error: 'Wrong password.' }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionValue(), sessionCookieOptions());
  return Response.json({ ok: true });
}
