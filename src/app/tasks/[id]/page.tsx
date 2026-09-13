import { notFound } from 'next/navigation';
import Shell from '@/components/Shell';
import SystemBanners from '@/components/SystemBanners';
import TaskActions from '@/components/TaskActions';
import TranscribingPanel from '@/components/TranscribingPanel';
import Workbench from '@/components/Workbench';
import { hasElevenLabsKey, storageWarning } from '@/lib/env';
import { getWorkerHealth } from '@/lib/worker-status';
import {
  getLatestJob,
  getSegments,
  getSpeakerMap,
  getTask,
  listTasks,
} from '@/lib/tasks';

export const dynamic = 'force-dynamic';

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task) notFound();

  const [tasks, segments, speakerRows] = await Promise.all([
    listTasks(),
    getSegments(id),
    getSpeakerMap(id),
  ]);

  const inProgress =
    task.status === 'uploaded' || task.status === 'transcribing' || task.status === 'failed';

  if (inProgress && segments.length === 0) {
    const job = await getLatestJob(id);
    const worker = await getWorkerHealth().catch(() => null);
    return (
      <Shell tasks={tasks} title={task.name}>
        <div className="content" style={{ paddingBottom: 0 }}>
          <SystemBanners
            storageWarning={storageWarning()}
            missingKey={!hasElevenLabsKey()}
            worker={worker}
            transcribingCount={task.status === 'failed' ? 0 : 1}
          />
        </div>
        <TranscribingPanel
          task={task}
          job={
            job
              ? {
                  ...job,
                  createdAt: job.createdAt.toISOString(),
                  runAfter: job.runAfter.toISOString(),
                }
              : null
          }
        />
      </Shell>
    );
  }

  const unconfirmed = segments.filter((s) => !s.confirmed).length;

  return (
    <Shell
      tasks={tasks}
      title={task.name}
      actions={<TaskActions task={task} unconfirmed={unconfirmed} total={segments.length} />}
    >
      {task.error && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="banner error">
            <strong>Last transcription error:</strong>
            <pre>{task.error}</pre>
          </div>
        </div>
      )}
      <Workbench
        task={task}
        initialSegments={segments.map((s) => ({ ...s, updatedAt: s.updatedAt.toISOString() }))}
        speakerRows={speakerRows}
        hasAudio={Boolean(task.audioPath)}
      />
    </Shell>
  );
}
