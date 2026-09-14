import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/db/client';
import { appPasswordHashEnv, appPasswordPlain } from './env';
import { MIN_PASSWORD_LENGTH, passwordProblem } from './password-rules';

/** One operator, one row. */
const AUTH_ID = 'operator';
const BCRYPT_COST = 12;

async function storedHash(): Promise<string | null> {
  const result = await db.execute(sql`
    select password_hash from app_auth where id = ${AUTH_ID}
  `);
  const row = (result.rows as unknown as { password_hash: string }[])[0];
  return row?.password_hash ?? null;
}

/**
 * True when nobody has chosen a password yet and no environment override is
 * set — the state a brand-new deploy starts in. The login page then asks for a
 * password instead of checking one.
 */
export async function isSetupRequired(): Promise<boolean> {
  if (appPasswordPlain() || appPasswordHashEnv()) return false;
  return (await storedHash()) === null;
}

/**
 * Claim the instance. Returns false if someone got there first, so two people
 * opening a fresh deploy at the same time cannot both set a password.
 */
export async function claimPassword(password: string): Promise<boolean> {
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const result = await db.execute(sql`
    insert into app_auth (id, password_hash)
    values (${AUTH_ID}, ${hash})
    on conflict (id) do nothing
  `);
  return (result.rowCount ?? 0) > 0;
}

/** Change the password. Only reachable by someone already signed in. */
export async function replacePassword(password: string): Promise<void> {
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  await db.execute(sql`
    insert into app_auth (id, password_hash)
    values (${AUTH_ID}, ${hash})
    on conflict (id) do update set password_hash = excluded.password_hash, updated_at = now()
  `);
}

/**
 * Verification order: an environment override always wins (it is the way back
 * in if the password is ever forgotten), otherwise the hash chosen on first run.
 */
export async function verifyPassword(password: string): Promise<boolean> {
  if (!password) return false;

  const plain = appPasswordPlain();
  if (plain) return safeEquals(password, plain);

  const hash = appPasswordHashEnv() ?? (await storedHash());
  if (!hash) return false;

  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export { MIN_PASSWORD_LENGTH, passwordProblem };

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
