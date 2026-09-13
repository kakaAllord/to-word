/**
 * Signed session cookie. One operator, one password, no accounts (spec 12).
 *
 * Uses Web Crypto so the same code runs in middleware (edge) and in route
 * handlers (node). Cookie value is `<expiryMs>.<hmac>`; there is no user id to
 * carry, only "this browser authenticated and the signature proves it".
 */
import { sessionSecret } from './env';

export const SESSION_COOKIE = 'tw_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

let keyPromise: Promise<CryptoKey> | null = null;

function hmacKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(sessionSecret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  }
  return keyPromise;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sign(payload: string): Promise<string> {
  const key = await hmacKey();
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

/** Constant-time string compare (both sides are hex of fixed length). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionValue(now = Date.now()): Promise<string> {
  const expiry = String(now + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expiry}.${await sign(expiry)}`;
}

export async function isValidSessionValue(
  value: string | undefined | null,
  now = Date.now(),
): Promise<boolean> {
  if (!value) return false;
  const dot = value.indexOf('.');
  if (dot <= 0) return false;
  const expiry = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  if (!/^\d+$/.test(expiry)) return false;
  if (Number(expiry) < now) return false;
  return safeEqual(mac, await sign(expiry));
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}
