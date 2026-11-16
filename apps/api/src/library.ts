import { completePersonalRecipe } from './personal-recipe-details.js';
import { recordIdSchema } from '@meal/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  collectionCreateSchema,
  savedOrganizationSchema,
  recipeEditSchema,
  recipeSchema,
  operationKeySchema,
  discoveryContextSchema,
  preferencesSchema,
  recipeListSchema,
  paginationSchema,
} from '@meal/contracts';
import {
  databaseFailure,
  parseDatabaseResponse,
  type Authenticate,
} from './foundation.js';

export function registerLibraryRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
) {
  app.get('/v1/recipes/:id/rating', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    const { data, error } = await db
      .from('ratings')
      .select('stars,revision')
      .eq('recipe_id', id)
      .maybeSingle();
    if (error) throw databaseFailure(error.code);
    return data || { stars: null, revision: 0 };
  });
  app.put('/v1/recipes/:id/rating', async (request) => {
    const { db, userId } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    operationKeySchema.parse(request.headers['idempotency-key']);
    const input = z
      .object({
        stars: z.number().int().min(1).max(5),
        revision: z.number().int().nonnegative(),
      })
      .strict()
      .parse(request.body);
    const result =
      input.revision === 0
        ? await db
            .from('ratings')
            .insert({ user_id: userId, recipe_id: id, stars: input.stars })
            .select('stars,revision')
            .single()
        : await db
            .from('ratings')
            .update({ stars: input.stars, revision: input.revision + 1 })
            .eq('recipe_id', id)
            .eq('revision', input.revision)
            .select('stars,revision')
            .maybeSingle();
    if (result.error) throw databaseFailure(result.error.code);
    if (!result.data) throw databaseFailure('40001');
    return result.data;
  });
  app.get('/v1/saved-recipes', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { offset, limit } = paginationSchema.parse(request.query);
    const { data, error } = await db
      .from('saved_recipes')
      .select('recipe:recipes(*)')
      .order('created_at', { ascending: false })
      .order('recipe_id')
      .range(offset, offset + limit);
    if (error) throw databaseFailure(error.code);
    const rows = parseDatabaseResponse(
      z.array(z.object({ recipe: recipeSchema.nullable() })),
      data,
    );
    return recipeListSchema.parse({
      items: rows
        .slice(0, limit)
        .flatMap((r) => (r.recipe ? [completePersonalRecipe(r.recipe)] : [])),
      nextOffset: rows.length > limit ? offset + limit : null,
    });
  });
  app.get('/v1/weekly-budgets/:week', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { week } = z.object({ week: z.iso.date() }).parse(request.params);
    const { data, error } = await db
      .from('weekly_budgets')
      .select('revision,ceiling_cents')
      .eq('week_start', week)
      .maybeSingle();
    if (error) throw databaseFailure(error.code);
    if (data)
      return {
        weekStart: week,
        revision: data.revision,
        ceilingCents: data.ceiling_cents,
        currency: 'USD',
      };
    const profile = await db.from('preferences').select('preferences').single();
    if (profile.error) throw databaseFailure(profile.error.code);
    return {
      weekStart: week,
      revision: 0,
      ceilingCents: preferencesSchema.parse(profile.data.preferences)
        .weeklyBudgetCents,
      currency: 'USD',
    };
  });
  app.put('/v1/weekly-budgets/:week', async (request) => {
    const { db, userId } = await authenticate(request.headers.authorization);
    const { week } = z.object({ week: z.iso.date() }).parse(request.params);
    const body = z
      .object({
        revision: z.number().int().nonnegative(),
        ceilingCents: z.number().int().min(0).max(1000000),
      })
      .strict()
      .parse(request.body);
    const data = await mutate(
      request,
      db,
      'budget.set',
      userId,
      body.revision,
      { weekStart: week, ceilingCents: body.ceilingCents },
    );
    return {
      weekStart: week,
      revision: data.revision,
      ceilingCents: data.ceiling_cents,
      currency: 'USD',
    };
  });
  async function mutate(
    request: { headers: Record<string, unknown> },
    db: Awaited<ReturnType<Authenticate>>['db'],
    action: string,
    target: string,
    revision: number,
    payload: unknown,
  ) {
    const { data, error } = await db.rpc('apply_library_mutation', {
      p_key: operationKeySchema.parse(request.headers['idempotency-key']),
      p_action: action,
      p_target: target,
      p_revision: revision,
      p_payload: payload,
    });
    if (error) throw databaseFailure(error.code);
    return data;
  }
  app.get('/v1/collections', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { data, error } = await db
      .from('recipe_collections')
      .select('id,name,revision')
      .order('name');
    if (error) throw databaseFailure(error.code);
    return {
      items: parseDatabaseResponse(
        z.array(
          z.object({
            id: recordIdSchema,
            name: z.string(),
            revision: z.number().int().positive(),
          }),
        ),
        data,
      ),
    };
  });
  app.put('/v1/collections/:id', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    return mutate(
      request,
      db,
      'collection.create',
      id,
      0,
      collectionCreateSchema.parse(request.body),
    );
  });
  app.put('/v1/saved/:id/organization', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    const { revision, ...payload } = savedOrganizationSchema.parse(
      request.body,
    );
    return mutate(request, db, 'saved.organize', id, revision, payload);
  });
  app.put('/v1/personal-recipes/:id', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { id } = z.object({ id: recordIdSchema }).parse(request.params);
    const { revision, ...payload } = recipeEditSchema.parse(request.body);
    if (revision === 0 && !payload.sourceId)
      throw Object.assign(new Error('Select a source recipe.'), {
        statusCode: 400,
      });
    const data = await mutate(
      request,
      db,
      revision === 0 ? 'recipe.copy' : 'recipe.edit',
      id,
      revision,
      payload,
    );
    return parseDatabaseResponse(recipeSchema, data);
  });
  app.get('/v1/discovery-context', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const results = await Promise.all([
      db.from('pantry_items').select('name,use_soon').limit(1000),
      db.from('ratings').select('recipe_id,stars').limit(1000),
      db
        .from('cooking_events')
        .select('recipe_version_id,cooked_at')
        .order('cooked_at', { ascending: false })
        .limit(1000),
      db.from('recipe_versions').select('id,recipe_id').limit(1000),
    ]);
    for (const result of results)
      if (result.error) throw databaseFailure(result.error.code);
    const pantry = parseDatabaseResponse(
      z.array(z.object({ name: z.string(), use_soon: z.boolean() })),
      results[0].data,
    );
    const ratings = parseDatabaseResponse(
      z.array(
        z.object({
          recipe_id: recordIdSchema,
          stars: z.number().int().min(1).max(5),
        }),
      ),
      results[1].data,
    );
    const events = parseDatabaseResponse(
      z.array(
        z.object({ recipe_version_id: recordIdSchema, cooked_at: z.string() }),
      ),
      results[2].data,
    );
    const versions = parseDatabaseResponse(
      z.array(z.object({ id: recordIdSchema, recipe_id: recordIdSchema })),
      results[3].data,
    );
    const cooked: Record<string, string> = {};
    for (const event of events) {
      const version = versions.find((v) => v.id === event.recipe_version_id);
      if (version && !cooked[version.recipe_id])
        cooked[version.recipe_id] = event.cooked_at;
    }
    return discoveryContextSchema.parse({
      pantry: pantry.map((p) => ({ name: p.name, useSoon: p.use_soon })),
      ratings: Object.fromEntries(ratings.map((r) => [r.recipe_id, r.stars])),
      cooked,
      partial: results.some((r) => (r.data?.length ?? 0) >= 1000),
    });
  });
}
