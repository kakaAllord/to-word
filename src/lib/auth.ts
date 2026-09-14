import { cookies } from 'next/headers';
import { SESSION_COOKIE, isValidSessionValue } from './session';

export { verifyPassword as checkPassword } from './password';

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return isValidSessionValue(jar.get(SESSION_COOKIE)?.value);
}
