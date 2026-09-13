import Link from 'next/link';
import Shell from '@/components/Shell';
import SystemBanners from '@/components/SystemBanners';
import UploadPanel from '@/components/UploadPanel';
import { hasElevenLabsKey, storageWarning } from '@/lib/env';
import { formatDuration } from '@/lib/format';
import { listTasks } from '@/lib/tasks';
import { getWorkerHealth } from '@/lib/worker-status';

export const dynamic = 'force-dynamic';

/**
 * Home: upload a file and see the whole batch at once. The status column
 * doubles as the invoicing view (spec 5) — $10 per completed file.
 */
export default async function HomePage() {
  const tasks = await listTasks();
  const worker = await getWorkerHealth().catch(() => null);
  const transcribing = tasks.filter(
    (t) => t.status === 'transcribing' || t.status === 'uploaded',
  ).length;
  const unpaid = tasks.filter((t) => t.status === 'delivered').length;
  const paid = tasks.filter((t) => t.status === 'paid').length;

  return (
    <Shell tasks={tasks} title="Tasks">
      <div className="content">
        <SystemBanners
          storageWarning={storageWarning()}
          missingKey={!hasElevenLabsKey()}
          worker={worker}
          transcribingCount={transcribing}
        />

        <UploadPanel />

        <div className="card">
          <h2>All tasks</h2>
          {tasks.length === 0 ? (
            <p className="muted small">
              No tasks yet. Upload an audio file above to get started.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Length</th>
                    <th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/tasks/${t.id}`}>{t.name}</Link>
                      </td>
                      <td>
                        <span className={`status ${t.status}`}>{t.status}</span>
                      </td>
                      <td className="small">
                        {t.total ? `${t.confirmed}/${t.total} (${Math.round(t.progress * 100)}%)` : '—'}
                      </td>
                      <td className="small">{formatDuration(t.durationSeconds)}</td>
                      <td className="small muted">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Invoicing</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {paid} file{paid === 1 ? '' : 's'} paid · {unpaid} delivered and awaiting
            payment{unpaid ? ` · $${unpaid * 10} outstanding at $10 per file` : ''}.
          </p>
        </div>
      </div>
    </Shell>
  );
}
