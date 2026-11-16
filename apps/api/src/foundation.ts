import { recordIdSchema } from '@meal/contracts';
import type { FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  operationKeySchema,
  paginationSchema,
  resourceNameSchema,
  resourceSchemas,
  planCommitSchema,
  planRepairSchema,
  planDocumentSchema,
  groceryEditSchema,
} from '@meal/contracts';

export type Authenticate = (
  authorization?: string,
) => Promise<{ db: SupabaseClient; userId: string }>;

export function databaseFailure(code?: string): Error {
  const mapped: Record<string, [number, string, string]> = {
    '40001': [
      409,
      'REVISION_CONFLICT',
      'Data changed. Reload before trying again.',
    ],
    P0002: [
      409,
      'IDEMPOTENCY_CONFLICT',
      'This operation key was already used for a different request.',
    ],
    P0001: [404, 'NOT_FOUND', 'Resource not found.'],
    '42501': [403, 'FORBIDDEN', 'You do not have access to this resource.'],
    '23505': [
      409,
      'RECORD_CONFLICT',
      'A record already exists for this selection.',
    ],
    '23503': [400, 'INVALID_REFERENCE', 'A referenced record is unavailable.'],
    '23514': [
      400,
      'INVALID_INPUT',
      'The change does not meet the record constraints.',
    ],
    '22023': [400, 'INVALID_INPUT', 'The change is invalid.'],
  };
  const [statusCode, publicCode, message] = mapped[code ?? ''] ?? [
    500,
    'REQUEST_FAILED',
    'Service unavailable. Please retry.',
  ];
  return Object.assign(new Error(message), { statusCode, publicCode });
}

export async function applyMutation(
  db: SupabaseClient,
  key: unknown,
  action: string,
  target: string,
  revision: number,
  payload: unknown,
) {
  const { data, error } = await db.rpc('apply_foundation_mutation', {
    p_key: operationKeySchema.parse(key),
    p_action: action,
    p_target: target,
    p_revision: revision,
    p_payload: payload,
  });
  if (error) throw databaseFailure(error.code);
  return data;
}

export function parseDatabaseResponse<T>(
  schema: z.ZodType<T>,
  data: unknown,
): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw databaseFailure();
  return parsed.data;
}

export function registerFoundationRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
) {
  app.get('/v1/resources/:resource', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const resource = resourceNameSchema.parse(
      z.object({ resource: z.string() }).parse(request.params).resource,
    );
    const { offset, limit } = paginationSchema.parse(request.query);
    const { data, error } = await db
      .from(resource)
      .select('*')
      .order('id')
      .range(offset, offset + limit);
    if (error) throw databaseFailure(error.code);
    const items = parseDatabaseResponse(
      z.array(resourceSchemas[resource]),
      data,
    );
    return {
      items: items.slice(0, limit),
      nextOffset: items.length > limit ? offset + limit : null,
    };
  });
  app.get('/v1/plans/:id', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    const { data, error } = await db.rpc('plan_document', { p_plan_id: id });
    if (error) throw databaseFailure(error.code);
    if (!data) throw databaseFailure('P0001');
    return parseDatabaseResponse(planDocumentSchema, data);
  });
  app.put('/v1/plans/:id', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    const { revision, ...payload } = planCommitSchema.parse(request.body);
    const data = await applyMutation(
      db,
      request.headers['idempotency-key'],
      'plan.commit',
      id,
      revision,
      payload,
    );
    return parseDatabaseResponse(planDocumentSchema, data);
  });
  app.post('/v1/plans/:id/repair-groceries', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    const { revision, ...payload } = planRepairSchema.parse(request.body);
    const data = await applyMutation(
      db,
      request.headers['idempotency-key'],
      'plan.repair',
      id,
      revision,
      payload,
    );
    return parseDatabaseResponse(planDocumentSchema, data);
  });
  app.get('/v1/shares/:id', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    const { data, error } = await db.rpc('read_shared_recipe', {
      p_share_id: id,
    });
    if (error) throw databaseFailure(error.code);
    if (!data) throw databaseFailure('P0001');
    return parseDatabaseResponse(
      z.object({
        shareId: recordIdSchema,
        canSave: z.boolean(),
        recipe: z.object({
          title: z.string(),
          description: z.string().nullable(),
          ingredients: z.array(z.unknown()),
          instructions: z.array(z.string()),
          provenance: z.record(z.string(), z.unknown()),
        }),
      }),
      data,
    );
  });
  app.put('/v1/grocery-items/:id', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    const { revision, ...payload } = groceryEditSchema.parse(request.body);
    const data = await applyMutation(
      db,
      request.headers['idempotency-key'],
      'grocery.edit',
      id,
      revision,
      payload,
    );
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
