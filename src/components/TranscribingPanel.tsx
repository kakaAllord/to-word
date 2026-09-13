'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Job, Task } from '@/db/schema';

/**
 * Shown while a task is queued, transcribing or failed. Polls for the state
 * change so the operator can leave the tab open and watch, and shows the real
 * provider error verbatim when there is one (spec 15).
 */
export default function TranscribingPanel({
  task,
  job,
}: {
  task: Task;
  job: (Omit<Job, 'createdAt' | 'runAfter'> & { createdAt: string; runAfter: string }) | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const failed = task.status === 'failed';

  useEffect(() => {
    if (failed) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [failed, router]);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}/retry`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <div className="card">
        <h2>{failed ? 'Transcription failed' : 'Transcribing'}</h2>

        {failed ? (
          <>
            <p className="small muted">
              The audio is still on the server, so you can retry without uploading it again.
            </p>
            <div className="banner error">
              <strong>ElevenLabs / worker said:</strong>
              <pre>{task.error || job?.lastError || 'No message was recorded.'}</pre>
            </div>
          </>
        ) : (
          <p className="small muted">
            The worker is compressing the audio to 16 kHz mono Opus and sending it to ElevenLabs
            Scribe. A 50-minute interview usually takes a few minutes. You can close this tab —
            the work continues on the server.
          </p>
        )}

        {!failed && task.error && (
          <div className="banner warn">
            <strong>Last attempt failed and is being retried:</strong>
            <pre>{task.error}</pre>
          </div>
        )}

        {error && <div className="banner error">{error}</div>}

        <div className="row">
          <button className="primary" onClick={retry} disabled={busy || !task.audioPath}>
            {failed ? 'Retry transcription' : 'Requeue'}
          </button>
          <button onClick={() => router.refresh()} disabled={busy}>
            Refresh
          </button>
          {job && (
            <span className="small muted">
              job {job.state}, attempt {job.attempts}
            </span>
          )}
        </div>
      </div>

      <div className="card">
        <h2>File</h2>
        <table>
          <tbody>
            <tr>
              <th>Uploaded as</th>
              <td className="small">{task.sourceFilename || '—'}</td>
            </tr>
            <tr>
              <th>Stored at</th>
              <td className="small">{task.audioPath || 'deleted'}</td>
            </tr>
            <tr>
              <th>Provider</th>
              <td className="small">
                {task.provider} / {task.providerModel}
              </td>
            </tr>
            <tr>
              <th>Language</th>
              <td className="small">{task.language}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
