import { toNextJsHandler } from 'better-auth/next-js';
import { isBetterAuth } from '@/lib/auth/provider';

/**
 * Better Auth's endpoints (sign-in, sign-up, OAuth callbacks, sessions,
 * admin). Answers 404 until AUTH_PROVIDER=better-auth, so nobody can create
 * accounts in the new system before the migration cuts over.
 * /api/auth/session (Firebase) is a separate static route and wins over this one.
 */
const notEnabled = () => new Response('Not found', { status: 404 });

async function handle(request: Request): Promise<Response> {
  if (!isBetterAuth()) return notEnabled();
  const { auth } = await import('@/lib/auth/betterAuth');
  const { GET, POST } = toNextJsHandler(auth);
  return request.method === 'GET' ? GET(request) : POST(request);
}

export const GET = handle;
export const POST = handle;
