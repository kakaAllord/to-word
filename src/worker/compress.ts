/**
 * Compress to 16 kHz mono Opus before sending anything (spec 6.1).
 *
 * Every ASR model resamples to 16 kHz mono internally, so this costs no
 * accuracy and ~95% of the bytes. The compressed file is also what the browser
 * streams back during proofreading, which keeps playback cheap on a slow line.
 */
import { spawn } from 'node:child_process';
import { stat, unlink } from 'node:fs/promises';
import { ffmpegPath } from '@/lib/env';

function run(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });
    child.on('error', (err) => {
      const hint =
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? ` — ffmpeg not found at "${ffmpegPath()}". Install ffmpeg or set FFMPEG_PATH.`
          : '';
      reject(new Error(`ffmpeg failed to start: ${err.message}${hint}`));
    });
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }));
  });
}

export async function compressToOpus(input: string, output: string): Promise<void> {
  const { code, stderr } = await run([
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', input,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'libopus',
    '-b:a', '16k',
    output,
  ]);
  if (code !== 0) {
    throw new Error(`ffmpeg exited ${code}: ${stderr.trim() || 'no output'}`);
  }
  const info = await stat(output).catch(() => null);
  if (!info || info.size === 0) {
    throw new Error('ffmpeg produced an empty file.');
  }
}

/**
 * Duration in seconds from ffmpeg's own stderr summary (no ffprobe dependency).
 * Passing no output makes ffmpeg print the input header and exit immediately,
 * so this stays instant even on a 50-minute file.
 */
export async function probeDuration(input: string): Promise<number | null> {
  const { stderr } = await run(['-hide_banner', '-i', input]);
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2}\.?\d*)/.exec(stderr);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export async function removeIfExists(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await unlink(path).catch(() => undefined);
}
