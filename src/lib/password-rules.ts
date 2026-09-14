/**
 * Shared by the browser and the server, so it lives apart from lib/password.ts
 * (which pulls in bcrypt and the database and must never reach the client).
 */
export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
