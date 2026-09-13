'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        router.push(next && next.startsWith('/') ? next : '/');
        router.refresh();
      } else {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error || `Sign-in failed (HTTP ${response.status}).`);
      }
    } catch (err) {
      setError(`Sign-in failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      <label>
        <span className="small muted">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
        />
      </label>
      <button className="primary" type="submit" disabled={busy} style={{ marginTop: '0.75rem' }}>
        {busy ? 'Checking…' : 'Sign in'}
      </button>
      <p className="small muted" style={{ marginBottom: 0 }}>
        You stay signed in on this device for 30 days.
      </p>
    </form>
  );
}
