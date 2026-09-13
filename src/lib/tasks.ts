import { and, asc, count, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  glossaryTerm,
  job,
  segment,
  speakerMap,
  task,
  type Task,
  type TaskStatus,
} from '@/db/schema';

export type TaskSummary = Task & {
  total: number;
  confirmed: number;
  /** 0..1; a task with no segments yet reads as 0. */
  progress: number;
};

export async function listTasks(): Promise<TaskSummary[]> {
  const tasks = await db.select().from(task).orderBy(desc(task.createdAt));
  if (tasks.length === 0) return [];

  const counts = await db
    .select({
      taskId: segment.taskId,
      total: count(),
      confirmed: sql<number>`sum(case when ${segment.confirmed} then 1 else 0 end)::int`,
    })
    .from(segment)
    .groupBy(segment.taskId);

  const byTask = new Map(counts.map((c) => [c.taskId, c]));
  return tasks.map((t) => {
    const c = byTask.get(t.id);
    const total = Number(c?.total ?? 0);
    const confirmed = Number(c?.confirmed ?? 0);
    return { ...t, total, confirmed, progress: total ? confirmed / total : 0 };
  });
}

export async function getTask(id: string): Promise<Task | null> {
  const [row] = await db.select().from(task).where(eq(task.id, id));
  return row ?? null;
}

export async function getSegments(taskId: string) {
  return db
    .select()
    .from(segment)
    .where(eq(segment.taskId, taskId))
    .orderBy(asc(segment.idx));
}

export async function getSpeakerMap(taskId: string) {
  return db.select().from(speakerMap).where(eq(speakerMap.taskId, taskId));
}

export async function getGlossary(taskId: string | null) {
  return db
    .select()
    .from(glossaryTerm)
    .where(
      taskId === null
        ? isNull(glossaryTerm.taskId)
        : or(isNull(glossaryTerm.taskId), eq(glossaryTerm.taskId, taskId)),
    )
    .orderBy(asc(glossaryTerm.createdAt));
}

export async function getLatestJob(taskId: string) {
  const [row] = await db
    .select()
    .from(job)
    .where(eq(job.taskId, taskId))
    .orderBy(desc(job.createdAt))
    .limit(1);
  return row ?? null;
}

/** Enqueue transcription. The web app never transcribes in-request (spec 4). */
export async function enqueueTranscription(taskId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Clear out any dead job for this task so retries start clean.
    await tx
      .delete(job)
      .where(and(eq(job.taskId, taskId), or(eq(job.state, 'failed'), eq(job.state, 'done'))));
    await tx.insert(job).values({ taskId, state: 'queued' });
    await tx
      .update(task)
      .set({ status: 'transcribing', error: null, updatedAt: new Date() })
      .where(eq(task.id, taskId));
  });
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<Task | null> {
  const now = new Date();
  const patch: Partial<Task> = { status, updatedAt: now };
  if (status === 'delivered') patch.deliveredAt = now;
  if (status === 'paid') {
    patch.paidAt = now;
    if (!patch.deliveredAt) patch.deliveredAt = now;
  }
  const [row] = await db.update(task).set(patch).where(eq(task.id, id)).returning();
  return row ?? null;
}
