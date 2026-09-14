import { cookies } from 'next/headers';
import { claimPassword, isSetupRequired, passwordProblem } from '@/lib/password';
import { describeError } from '@/lib/http';
import { SESSION_COOKIE, createSessionValue, sessionCookieOptions } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * First run: choose the password. Public by necessity, but it only works while
 * no password exists — once one is set this returns 409 for good.
 */
export async function POST(request: Request) {
  try {
    if (!(await isSetupRequired())) {
      return Response.json(
        { error: 'A password has already been set for this instance.' },
        { status: 409 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { password?: string };
    const password = body.password ?? '';
    const problem = passwordProblem(password);
    if (problem) return Response.json({ error: problem }, { status: 400 });

    // Loses the race if someone else claimed the instance a moment ago.
    if (!(await claimPassword(password))) {
      return Response.json(
        { error: 'Someone else just set the password for this instance.' },
        { status: 409 },
      );
    }

    const jar = await cookies();
    jar.set(SESSION_COOKIE, await createSessionValue(), sessionCookieOptions());
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}
