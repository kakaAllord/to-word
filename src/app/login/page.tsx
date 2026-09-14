import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { isAuthenticated } from '@/lib/auth';
import { isSetupRequired } from '@/lib/password';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await isAuthenticated()) redirect('/');
  const { next } = await searchParams;

  // A database that is still waking up should not look like a locked-out app.
  let setupRequired = false;
  let databaseError: string | null = null;
  try {
    setupRequired = await isSetupRequired();
  } catch (error) {
    databaseError = error instanceof Error ? error.message : String(error);
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h2>to-word</h2>
        {databaseError ? (
          <div className="banner error">
            <strong>The database is not reachable, so sign-in is unavailable.</strong>
            <pre>{databaseError}</pre>
          </div>
        ) : (
          <LoginForm next={next} setupRequired={setupRequired} />
        )}
      </div>
    </div>
  );
}
