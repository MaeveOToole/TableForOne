import { recipeListSchema } from '@meal/contracts';

// Read-only live checks. Do not print credentials, bodies or upstream errors.
const base = new URL(process.env.API_CHECK_URL || 'http://127.0.0.1:3000');
if (
  !['http:', 'https:'].includes(base.protocol) ||
  base.username ||
  base.password
)
  throw new Error('API_CHECK_URL must be an HTTP(S) URL without credentials.');

async function check(path: string, status = 200) {
  const response = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (response.status !== status)
    throw new Error(`${path}: expected HTTP ${status}, got ${response.status}`);
  return response;
}

try {
  const health = await (await check('/health')).json();
  if (health.status !== 'ok') throw new Error('API health is not ok.');
  console.log('PASS: API health');
  const ready = await (await check('/ready')).json();
  if (ready.status !== 'ready') throw new Error('Database is not ready.');
  console.log('PASS: database reachability');
  const catalog = recipeListSchema.parse(
    await (await check('/v1/recipes?limit=1')).json(),
  );
  if (!catalog.items.length)
    throw new Error(
      'Catalog is empty; load development fixtures before testing.',
    );
  const recipe = catalog.items[0];
  if (!recipe.ingredients.length || !recipe.instructions.length)
    throw new Error(
      'The first catalog recipe lacks ingredients or directions.',
    );
  console.log('PASS: catalog recipe with ingredients and directions');
  await check('/v1/saved', 401);
  console.log('PASS: anonymous access to saves rejected');
  console.log(
    'Sign-in, ownership and two-device save acceptance still required.',
  );
} catch (error) {
  const message =
    error instanceof Error &&
    /^(\/|API health|Database is|Catalog is|The first catalog)/.test(
      error.message,
    )
      ? error.message
      : 'Connection check failed. Verify API availability and environment configuration.';
  console.error(message);
  process.exitCode = 1;
}
