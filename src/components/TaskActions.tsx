'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import type { Task } from '@/db/schema';
import TaskGlossaryDialog from './TaskGlossaryDialog';

/**
 * Top-bar actions for one task: export, speaker mapping, glossary, lifecycle
 * and retry. Kept in the bar so the transcript keeps the whole page below it.
 */
export default function TaskActions({
  task,
  unconfirmed,
  total,
}: {
  task: Task;
  unconfirmed: number;
  total: number;
}) {
  const router = useRouter();
  const [showExport, setShowExport] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [format, setFormat] = useState<'docx' | 'md'>('docx');
  const [timestamps, setTimestamps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patchTask(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}/retry`, { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete "${task.name}" and its transcript for good? This cannot be undone.`,
      )
    ) {
      return;
    }
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    router.push('/');
    router.refresh();
  }

  function download() {
    const query = new URLSearchParams({ format, ...(timestamps ? { timestamps: '1' } : {}) });
    window.location.href = `/api/tasks/${task.id}/export?${query.toString()}`;
    setShowExport(false);
  }

  return (
    <div className="row">
      {error && (
        <span className="small" style={{ color: 'var(--danger)' }}>
          {error}
        </span>
      )}

      <Link href={`/tasks/${task.id}/speakers`} className="small">
        Speakers
      </Link>

      <button className="small" onClick={() => setShowGlossary(true)}>
        Glossary
      </button>

      {task.status === 'failed' && (
        <button className="small primary" onClick={retry} disabled={busy}>
          Retry transcription
        </button>
      )}

      {task.status === 'proofreading' && (
        <button className="small" onClick={() => patchTask({ status: 'delivered' })} disabled={busy}>
          Mark delivered
        </button>
      )}

      {task.status === 'delivered' && (
        <button
          className="small"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                'Mark this task paid? The audio file is deleted to keep storage flat; the transcript is kept forever.',
              )
            ) {
              void patchTask({ status: 'paid' });
            }
          }}
        >
          Mark paid ($10)
        </button>
      )}

      <button className="small primary" onClick={() => setShowExport(true)} disabled={total === 0}>
        Export
      </button>

      <button className="small ghost danger" onClick={remove} title="Delete this task">
        Delete
      </button>

      {showExport && (
        <div className="dialog-backdrop" onClick={() => setShowExport(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Export transcript</h2>
            {unconfirmed > 0 && (
              <div className="banner warn">
                {unconfirmed} of {total} segments are still unconfirmed. You can export anyway.
              </div>
            )}
            <p className="small muted">
              Exports your edited text in the client&apos;s house style: title line, then one
              paragraph per turn prefixed with the speaker label.
            </p>

            <div style={{ display: 'grid', gap: '0.5rem', margin: '0.75rem 0' }}>
              <label className="row">
                <input
                  type="radio"
                  name="format"
                  checked={format === 'docx'}
                  onChange={() => setFormat('docx')}
                  style={{ width: 'auto' }}
                />
                <span>Word (.docx) — the deliverable</span>
              </label>
              <label className="row">
                <input
                  type="radio"
                  name="format"
                  checked={format === 'md'}
                  onChange={() => setFormat('md')}
                  style={{ width: 'auto' }}
                />
                <span>Markdown (.md)</span>
              </label>
              <label className="row">
                <input
                  type="checkbox"
                  checked={timestamps}
                  onChange={(e) => setTimestamps(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <span>
                  Include timestamps <span className="muted">(for your own use, not the client)</span>
                </span>
              </label>
            </div>

            <div className="row">
              <button className="primary" onClick={download}>
                Download
              </button>
              <button onClick={() => setShowExport(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showGlossary && (
        <TaskGlossaryDialog taskId={task.id} onClose={() => setShowGlossary(false)} />
      )}
    </div>
  );
}
