'use client';

import { useState } from 'react';
import type { GlossaryTerm } from '@/db/schema';

/** Global terms apply to every task, at transcription time and on re-apply. */
export default function GlobalGlossary({ initialTerms }: { initialTerms: GlossaryTerm[] }) {
  const [terms, setTerms] = useState(initialTerms);
  const [wrong, setWrong] = useState('');
  const [right, setRight] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch('/api/glossary');
    if (response.ok) setTerms((await response.json()).terms);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!wrong.trim() || !right.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/glossary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wrong, right }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setWrong('');
      setRight('');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/glossary/${id}`, { method: 'DELETE' });
    await refresh();
  }

  return (
    <>
      <div className="card">
        <h2>Global glossary</h2>
        <p className="small muted">
          Case-insensitive, whole-word <code>wrong → right</code> replacements, applied to every
          task right after transcription. They only ever touch your editable text; the machine
          transcript is kept untouched underneath.
        </p>
        {error && <div className="banner error">{error}</div>}

        <form className="row" onSubmit={add} style={{ alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 160px' }}>
            <span className="small muted">Wrong</span>
            <input type="text" value={wrong} onChange={(e) => setWrong(e.target.value)} placeholder="MIVAF" />
          </label>
          <label style={{ flex: '1 1 160px' }}>
            <span className="small muted">Right</span>
            <input type="text" value={right} onChange={(e) => setRight(e.target.value)} placeholder="MIVARF" />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            Add term
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Terms</h2>
        <table>
          <thead>
            <tr>
              <th>Wrong</th>
              <th>Right</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {terms.length === 0 && (
              <tr>
                <td colSpan={3} className="small muted">
                  No global terms yet.
                </td>
              </tr>
            )}
            {terms.map((term) => (
              <tr key={term.id}>
                <td>{term.wrong}</td>
                <td>{term.right}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="small ghost" onClick={() => remove(term.id)}>
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Numbers</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Scribe writes numbers as Swahili words (<em>elfu mbili na kumi na nne</em> = 2014).
          Automatic conversion is deliberately not attempted — it is ambiguous enough to corrupt
          the transcript silently. Add the recurring cases here and type the rest.
        </p>
      </div>
    </>
  );
}
