'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-rules';

/**
 * Two modes on one screen. On a brand-new deploy nobody has a password yet, so
 * this asks the operator to choose one; after that it just asks for it.
 */
export default function LoginForm({
  next,
  setupRequired,
}: {
  next?: string;
  setupRequired: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (setupRequired) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirmation) {
        setError('The two passwords do not match.');
        return;
      }
    }

    setBusy(true);
    try {
      const response = await fetch(setupRequired ? '/api/setup' : '/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        router.push(next && next.startsWith('/') ? next : '/');
        router.refresh();
        return;
      }
      const payload = await response.json().catch(() => ({}));
      setError(payload.error || `Failed (HTTP ${response.status}).`);
      if (response.status === 409) {
        // Someone else claimed the instance; reload into sign-in mode.
        setTimeout(() => router.refresh(), 1500);
      }
    } catch (err) {
      setError(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {setupRequired && (
        <p className="small muted" style={{ marginTop: 0 }}>
          Nobody has set a password for this installation yet. Choose one now — it is stored
          as a hash, and it is the only way in afterwards.
        </p>
      )}

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      <label>
        <span className="small muted">{setupRequired ? 'Choose a password' : 'Password'}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete={setupRequired ? 'new-password' : 'current-password'}
          minLength={setupRequired ? MIN_PASSWORD_LENGTH : undefined}
        />
      </label>

      {setupRequired && (
        <label style={{ display: 'block', marginTop: '0.6rem' }}>
          <span className="small muted">Type it again</span>
          <input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="new-password"
          />
        </label>
      )}

      <button className="primary" type="submit" disabled={busy} style={{ marginTop: '0.75rem' }}>
        {busy ? 'Working…' : setupRequired ? 'Set password and start' : 'Sign in'}
      </button>

      <p className="small muted" style={{ marginBottom: 0 }}>
        You stay signed in on this device for 30 days.
      </p>
    </form>
  );
}
