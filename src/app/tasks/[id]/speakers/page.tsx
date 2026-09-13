import Link from 'next/link';
import { notFound } from 'next/navigation';
import Shell from '@/components/Shell';
import SpeakerMapper from '@/components/SpeakerMapper';
import { speakerStats } from '@/lib/speakers';
import { getSegments, getSpeakerMap, getTask, listTasks } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

export default async function SpeakersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task) notFound();

  const [tasks, segments, map] = await Promise.all([
    listTasks(),
    getSegments(id),
    getSpeakerMap(id),
  ]);

  return (
    <Shell
      tasks={tasks}
      title={`${task.name} — speakers`}
      actions={
        <Link href={`/tasks/${id}`} className="small">
          Back to transcript
        </Link>
      }
    >
      <SpeakerMapper
        taskId={id}
        stats={speakerStats(segments)}
        initialMap={map}
        hasAudio={Boolean(task.audioPath)}
      />
    </Shell>
  );
}
