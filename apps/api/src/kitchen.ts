import type { FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  kitchenDeleteSchema,
  operationKeySchema,
  pantryEditSchema,
  planDocumentSchema,
  planLockSchema,
  recordIdSchema,
  regularInclusionSchema,
  regularPurchaseEditSchema,
  resourceSchemas,
} from '@meal/contracts';
import {
  databaseFailure,
  parseDatabaseResponse,
  type Authenticate,
} from './foundation.js';

export function registerKitchenRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
) {
  app.get('/v1/kitchen-status', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { data, error } = await db.rpc('kitchen_ready');
    if (error?.code === 'PGRST202' || error?.code === '42883')
      return { available: false };
    if (error) throw databaseFailure(error.code);
    return { available: data === true };
  });
  const mutate = async (
    db: SupabaseClient,
    request: { headers: Record<string, unknown> },
    action: string,
    id: string,
    revision: number,
    payload: unknown,
  ) => {
    const key = operationKeySchema.parse(request.headers['idempotency-key']);
    const { data, error } = await db.rpc('apply_kitchen_mutation', {
      p_key: key,
      p_action: action,
      p_target: id,
      p_revision: revision,
      p_payload: payload,
    });
    if (error?.code === 'PGRST202' || error?.code === '42883')
      throw Object.assign(new Error('Kitchen setup is not available yet.'), {
        statusCode: 503,
        publicCode: 'FEATURE_NOT_READY',
      });
    if (error) throw databaseFailure(error.code);
    return data;
  };
  for (const [path, action, schema, resultSchema] of [
    ['pantry-items', 'pantry', pantryEditSchema, resourceSchemas.pantry_items],
    [
      'regular-purchases',
      'regular',
      regularPurchaseEditSchema,
      resourceSchemas.regular_purchases,
    ],
  ] as const) {
    app.put(`/v1/${path}/:id`, async (request) => {
      // Authenticate before parsing resource details, consistent with private routes.
      const { db } = await authenticate(request.headers.authorization);
      const { id } = z.object({ id: recordIdSchema }).parse(request.params);
      const { revision, ...payload } = schema.parse(request.body);
      return parseDatabaseResponse<unknown>(
        resultSchema,
        await mutate(db, request, `${action}.upsert`, id, revision, payload),
      );
    });
    app.delete(`/v1/${path}/:id`, async (request) => {
      const { db } = await authenticate(request.headers.authorization);
      const { id } = z.object({ id: recordIdSchema }).parse(request.params);
      const { revision } = kitchenDeleteSchema.parse(request.body);
      return z
        .object({ deleted: z.literal(true), id: recordIdSchema })
        .parse(await mutate(db, request, `${action}.delete`, id, revision, {}));
    });
  }
  app.put('/v1/grocery-lists/:id/regular-purchases', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    const { revision, ...payload } = regularInclusionSchema.parse(request.body);
    return parseDatabaseResponse(
      planDocumentSchema,
      await mutate(db, request, 'regular.include', id, revision, payload),
    );
  });
  app.put('/v1/plans/:id/lock', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    const { revision, ...payload } = planLockSchema.parse(request.body);
    return parseDatabaseResponse(
      planDocumentSchema,
      await mutate(db, request, 'plan.lock', id, revision, payload),
    );
  });
}
