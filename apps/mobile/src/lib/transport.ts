import { supabase } from './supabase';
import { withDeadline } from './deadline';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api(
  path: string,
  method = 'GET',
  body?: unknown,
  retryKey?: string,
  expectedOwner?: string,
) {
  // An operation key identifies this invocation; keep it unchanged if adding transport retries.
  const operationKey =
    method === 'GET'
      ? undefined
      : retryKey ||
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const {
    data: { session },
  } = await withDeadline(
    supabase.auth.getSession(),
    10000,
    'Session check timed out. Retry or sign in again.',
  );
  const controller = new AbortController();
  if (expectedOwner && session?.user.id !== expectedOwner)
    throw new Error('Sign in to the same account to sync these edits.');
  const timer = setTimeout(
    () => controller.abort(),
    path.startsWith('/assistant/') ? 45000 : 15000,
  );
  try {
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3000'}/v1${path}`,
      {
        method,
        signal: controller.signal,
        headers: {
          // Fastify rejects an empty body advertised as JSON (save/remove use no body).
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(operationKey ? { 'Idempotency-Key': operationKey } : {}),
          ...(session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    if (!response.ok) {
      const data = await response.json();
      throw new ApiError(
        data.error?.message || 'Request failed. Please retry.',
        response.status,
      );
    }
    return response.status === 204 ? undefined : response.json();
  } catch (error) {
    if (error instanceof TypeError)
      throw new Error(
        'The recipe service cannot be reached. Check the connection and retry.',
        { cause: error },
      );
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error('The recipe service took too long. Please retry.', {
        cause: error,
      });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
