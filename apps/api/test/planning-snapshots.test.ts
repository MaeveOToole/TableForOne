import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { buildApp } from '../src/app.js';
import { snapshotId } from '../src/planning.js';
import { recipeSchema } from '@meal/contracts';
import originals from '../../../packages/contracts/src/launch-recipes.json';
const owner = '10000000-0000-4000-8000-000000000001';
const config = {
  url: 'https://example.supabase.co',
  key: 'public-test-key',
  environment: 'development',
  logLevel: 'silent',
};
test('planning snapshots authenticate, check source revisions, remain immutable, and retry once', async () => {
  let recipe = recipeSchema.parse(originals[0]);
  const versions = new Map<string, unknown>();
  const app = buildApp(config, (token) =>
    createClient(config.url, config.key, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: async (input, init) => {
          const url = new URL(String(input));
          if (url.pathname === '/auth/v1/user')
            return Response.json({ id: owner });
          if (url.pathname.endsWith('/recipes')) return Response.json(recipe);
          if (url.pathname.endsWith('/recipe_versions')) {
            if (init?.method === 'POST') {
              const value = JSON.parse(String(init.body));
              const version = {
                ...value,
                revision: 1,
                created_at: '2026-11-03T12:00:00Z',
                updated_at: '2026-11-03T12:00:00Z',
              };
              versions.set(value.id, version);
              return Response.json(version);
            }
            return Response.json(
              versions.get(url.searchParams.get('id')!.replace('eq.', '')) ||
                null,
            );
          }
          throw new Error('Unexpected request');
        },
      },
    }),
  );
  try {
    const headers = {
      authorization: 'Bearer test-token',
      'idempotency-key': 'snapshot-test-key-001',
    };
    const payload = { recipeId: recipe.id, expectedRevision: recipe.revision };
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/recipe-versions',
          payload,
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/recipe-versions',
          headers,
          payload: { ...payload, expectedRevision: 2 },
        })
      ).statusCode,
      409,
    );
    const first = await app.inject({
      method: 'POST',
      url: '/v1/recipe-versions',
      headers,
      payload,
    });
    assert.equal(first.statusCode, 200, first.body);
    recipe = { ...recipe, title: 'Changed later', revision: 2 };
    const retry = await app.inject({
      method: 'POST',
      url: '/v1/recipe-versions',
      headers,
      payload,
    });
    assert.deepEqual(retry.json(), first.json());
    assert.equal(versions.size, 1);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/recipe-versions',
          headers,
          payload: { ...payload, recipeId: originals[1].id },
        })
      ).statusCode,
      409,
    );
    assert.notEqual(
      snapshotId(owner, 'same-key'),
      snapshotId('10000000-0000-4000-8000-000000000002', 'same-key'),
    );
  } finally {
    await app.close();
  }
});
