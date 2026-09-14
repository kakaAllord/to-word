/**
 * Environment access.
 *
 * The deploy is meant to be turnkey: push the repo, add the service, paste two
 * variables, done. So everything that CAN have a safe default has one, and the
 * two things that cannot (the database and the ElevenLabs key) fail loudly.
 */
function required(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. ${hint}`);
  }
  return value;
}

/* ---------------- database ---------------- */

/**
 * Accepts the common aliases so a Railway Postgres reference, a Neon string or
 * a local compose database all work without renaming anything.
 */
export function databaseUrl(): string {
  const value =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_PRIVATE_URL ||
    process.env.DATABASE_PUBLIC_URL;
  if (!value) {
    throw new Error(
      'No database configured. Set DATABASE_URL to your Neon POOLED connection string (the host with "-pooler" in it).',
    );
  }
  return value;
}

/* ---------------- session ---------------- */

/**
 * SESSION_SECRET is optional. When it is not set, the signing key is derived
 * from the database URL, which is always present, never leaves the server, and
 * stays stable across deploys — so sessions survive a redeploy without anyone
 * having to generate and paste a random string.
 *
 * Set SESSION_SECRET explicitly to rotate every session at once.
 */
export function sessionSecret(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit) {
    if (explicit.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters.');
    }
    return explicit;
  }
  // Plain string, not a hash: this module is also loaded by the edge-runtime
  // middleware, where node:crypto does not exist. The HMAC in session.ts
  // accepts a key of any length, and the database URL is already a secret.
  return `to-word/session/v1:${databaseUrl()}`;
}

/* ---------------- password ---------------- */

/*
 * There is no password in this repository. The operator chooses one the first
 * time the app is opened and it is stored as a bcrypt hash in the database
 * (see lib/password.ts). The two variables below are escape hatches: set
 * either one to override the stored password, which is how you get back in if
 * it is ever forgotten.
 */

/** Plain-text override, for resetting from the Railway dashboard. */
export function appPasswordPlain(): string | null {
  return process.env.APP_PASSWORD || null;
}

/** bcrypt-hash override, from `npm run hash-password`. */
export function appPasswordHashEnv(): string | null {
  return process.env.APP_PASSWORD_HASH || null;
}

export function passwordOverrideSet(): boolean {
  return Boolean(appPasswordPlain() || appPasswordHashEnv());
}

/* ---------------- provider ---------------- */

export function elevenLabsApiKey(): string {
  return required(
    'ELEVENLABS_API_KEY',
    'Create one at elevenlabs.io and add it to the Railway service variables.',
  );
}

export function hasElevenLabsKey(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/* ---------------- storage ---------------- */

/** True when running on Railway (it injects this on every service). */
export function onRailway(): boolean {
  return Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
}

/** Railway injects this on any service with a volume attached. */
export function railwayVolumePath(): string | null {
  return process.env.RAILWAY_VOLUME_MOUNT_PATH || null;
}

/**
 * Where audio files live. A mounted volume is picked up automatically, so the
 * only thing the deploy needs is the volume itself — no AUDIO_DIR to set.
 */
export function audioDir(): string {
  if (process.env.AUDIO_DIR) return process.env.AUDIO_DIR;
  const volume = railwayVolumePath();
  if (volume) return volume;
  return onRailway() ? '/data/audio' : './audio-data';
}

/**
 * The worst failure this app can have is losing an afternoon of proofreading to
 * a routine redeploy. On Railway that happens when no volume is attached, so
 * say so loudly — at boot and in the UI — rather than discovering it later.
 */
export function storageWarning(): string | null {
  if (!onRailway()) return null;
  if (railwayVolumePath()) return null;
  if (process.env.AUDIO_DIR) {
    return `AUDIO_DIR is set to ${process.env.AUDIO_DIR}, but no Railway volume is attached to this service. Railway wipes the container filesystem on every deploy and restart, so uploaded audio will disappear. Attach a volume mounted at /data/audio.`;
  }
  return 'No volume is attached to this service. Railway wipes the container filesystem on every deploy and restart, so uploaded audio will be lost. Attach a volume mounted at /data/audio — transcripts are safe in Postgres either way.';
}

/* ---------------- misc ---------------- */

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB || '200');
  return (Number.isFinite(mb) && mb > 0 ? mb : 200) * 1024 * 1024;
}

export function maxUploadMb(): number {
  return Math.round(maxUploadBytes() / (1024 * 1024));
}

export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}
