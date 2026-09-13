/**
 * The transcription pipeline (spec 6). Runs entirely in the worker — never
 * inside an HTTP request, because a Scribe call on a 50-minute file takes
 * minutes and a rate-limit retry takes longer.
 */
import { rename, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { glossaryTerm, segment, task, type Task } from '@/db/schema';
import { audioDir } from '@/lib/env';
import { applyGlossary, type Term } from '@/lib/glossary';
import { getProvider } from '@/providers';
import { compressToOpus, probeDuration, removeIfExists } from './compress';

export type Logger = (message: string) => void;

/** Terms for this task: every global term plus every task-scoped term. */
export async function loadTerms(taskId: string): Promise<Term[]> {
  const rows = await db
    .select({ wrong: glossaryTerm.wrong, right: glossaryTerm.right })
    .from(glossaryTerm)
    .where(or(isNull(glossaryTerm.taskId), eq(glossaryTerm.taskId, taskId)));
  return rows;
}

/**
 * Step 6.1. Converts the uploaded file to 16 kHz mono Opus, stores the Opus
 * file and discards the original. Idempotent: an already-compressed file is
 * left alone so a retry does not re-encode.
 */
export async function ensureCompressed(row: Task, log: Logger): Promise<Task> {
  if (!row.audioPath) {
    throw new Error('Task has no audio file. Re-upload the audio.');
  }
  const exists = await stat(row.audioPath).catch(() => null);
  if (!exists) {
    throw new Error(
      `Audio file is missing at ${row.audioPath}. If this followed a redeploy, the file was written to the ephemeral filesystem instead of the mounted volume — check AUDIO_DIR.`,
    );
  }
  if (extname(row.audioPath).toLowerCase() === '.ogg') {
    return row;
  }

  const duration = await probeDuration(row.audioPath);
  const target = join(audioDir(), `${row.id}.ogg`);
  const beforeMb = (exists.size / 1024 / 1024).toFixed(1);
  log(`compressing ${row.audioPath} (${beforeMb} MB) -> ${target}`);
  await compressToOpus(row.audioPath, target);
  const after = await stat(target);
  log(`compressed to ${(after.size / 1024 / 1024).toFixed(1)} MB`);

  const original = row.audioPath;
  const [updated] = await db
    .update(task)
    .set({
      audioPath: target,
      durationSeconds: duration ?? row.durationSeconds,
      updatedAt: new Date(),
    })
    .where(eq(task.id, row.id))
    .returning();

  // Only after the DB points at the Opus file do we drop the original.
  await removeIfExists(original);
  return updated;
}

/** Steps 6.2–6.4: transcribe, build segments, apply the glossary. */
export async function transcribeTask(taskId: string, log: Logger): Promise<void> {
  const [row] = await db.select().from(task).where(eq(task.id, taskId));
  if (!row) throw new Error(`Task ${taskId} no longer exists.`);

  await db
    .update(task)
    .set({ status: 'transcribing', error: null, updatedAt: new Date() })
    .where(eq(task.id, taskId));

  const compressed = await ensureCompressed(row, log);

  const provider = getProvider(compressed.provider);
  log(`transcribing with ${provider.name}/${compressed.providerModel ?? provider.defaultModel}`);
  const result = await provider.transcribe(compressed.audioPath!, {
    model: compressed.providerModel ?? undefined,
    language: compressed.language ?? undefined,
  });
  log(`received ${result.turns.length} turns`);

  const terms = await loadTerms(taskId);
  const rows = result.turns.map((turn, idx) => {
    const text = turn.text;
    return {
      taskId,
      idx,
      startSeconds: turn.start,
      endSeconds: Math.max(turn.end, turn.start),
      rawSpeaker: turn.speaker,
      // original_text is the machine transcript and is never mutated again.
      originalText: text,
      // Step 6.4: the glossary only ever touches edited_text.
      editedText: applyGlossary(text, terms),
      confirmed: false,
    };
  });

  const lastEnd = rows.length ? rows[rows.length - 1].endSeconds : null;

  await db.transaction(async (tx) => {
    // A retry replaces the machine output wholesale; there is no proofreading
    // to lose, because a task only reaches here from uploaded/transcribing.
    await tx.delete(segment).where(eq(segment.taskId, taskId));
    for (let i = 0; i < rows.length; i += 200) {
      await tx.insert(segment).values(rows.slice(i, i + 200));
    }
    await tx
      .update(task)
      .set({
        status: 'proofreading',
        error: null,
        language: result.language ?? compressed.language,
        durationSeconds: compressed.durationSeconds ?? lastEnd,
        updatedAt: new Date(),
      })
      .where(eq(task.id, taskId));
  });

  log(`task ${taskId} ready for proofreading (${rows.length} segments)`);
}

/**
 * Re-apply the glossary to UNCONFIRMED segments only (spec 10). Confirmed work
 * is never overwritten.
 */
export async function reapplyGlossary(taskId: string): Promise<number> {
  const terms = await loadTerms(taskId);
  if (terms.length === 0) return 0;

  const rows = await db
    .select()
    .from(segment)
    .where(and(eq(segment.taskId, taskId), eq(segment.confirmed, false)));

  let changed = 0;
  for (const row of rows) {
    const next = applyGlossary(row.editedText, terms);
    if (next !== row.editedText) {
      await db
        .update(segment)
        .set({ editedText: next, updatedAt: new Date() })
        .where(eq(segment.id, row.id));
      changed++;
    }
  }
  return changed;
}
