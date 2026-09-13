import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await isAuthenticated()) redirect('/');
  const { next } = await searchParams;
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h2>to-word</h2>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
