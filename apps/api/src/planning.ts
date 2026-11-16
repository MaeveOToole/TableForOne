import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  operationKeySchema,
  recipeSchema,
  recipeVersionCreateSchema,
  resourceSchemas,
} from '@meal/contracts';
import { completePersonalRecipe } from './personal-recipe-details.js';
import {
  databaseFailure,
  parseDatabaseResponse,
  type Authenticate,
} from './foundation.js';

export function snapshotId(owner: string, key: string) {
  const hash = createHash('sha256')
    .update(`recipe-snapshot:${owner}:${key}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export function registerPlanningRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
) {
  app.post('/v1/recipe-versions', async (request) => {
    const { db, userId } = await authenticate(request.headers.authorization);
    const { recipeId, expectedRevision } = recipeVersionCreateSchema.parse(
      request.body,
    );
    const key = operationKeySchema.parse(request.headers['idempotency-key']);
    const id = snapshotId(userId, key);
    const read = async () => {
      const { data, error } = await db
        .from('recipe_versions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw databaseFailure(error.code);
      if (!data) return null;
      const version = parseDatabaseResponse(
        resourceSchemas.recipe_versions,
        data,
      );
      if (
        version.recipe_id !== recipeId ||
        version.snapshot.revision !== expectedRevision
      )
        throw databaseFailure('P0002');
      return version;
    };
    const existing = await read();
    if (existing) return existing;
    // The caller token and RLS restrict the source. No client-supplied recipe text
    // can become an authoritative history snapshot through this endpoint.
    const { data, error } = await db
      .from('recipes')
      .select('*')
      .eq('id', recipeId)
      .maybeSingle();
    if (error) throw databaseFailure(error.code);
    if (!data) throw databaseFailure('P0001');
    const recipe = completePersonalRecipe(recipeSchema.parse(data));
    if (recipe.revision !== expectedRevision) throw databaseFailure('40001');
    if (!recipe.content_permissions.personalStorage)
      throw databaseFailure('42501');
    const result = await db
      .from('recipe_versions')
      .insert({
        id,
        user_id: userId,
        recipe_id: recipeId,
        snapshot: recipe,
        attribution: recipe.provenance,
        extraction_method: recipe.provenance.method,
        confidence: recipe.extraction_confidence,
        permissions: recipe.content_permissions,
        modifications: recipe.personal_modifications,
      })
      .select('*')
      .single();
    if (result.error?.code === '23505') {
      const raced = await read();
      if (raced) return raced;
    }
    if (result.error) throw databaseFailure(result.error.code);
    return parseDatabaseResponse(resourceSchemas.recipe_versions, result.data);
  });
}
