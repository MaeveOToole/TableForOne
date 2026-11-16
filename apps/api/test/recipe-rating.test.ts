import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { buildApp } from '../src/app';
const id = '10000000-0000-4000-8000-000000000001';
test('recipe rating authenticates, validates stars and guards revision updates', async () => {
  let stored: { stars: number; revision: number } | null = null;
  const config = {
    url: 'https://example.supabase.co',
    key: 'public-test-key',
    environment: 'development',
    logLevel: 'silent',
  };
  const app = buildApp(config, (token) =>
    createClient(config.url, config.key, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: async (input, init) => {
          const url = new URL(String(input));
          if (url.pathname.includes('/auth/v1/user'))
            return Response.json({ id });
          assert.ok(url.pathname.endsWith('/ratings'));
          if (init?.method === 'POST') {
            stored = {
              stars: JSON.parse(String(init.body)).stars,
              revision: 1,
            };
            return Response.json(stored);
          }
          if (init?.method === 'PATCH') {
            if (url.searchParams.get('revision') !== `eq.${stored?.revision}`)
              return Response.json(null);
            stored = JSON.parse(String(init.body));
            return Response.json(stored);
          }
          return Response.json(stored);
        },
      },
    }),
  );
  const path = `/v1/recipes/${id}/rating`;
  const headers = {
    authorization: 'Bearer test-token',
    'idempotency-key': 'recipe-rating-test-001',
  };
  try {
    assert.equal((await app.inject(path)).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: path,
          headers,
          payload: { stars: 6, revision: 0 },
        })
      ).statusCode,
      400,
    );
    const first = await app.inject({
      method: 'PUT',
      url: path,
      headers,
      payload: { stars: 4, revision: 0 },
    });
    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.json(), { stars: 4, revision: 1 });
    assert.deepEqual((await app.inject({ url: path, headers })).json(), {
      stars: 4,
      revision: 1,
    });
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: path,
          headers,
          payload: { stars: 5, revision: 1 },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: path,
          headers,
          payload: { stars: 2, revision: 1 },
        })
      ).statusCode,
      409,
    );
  } finally {
    await app.close();
  }
});
