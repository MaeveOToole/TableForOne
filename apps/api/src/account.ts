import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Authenticate } from './foundation.js';

export function registerAccountRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
  adminFactory?: () => SupabaseClient,
) {
  async function ready(db: SupabaseClient) {
    if (!adminFactory) return false;
    const { data, error } = await db.rpc('account_deletion_ready');
    if (error || data !== true) return false;
    return true;
  }
  app.get('/v1/account/deletion-status', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    return { available: await ready(db) };
  });
  app.delete(
    '/v1/account',
    { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (request) => {
      const { db, userId } = await authenticate(request.headers.authorization);
      z.object({ confirmation: z.literal('DELETE') })
        .strict()
        .parse(request.body);
      if (!(await ready(db)))
        throw Object.assign(
          new Error(
            'Account deletion is not configured yet. No account was deleted.',
          ),
          {
            statusCode: 503,
            publicCode: 'DELETION_UNAVAILABLE',
          },
        );
      // The target always comes from verified authentication, never from a request ID.
      const { error } = await adminFactory!().auth.admin.deleteUser(
        userId,
        false,
      );
      if (error)
        throw Object.assign(
          new Error(
            'Deletion could not be confirmed. Retry shortly; if your account was already removed, you will need to sign out. No success has been recorded on this device.',
          ),
          {
            statusCode: 503,
            publicCode: 'DELETION_FAILED',
          },
        );
      return { deleted: true };
    },
  );
}

export function accountAdmin(url: string, key?: string) {
  return key
    ? () =>
        createClient(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        })
    : undefined;
}
