import { isAuthenticated } from './auth';

/**
 * Unwrap the message an operator actually needs (spec 15). Drizzle wraps driver
 * errors ("Failed query: select 1") and puts the useful text on `cause`, which
 * is exactly the part that says the database is unreachable.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts: string[] = [error.message];
  let cause = (error as { cause?: unknown }).cause;
  let depth = 0;
  while (cause instanceof Error && depth < 4) {
    if (!parts.includes(cause.message)) parts.push(cause.message);
    cause = (cause as { cause?: unknown }).cause;
    depth++;
  }
  return parts.join(' — ');
}

type Handler<C> = (request: Request, context: C) => Promise<Response> | Response;

/**
 * Every API route except /api/health and /api/login sits behind the password
 * (spec 12), and every failure comes back with its real message rather than a
 * bare 500.
 */
export function withAuth<C>(handler: Handler<C>): Handler<C> {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      if (!(await isAuthenticated())) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
      }
      return await handler(request, context);
    } catch (error) {
      if (error instanceof Response) return error;
      const message = describeError(error);
      console.error(`[api] ${request.method} ${new URL(request.url).pathname}: ${message}`);
      return Response.json({ error: message }, { status: 500 });
    }
  };
}
