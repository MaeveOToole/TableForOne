import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { recipeListSchema, resourceSchemas } from '@meal/contracts';

// Read-only hosted verification. Never create accounts or print credentials/private rows.
const env = loadConfig(process.env);
const app = buildApp({
  url: env.SUPABASE_URL,
  key: env.SUPABASE_PUBLISHABLE_KEY,
  environment: env.APP_ENV,
  logLevel: 'silent',
});
try {
  const ready = await app.inject('/ready');
  if (ready.statusCode !== 200)
    throw new Error('Updated API readiness failed.');
  console.log(
    'PASS: hosted milestone-one schema marker and database readiness',
  );
  const response = await app.inject('/v1/recipes?limit=50');
  if (response.statusCode !== 200)
    throw new Error('Hosted catalog read failed.');
  const recipes = recipeListSchema.parse(response.json()).items;
  const originals = recipes.filter(
    (r) => r.provenance.source === 'Table for One original starter catalog',
  );
  if (
    originals.length !== 12 ||
    originals.filter((r) => r.category === 'dinner').length < 7 ||
    originals.some(
      (r) =>
        r.incomplete ||
        r.ingredients.length === 0 ||
        r.instructions.length === 0,
    )
  )
    throw new Error('Complete starter catalog is not available.');
  console.log(
    'PASS: twelve complete original catalog recipes, including eight dinners',
  );
  if (recipes.some((r) => r.owner_id !== null))
    throw new Error('Anonymous catalog exposed private ownership.');
  console.log('PASS: anonymous catalog excludes private recipes');
  for (const path of [
    '/v1/saved',
    '/v1/preferences',
    '/v1/collections',
    '/v1/discovery-context',
    '/v1/resources/plans',
  ]) {
    if ((await app.inject(path)).statusCode !== 401)
      throw new Error('Private API did not reject anonymous access.');
  }
  console.log('PASS: private API routes reject anonymous access');
  const denied = await Promise.all(
    [
      ...Object.keys(resourceSchemas),
      'recipe_collections',
      'weekly_budgets',
      'preferences',
      'saved_recipes',
    ].map(async (table) => {
      const result = await fetch(
        `${env.SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`,
        {
          headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
          signal: AbortSignal.timeout(10000),
        },
      );
      return result.status === 401 || result.status === 403;
    }),
  );
  if (denied.some((value) => !value))
    throw new Error('Direct anonymous private-table denial check failed.');
  console.log(
    'PASS: direct Data API denies anonymous reads of all private foundation/library tables',
  );
  console.log(
    'PENDING: authenticated new-account/recovery, cross-account and signed iPhone/iPad acceptance.',
  );
} catch {
  console.error(
    'Hosted milestone-one verification failed. Check migration activation and network access; no mutations were attempted.',
  );
  process.exitCode = 1;
} finally {
  await app.close();
}
