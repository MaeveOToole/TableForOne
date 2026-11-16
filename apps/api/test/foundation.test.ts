import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { buildApp } from '../src/app.js';
import {
  groceryProjectionSchema,
  jobStateSchema,
  planCommitSchema,
} from '@meal/contracts';
import { openApiDocument } from '../src/openapi.js';

const config = {
  url: 'https://example.supabase.co',
  key: 'public-test-key',
  environment: 'development',
  logLevel: 'silent',
};
const id = '20000000-0000-4000-8000-000000000001';
const headers = {
  authorization: 'Bearer test-token',
  'idempotency-key': 'foundation-test-001',
};

test('all new foundation routes authenticate before accessing private data', async () => {
  const app = buildApp(config, () => {
    throw new Error('Must not access database');
  });
  try {
    for (const [method, url] of [
      ['GET', '/v1/resources/plans'],
      ['GET', `/v1/plans/${id}`],
      ['PUT', `/v1/plans/${id}`],
      ['POST', `/v1/plans/${id}/repair-groceries`],
      ['PUT', `/v1/grocery-items/${id}`],
      ['GET', `/v1/shares/${id}`],
    ] as const)
      assert.equal((await app.inject({ method, url })).statusCode, 401);
  } finally {
    await app.close();
  }
});

test('foundation API rejects arbitrary tables, unknown fields and missing operation keys before mutation', async () => {
  let writes = 0;
  const app = buildApp(config, (token) =>
    createClient(config.url, config.key, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: async (input) => {
          if (String(input).includes('/auth/v1/user'))
            return Response.json({
              id: '10000000-0000-4000-8000-000000000001',
            });
          writes++;
          throw new Error('Unexpected database call');
        },
      },
    }),
  );
  try {
    assert.equal(
      (await app.inject({ url: '/v1/resources/auth.users', headers }))
        .statusCode,
      400,
    );
    const payload = {
      revision: 0,
      groceryRevision: 0,
      weekStart: '2026-10-26',
      slots: [],
      groceries: [],
    };
    const response = await app.inject({
      method: 'PUT',
      url: `/v1/plans/${id}`,
      headers: { authorization: headers.authorization },
      payload,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'INVALID_INPUT');
    assert.ok(response.json().error.fields);
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: `/v1/plans/${id}`,
          headers,
          payload: { ...payload, user_id: id },
        })
      ).statusCode,
      400,
    );
    assert.equal(writes, 0);
  } finally {
    await app.close();
  }
});

test('API forwards actor token, revisions and operation key and returns saved-plan repair state', async () => {
  const document = {
    id,
    revision: 2,
    weekStart: '2026-10-26',
    groceryState: 'needs_review',
    slots: [],
    groceries: {
      id,
      revision: 1,
      state: 'needs_review',
      recoveryCode: 'GROCERY_UPDATE_FAILED',
      items: [],
    },
    recovery: {
      action: 'repair_groceries',
      message: 'Your plan is saved. Review or retry groceries before shopping.',
    },
  };
  let rpc: Record<string, unknown> = {};
  const app = buildApp(config, (token) =>
    createClient(config.url, config.key, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: async (input, init) => {
          if (String(input).includes('/auth/v1/user'))
            return Response.json({
              id: '10000000-0000-4000-8000-000000000001',
            });
          assert.equal(
            new Headers(init?.headers).get('authorization'),
            'Bearer test-token',
          );
          rpc = JSON.parse(String(init?.body));
          return Response.json(document);
        },
      },
    }),
  );
  try {
    const response = await app.inject({
      method: 'PUT',
      url: `/v1/plans/${id}`,
      headers,
      payload: {
        revision: 0,
        groceryRevision: 0,
        weekStart: '2026-10-26',
        slots: [],
        groceries: [],
      },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), document);
    assert.equal(rpc.p_key, headers['idempotency-key']);
    assert.equal(rpc.p_action, 'plan.commit');
    assert.equal(rpc.p_revision, 0);
  } finally {
    await app.close();
  }
});

test('resource pagination validates returned rows and computes a stable continuation', async () => {
  const row = {
    id,
    user_id: id,
    revision: 1,
    created_at: '2026-10-27T00:00:00Z',
    updated_at: '2026-10-27T00:00:00Z',
    display_name: 'Test',
  };
  const app = buildApp(config, () =>
    createClient(config.url, config.key, {
      global: {
        fetch: async (input) => {
          if (String(input).includes('/auth/v1/user'))
            return Response.json({ id });
          assert.ok(String(input).includes('order=id.asc'));
          return Response.json([row, row]);
        },
      },
    }),
  );
  try {
    const response = await app.inject({
      url: '/v1/resources/profiles?limit=1&offset=2',
      headers,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().items.length, 1);
    assert.equal(response.json().nextOffset, 3);
  } finally {
    await app.close();
  }
});

test('contracts preserve asynchronous states and reject duplicate derived requirements', () => {
  for (const state of [
    'queued',
    'processing',
    'needs_review',
    'ready',
    'link_only',
    'failed',
  ])
    assert.equal(jobStateSchema.parse(state), state);
  assert.equal(jobStateSchema.safeParse('done').success, false);
  const item = {
    originKey: 'onion',
    name: 'onion',
    rawText: 'onion to taste',
    quantity: null,
    unit: null,
    origins: [],
  };
  assert.equal(groceryProjectionSchema.parse([item])[0].quantity, null);
  assert.equal(groceryProjectionSchema.safeParse([item, item]).success, false);
  assert.equal(
    planCommitSchema.safeParse({
      revision: 0,
      groceryRevision: 0,
      weekStart: 'bad',
      slots: [],
      groceries: [],
    }).success,
    false,
  );
});

test('OpenAPI describes every implemented foundation route', async () => {
  const app = buildApp(config);
  try {
    await app.ready();
    for (const [path, methods] of Object.entries(openApiDocument.paths)) {
      for (const method of Object.keys(methods)) {
        assert.ok(
          app.hasRoute({
            method: method.toUpperCase() as 'GET' | 'PUT' | 'DELETE' | 'POST',
            url: path.replace(/\{(\w+)\}/g, ':$1'),
          }),
          `${method} ${path}`,
        );
      }
    }
  } finally {
    await app.close();
  }
});
