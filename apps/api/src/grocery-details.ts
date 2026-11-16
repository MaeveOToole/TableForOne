import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  groceryDetailsSchema,
  paginationSchema,
  operationKeySchema,
  recordIdSchema,
  resourceSchemas,
} from '@meal/contracts';
import {
  databaseFailure,
  parseDatabaseResponse,
  type Authenticate,
} from './foundation.js';
export function registerGroceryDetailsRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
) {
  app.get('/v1/grocery-lists/:id/items', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    const { offset, limit } = paginationSchema.parse(request.query);
    const list = await db
      .from('grocery_lists')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (list.error) throw databaseFailure(list.error.code);
    if (!list.data) throw databaseFailure('P0001');
    const { data, error } = await db
      .from('grocery_items')
      .select('*')
      .eq('list_id', id)
      .order('id')
      .range(offset, offset + limit);
    if (error) throw databaseFailure(error.code);
    const rows = parseDatabaseResponse(
      z.array(resourceSchemas.grocery_items),
      data,
    );
    return {
      items: rows.slice(0, limit),
      nextOffset: rows.length > limit ? offset + limit : null,
    };
  });
  app.get('/v1/grocery-details-status', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { data, error } = await db.rpc('grocery_details_ready');
    if (['PGRST202', '42883'].includes(error?.code || ''))
      return { available: false };
    if (error) throw databaseFailure(error.code);
    return { available: data === true };
  });
  app.put('/v1/grocery-items/:id/details', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    const { revision, ...payload } = groceryDetailsSchema.parse(request.body);
    const key = operationKeySchema.parse(request.headers['idempotency-key']);
    const { data, error } = await db.rpc('apply_grocery_details_mutation', {
      p_key: key,
      p_target: id,
      p_revision: revision,
      p_payload: payload,
    });
    if (['PGRST202', '42883'].includes(error?.code || ''))
      throw Object.assign(
        new Error(
          'Grocery notes and section editing are not available yet. Your pending changes are kept.',
        ),
        { statusCode: 503, publicCode: 'FEATURE_NOT_READY' },
      );
    if (error) throw databaseFailure(error.code);
    return parseDatabaseResponse(
      z.object({
        item: resourceSchemas.grocery_items,
        listRevision: z.number().int().positive(),
        state: z.enum(['ready', 'needs_review']),
      }),
      data,
    );
  });
}
