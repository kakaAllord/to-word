'use client';

import { useState } from 'react';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-rules';

export default function ChangePassword({ overridden }: { overridden: boolean }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmation) {
      setError('The two new passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Password</h2>

      {overridden && (
        <div className="banner warn">
          <strong>APP_PASSWORD (or APP_PASSWORD_HASH) is set in the environment.</strong> While
          it is set, that value is what you sign in with and a change here has no effect.
          Remove the variable to use the stored password again.
        </div>
      )}

      {error && <div className="banner error">{error}</div>}
      {done && <div className="banner info">Password changed. It applies to the next sign-in.</div>}

      <form onSubmit={submit} style={{ display: 'grid', gap: '0.6rem', maxWidth: '24rem' }}>
        <label>
          <span className="small muted">Current password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label>
          <span className="small muted">New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />
        </label>
        <label>
          <span className="small muted">Type it again</span>
          <input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <div>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>

      <p className="small muted" style={{ marginBottom: 0 }}>
        Locked out? Set <code>APP_PASSWORD</code> in the Railway service variables and redeploy —
        that overrides the stored password until you remove it again.
      </p>
    </div>
  );
}
