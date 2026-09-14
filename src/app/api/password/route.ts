import { withAuth } from '@/lib/http';
import { passwordOverrideSet } from '@/lib/env';
import { passwordProblem, replacePassword, verifyPassword } from '@/lib/password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Change the password from inside the app. Requires the current one. */
export const POST = withAuth(async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!(await verifyPassword(body.currentPassword ?? ''))) {
    return Response.json({ error: 'That is not the current password.' }, { status: 403 });
  }

  const problem = passwordProblem(body.newPassword ?? '');
  if (problem) return Response.json({ error: problem }, { status: 400 });

  await replacePassword(body.newPassword!);

  return Response.json({
    ok: true,
    // An env override would keep winning over what was just saved.
    overridden: passwordOverrideSet(),
  });
});
