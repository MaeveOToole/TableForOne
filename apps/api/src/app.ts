import { registerAssistantRoutes } from './assistant.js';
import { recordIdSchema } from '@meal/contracts';
import Fastify, { LogController } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { SupabaseRecipeProvider } from './recipe-provider.js';
import { registerLibraryRoutes } from './library.js';
import { registerPlanningRoutes } from './planning.js';
import { registerKitchenRoutes } from './kitchen.js';
import { registerCheckoutRoutes } from './checkout.js';
import { registerGroceryDetailsRoutes } from './grocery-details.js';
import { registerAccountRoutes, accountAdmin } from './account.js';
import {
  preferencesUpdateSchema,
  preferencesSchema,
  recipeListSchema,
  savedListSchema,
} from '@meal/contracts';
import {
  applyMutation,
  parseDatabaseResponse,
  registerFoundationRoutes,
} from './foundation.js';

export type Config = {
  openai?: { apiKey?: string; model?: string };
  url: string;
  key: string;
  environment: string;
  webOrigin?: string;
  logLevel?: string;
  logStream?: import('node:stream').Writable;
  adminKey?: string;
  features?: { catalog: boolean; savedRecipes: boolean };
};
export function buildApp(
  config: Config,
  clientFactory = (token?: string): SupabaseClient =>
    createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : undefined,
    }),
) {
  const features = config.features ?? { catalog: true, savedRecipes: true };
  const app = Fastify({
    logController: new LogController({ disableRequestLogging: true }),
    logger: {
      level: config.logLevel ?? 'info',
      ...(config.logStream ? { stream: config.logStream } : {}),
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      serializers: {
        req: (req) => ({ method: req.method }),
      },
    },
    requestIdHeader: false,
    bodyLimit: 32768,
  });
  app.register(cors, {
    origin:
      config.webOrigin ??
      (config.environment === 'development' ? 'http://localhost:8081' : false),
    methods: ['GET', 'PUT', 'DELETE', 'POST'],
  });
  app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  app.addHook('onResponse', async (request, reply) => {
    const fields = {
      event: 'http_request',
      requestId: request.id,
      method: request.method,
      route: request.routeOptions.url ?? 'unmatched',
      statusCode: reply.statusCode,
      durationMs: reply.elapsedTime,
    };
    if (reply.statusCode >= 500)
      request.log.error(fields, 'HTTP request completed');
    else request.log.info(fields, 'HTTP request completed');
  });
  app.addHook('onRequest', async (request, reply) => {
    const route = request.routeOptions.url;
    if (
      (route === '/v1/recipes' && !features.catalog) ||
      (route?.startsWith('/v1/saved') && !features.savedRecipes)
    ) {
      return reply.code(503).send({
        error: {
          code: 'FEATURE_DISABLED',
          message: 'This feature is temporarily unavailable.',
          requestId: request.id,
        },
      });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const status =
      error instanceof z.ZodError
        ? 400
        : typeof error === 'object' && error !== null && 'statusCode' in error
          ? Number(error.statusCode)
          : 500;
    if (status >= 500)
      request.log.error({ requestId: request.id }, 'Request failed');
    reply.code(status).send({
      error: {
        code:
          error instanceof Error && 'publicCode' in error
            ? error.publicCode
            : status === 400
              ? 'INVALID_INPUT'
              : status === 401
                ? 'UNAUTHORIZED'
                : 'REQUEST_FAILED',
        message:
          error instanceof Error && 'publicCode' in error
            ? error.message
            : status >= 500
              ? 'Service unavailable. Please retry.'
              : status === 401
                ? 'Sign in to continue.'
                : 'Request could not be completed.',
        requestId: request.id,
        ...(error instanceof z.ZodError
          ? {
              fields: error.issues.map((issue) => ({
                path: issue.path.join('.'),
                code: issue.code,
              })),
            }
          : {}),
      },
    });
  });
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found.',
        requestId: request.id,
      },
    });
  });
  async function privateClient(authorization?: string) {
    const token = authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token)
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    const db = clientFactory(token);
    const { data, error } = await db.auth.getUser(token);
    // An unavailable auth service does not mean the user's session is invalid.
    if (error && (!error.status || error.status >= 500))
      throw Object.assign(
        new Error(
          'The sign-in service cannot be reached. Please retry shortly.',
        ),
        { statusCode: 503, publicCode: 'AUTH_UNAVAILABLE' },
      );
    if (error || !data.user)
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    return { db, userId: data.user.id };
  }
  registerAssistantRoutes(app, privateClient, config.openai ?? {});
  registerFoundationRoutes(app, privateClient);
  registerLibraryRoutes(app, privateClient);
  registerPlanningRoutes(app, privateClient);
  registerKitchenRoutes(app, privateClient);
  registerCheckoutRoutes(app, privateClient);
  registerGroceryDetailsRoutes(app, privateClient);
  registerAccountRoutes(
    app,
    privateClient,
    accountAdmin(config.url, config.adminKey),
  );
  app.get('/health', async () => ({
    status: 'ok',
    environment: config.environment,
    features: {
      ...features,
      imports: false,
      assistant: !!config.openai?.apiKey,
      planning: true,
    },
  }));
  app.get('/ready', async (_request, reply) => {
    try {
      const db = clientFactory();
      const schema = await db.rpc('foundation_ready');
      if (schema.error || schema.data !== '202610270004')
        return reply.code(503).send({ status: 'unavailable' });
      const { error } = await db.from('recipes').select('id').limit(1);
      return reply
        .code(error ? 503 : 200)
        .send({ status: error ? 'unavailable' : 'ready' });
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.get('/v1/recipes', async (request) => {
    const query = z
      .object({
        q: z.string().trim().max(100).default(''),
        offset: z.coerce.number().int().min(0).max(10000).default(0),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(request.query);
    const db = request.headers.authorization
      ? (await privateClient(request.headers.authorization)).db
      : clientFactory();
    try {
      return parseDatabaseResponse(
        recipeListSchema,
        await new SupabaseRecipeProvider(db).list(query),
      );
    } catch {
      throw Object.assign(new Error('Catalog unavailable'), {
        statusCode: 500,
      });
    }
  });
  app.get('/v1/saved', async (request) => {
    const { db } = await privateClient(request.headers.authorization);
    const { data, error } = await db
      .from('saved_recipes')
      .select('recipe_id,created_at,revision,collection_id,planned_week')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return parseDatabaseResponse(savedListSchema, { items: data });
  });
  app.put('/v1/saved/:id', async (request, reply) => {
    const id = z.object({ id: recordIdSchema }).parse(request.params).id;
    const { db } = await privateClient(request.headers.authorization);
    await applyMutation(
      db,
      request.headers['idempotency-key'],
      'saved.add',
      id,
      0,
      {},
    );
    return reply.code(204).send();
  });
  app.delete('/v1/saved/:id', async (request, reply) => {
    const id = z.object({ id: recordIdSchema }).parse(request.params).id;
    const { db } = await privateClient(request.headers.authorization);
    await applyMutation(
      db,
      request.headers['idempotency-key'],
      'saved.remove',
      id,
      0,
      {},
    );
    return reply.code(204).send();
  });
  app.get('/v1/preferences', async (request) => {
    const { db } = await privateClient(request.headers.authorization);
    const { data, error } = await db
      .from('preferences')
      .select('preferences,revision')
      .single();
    if (error) throw error;
    return parseDatabaseResponse(
      z.object({
        preferences: preferencesSchema,
        revision: z.number().int().positive(),
      }),
      data,
    );
  });
  app.put('/v1/preferences', async (request) => {
    const input = preferencesUpdateSchema.parse(request.body);
    const { db, userId } = await privateClient(request.headers.authorization);
    const data = await applyMutation(
      db,
      request.headers['idempotency-key'],
      'preferences.update',
      userId,
      input.revision,
      input.preferences,
    );
    return parseDatabaseResponse(
      z.object({
        preferences: preferencesUpdateSchema.shape.preferences,
        revision: z.number().int().positive(),
      }),
      data,
    );
  });
  return app;
}
