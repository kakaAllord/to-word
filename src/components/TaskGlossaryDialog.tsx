'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { GlossaryTerm } from '@/db/schema';

/**
 * Glossary from inside a task (spec 10): global terms are visible, task terms
 * are editable here, and re-applying only touches unconfirmed segments.
 */
export default function TaskGlossaryDialog({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [wrong, setWrong] = useState('');
  const [right, setRight] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/glossary?taskId=${taskId}`);
    if (!response.ok) {
      setError(`Could not load the glossary (HTTP ${response.status}).`);
      return;
    }
    setTerms((await response.json()).terms);
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!wrong.trim() || !right.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/glossary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wrong, right, taskId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setWrong('');
      setRight('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/glossary/${id}`, { method: 'DELETE' });
    await load();
  }

  async function reapply() {
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/glossary`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setNote(
        `Updated ${payload.changed} unconfirmed segment${payload.changed === 1 ? '' : 's'}. Confirmed segments were left alone.`,
      );
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Glossary</h2>
        {error && <div className="banner error">{error}</div>}
        {note && <div className="banner info">{note}</div>}

        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 120px' }}>
            <span className="small muted">Wrong</span>
            <input type="text" value={wrong} onChange={(e) => setWrong(e.target.value)} placeholder="MIVAF" />
          </label>
          <label style={{ flex: '1 1 120px' }}>
            <span className="small muted">Right</span>
            <input type="text" value={right} onChange={(e) => setRight(e.target.value)} placeholder="MIVARF" />
          </label>
          <button className="primary" onClick={add} disabled={busy || !wrong.trim() || !right.trim()}>
            Add to this task
          </button>
        </div>

        <table style={{ marginTop: '0.9rem' }}>
          <thead>
            <tr>
              <th>Wrong</th>
              <th>Right</th>
              <th>Scope</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {terms.length === 0 && (
              <tr>
                <td colSpan={4} className="small muted">
                  No terms yet.
                </td>
              </tr>
            )}
            {terms.map((term) => (
              <tr key={term.id}>
                <td className="small">{term.wrong}</td>
                <td className="small">{term.right}</td>
                <td className="small muted">{term.taskId ? 'this task' : 'global'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="small ghost" onClick={() => remove(term.id)}>
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row" style={{ marginTop: '1rem' }}>
          <button onClick={reapply} disabled={busy}>
            Re-apply glossary
          </button>
          <span className="small muted">Unconfirmed segments only.</span>
          <span className="spacer" />
          <button className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
