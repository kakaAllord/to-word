import type { WorkerHealth } from '@/lib/worker-status';

/**
 * The three things that silently break this app in production: no volume, no
 * API key, no worker running. Each one is stated in plain language with the
 * fix, rather than showing up later as a task stuck on "transcribing".
 */
export default function SystemBanners({
  storageWarning,
  missingKey,
  worker,
  transcribingCount,
}: {
  storageWarning: string | null;
  missingKey: boolean;
  worker: WorkerHealth | null;
  transcribingCount: number;
}) {
  const workerDown = worker ? !worker.alive : false;
  const workerMatters = transcribingCount > 0;

  if (!storageWarning && !missingKey && !workerDown) return null;

  return (
    <>
      {storageWarning && (
        <div className="banner error" role="alert">
          <strong>Audio storage is not persistent.</strong>
          <div>{storageWarning}</div>
          <div className="small" style={{ marginTop: '0.35rem' }}>
            In Railway: service → Settings → Volumes → add a volume, mount path{' '}
            <code>/data/audio</code>. Transcripts, edits and confirmations live in Postgres
            and are safe regardless.
          </div>
        </div>
      )}

      {missingKey && (
        <div className="banner warn" role="alert">
          <strong>ELEVENLABS_API_KEY is not set.</strong> Uploads will queue but transcription
          will fail until you add it to the service variables.
        </div>
      )}

      {workerDown && (
        <div className={workerMatters ? 'banner error' : 'banner warn'} role="alert">
          <strong>The transcription worker is not running.</strong>{' '}
          {worker?.everSeen
            ? `It was last seen ${worker.secondsAgo}s ago.`
            : 'It has never checked in on this database.'}{' '}
          {workerMatters
            ? 'Files you upload will sit in the queue until it comes back.'
            : 'Nothing is queued right now, so nothing is stuck.'}
          <div className="small" style={{ marginTop: '0.35rem' }}>
            It normally runs inside this same container. Check the service logs for{' '}
            <code>[worker]</code> lines.
          </div>
        </div>
      )}
    </>
  );
}
