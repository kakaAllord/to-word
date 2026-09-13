import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { audioDir } from './env';

export async function ensureAudioDir(): Promise<string> {
  const dir = resolve(audioDir());
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Audio lives at <AUDIO_DIR>/<task id><ext>; the id keeps names collision-free. */
export function audioPathFor(taskId: string, originalName: string): string {
  const ext = (extname(originalName) || '.m4a').toLowerCase().slice(0, 8);
  return join(resolve(audioDir()), `${taskId}${ext}`);
}

/** Retention (spec 13): a paid task's audio is deleted; the transcript stays. */
export async function deleteAudioFile(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await unlink(path).catch(() => undefined);
}

const CONTENT_TYPES: Record<string, string> = {
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.flac': 'audio/flac',
};

export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Range-request response for a possibly large Opus file (spec 8.2). The browser
 * must be able to start playback and seek without downloading 50 minutes first.
 */
export async function audioResponse(path: string, rangeHeader: string | null): Promise<Response> {
  const info = await stat(path).catch(() => null);
  if (!info || !info.isFile()) {
    return new Response('Audio file not found', { status: 404 });
  }

  const size = info.size;
  const type = contentTypeFor(path);
  const baseHeaders: Record<string, string> = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
  };

  const match = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null;
  if (!match) {
    const stream = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream;
    return new Response(stream, {
      status: 200,
      headers: { ...baseHeaders, 'content-length': String(size) },
    });
  }

  const startRaw = match[1];
  const endRaw = match[2];
  let start: number;
  let end: number;
  if (startRaw === '') {
    // Suffix range: last N bytes.
    const suffix = Number(endRaw || '0');
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? size - 1 : Math.min(Number(endRaw), size - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return new Response('Range not satisfiable', {
      status: 416,
      headers: { 'content-range': `bytes */${size}` },
    });
  }

  const stream = Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream;
  return new Response(stream, {
    status: 206,
    headers: {
      ...baseHeaders,
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': String(end - start + 1),
    },
  });
}
