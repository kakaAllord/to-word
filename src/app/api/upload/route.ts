/**
 * Upload. The body is the raw audio bytes, streamed straight to the volume —
 * a 150 MB .m4a is never buffered in memory, and the browser gets real upload
 * progress from XHR. Metadata travels in the query string.
 *
 * The request returns as soon as the file is on disk and the job is queued.
 * Transcription happens in the worker (spec 4).
 */
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { task } from '@/db/schema';
import { withAuth } from '@/lib/http';
import { audioPathFor, ensureAudioDir } from '@/lib/audio';
import { maxUploadBytes, maxUploadMb } from '@/lib/env';
import { enqueueTranscription } from '@/lib/tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = withAuth(async (request: Request) => {
  const url = new URL(request.url);
  const filename = (url.searchParams.get('filename') || 'audio.m4a').trim();
  const name = (url.searchParams.get('name') || filename.replace(/\.[^.]+$/, '')).trim();
  if (!name) return Response.json({ error: 'A task name is required.' }, { status: 400 });
  if (!request.body) return Response.json({ error: 'No audio in request body.' }, { status: 400 });

  const declared = Number(request.headers.get('content-length') || '0');
  if (declared && declared > maxUploadBytes()) {
    return Response.json(
      { error: `File is larger than MAX_UPLOAD_MB (${maxUploadMb()} MB).` },
      { status: 413 },
    );
  }

  await ensureAudioDir();

  const [row] = await db
    .insert(task)
    .values({ name, status: 'uploaded', sourceFilename: filename })
    .returning();

  const destination = audioPathFor(row.id, filename);

  try {
    let written = 0;
    const limit = maxUploadBytes();
    const source = Readable.fromWeb(request.body as import('stream/web').ReadableStream);
    source.on('data', (chunk: Buffer) => {
      written += chunk.length;
      if (written > limit) source.destroy(new Error(`Upload exceeded ${maxUploadMb()} MB.`));
    });
    await pipeline(source, createWriteStream(destination));

    await db
      .update(task)
      .set({ audioPath: destination, updatedAt: new Date() })
      .where(eq(task.id, row.id));
  } catch (err) {
    await unlink(destination).catch(() => undefined);
    await db.delete(task).where(eq(task.id, row.id));
    return Response.json({ error: `Upload failed: ${(err as Error).message}` }, { status: 400 });
  }

  await enqueueTranscription(row.id);

  return Response.json({ id: row.id, name: row.name, status: 'transcribing' }, { status: 201 });
});
