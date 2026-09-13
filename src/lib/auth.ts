import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { appPasswordHash, appPasswordPlain } from './env';
import { SESSION_COOKIE, isValidSessionValue } from './session';

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    // Still do the comparison so the timing does not leak the length.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Node-only. APP_PASSWORD (plain, set in the dashboard) wins if present;
 * otherwise the bcrypt hash — either APP_PASSWORD_HASH or the built-in one.
 */
export async function checkPassword(password: string): Promise<boolean> {
  if (!password) return false;
  const plain = appPasswordPlain();
  if (plain) return constantTimeEquals(password, plain);
  try {
    return await bcrypt.compare(password, appPasswordHash());
  } catch {
    return false;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return isValidSessionValue(jar.get(SESSION_COOKIE)?.value);
}
