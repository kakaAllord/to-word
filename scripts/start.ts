/**
 * Container entrypoint: migrate, then run the web server and the queue worker
 * side by side in one Railway service.
 *
 * The spec's two-service split is still supported (run `npm run start:web` and
 * `npm run worker` separately, sharing the volume). This process exists so the
 * common case — one service, one volume, one set of variables — needs no
 * assembly at all.
 *
 * Supervision rules:
 *   - the worker is restarted forever, with backoff; a crashed worker must
 *     never take the UI down with it
 *   - if the web server exits, the whole container exits so Railway restarts it
 *   - SIGTERM/SIGINT are forwarded, then everything is given time to finish
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { runMigrations } from '@/db/migrate';
import { storageWarning, hasElevenLabsKey, usingBuiltInPassword } from '@/lib/env';

const WORKER_RESTART_MIN_MS = 2000;
const WORKER_RESTART_MAX_MS = 30_000;

function log(message: string): void {
  console.log(`[start ${new Date().toISOString()}] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** npm is always on PATH in the image, and this stays portable across OSes. */
function run(script: string): ChildProcess {
  return spawn('npm', ['run', script], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, WORKER_RUN_MIGRATIONS: 'false' },
  });
}

/**
 * Neon suspends idle databases, so the first connection after a deploy can be
 * slow or refused. Retry rather than crash-looping the container.
 */
async function migrateWithRetry(): Promise<void> {
  const attempts = 8;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await runMigrations();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === attempts) {
        log(`migrations failed after ${attempts} attempts: ${message}`);
        throw error;
      }
      const wait = Math.min(1000 * 2 ** (attempt - 1), 15_000);
      log(`migration attempt ${attempt} failed (${message}); retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
}

function preflight(): void {
  const warning = storageWarning();
  if (warning) {
    log('');
    log('  WARNING ------------------------------------------------------');
    log(`  ${warning}`);
    log('  --------------------------------------------------------------');
    log('');
  }
  if (!hasElevenLabsKey()) {
    log(
      'WARNING: ELEVENLABS_API_KEY is not set. Uploads will queue but transcription will fail until you add it.',
    );
  }
  if (usingBuiltInPassword()) {
    log(
      'NOTE: signing in with the password built into this repository. Set APP_PASSWORD in the service variables to change it.',
    );
  }
}

async function main(): Promise<void> {
  log('starting to-word');
  preflight();
  await migrateWithRetry();

  let shuttingDown = false;
  let workerBackoff = WORKER_RESTART_MIN_MS;
  let worker: ChildProcess | null = null;
  let web: ChildProcess | null = null;

  const startWorker = () => {
    if (shuttingDown) return;
    worker = run('worker');
    log(`worker started (pid ${worker.pid})`);
    worker.on('exit', (code, signal) => {
      if (shuttingDown) return;
      log(`worker exited (code ${code}, signal ${signal}); restarting in ${workerBackoff}ms`);
      setTimeout(startWorker, workerBackoff);
      workerBackoff = Math.min(workerBackoff * 2, WORKER_RESTART_MAX_MS);
    });
    // A worker that stays up for a while has recovered; reset the backoff.
    setTimeout(() => {
      if (worker && !worker.killed) workerBackoff = WORKER_RESTART_MIN_MS;
    }, 60_000);
  };

  const startWeb = () => {
    web = run('start:web');
    log(`web started (pid ${web.pid})`);
    web.on('exit', (code, signal) => {
      if (shuttingDown) return;
      log(`web server exited (code ${code}, signal ${signal}); shutting down so the platform restarts us`);
      void shutdown(code ?? 1);
    });
  };

  const shutdown = async (code: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of [worker, web]) {
      if (child && child.exitCode === null) child.kill('SIGTERM');
    }
    // Give the worker a moment to finish the statement it is in.
    await sleep(3000);
    for (const child of [worker, web]) {
      if (child && child.exitCode === null) child.kill('SIGKILL');
    }
    process.exit(code);
  };

  process.on('SIGTERM', () => {
    log('SIGTERM received');
    void shutdown(0);
  });
  process.on('SIGINT', () => {
    log('SIGINT received');
    void shutdown(0);
  });

  startWorker();
  startWeb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
