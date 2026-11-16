import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import {
  defaultPreferences,
  preferencesSchema,
  recipeSchema,
} from '@meal/contracts';
import { createClient } from '@supabase/supabase-js';
const config = {
  url: 'https://example.supabase.co',
  key: 'public-test-key',
  environment: 'development',
};

test('private endpoints reject absent credentials without touching the database', async () => {
  const app = buildApp(config, () => {
    throw new Error('Must not query');
  });
  try {
    for (const [method, url] of [
      ['GET', '/v1/saved'],
      ['PUT', '/v1/saved/00000000-0000-4000-8000-000000000001'],
      ['DELETE', '/v1/saved/00000000-0000-4000-8000-000000000001'],
      ['GET', '/v1/preferences'],
    ] as const) {
      const result = await app.inject({ method, url });
      assert.equal(result.statusCode, 401);
      assert.equal(result.json().error.code, 'UNAUTHORIZED');
      assert.ok(result.headers['x-request-id']);
    }
  } finally {
    await app.close();
  }
});
test('invalid pagination and identifiers return structured errors', async () => {
  const app = buildApp(config);
  try {
    assert.equal((await app.inject('/v1/recipes?offset=-1')).statusCode, 400);
    assert.equal(
      (await app.inject({ method: 'PUT', url: '/v1/saved/invalid' }))
        .statusCode,
      400,
    );
  } finally {
    await app.close();
  }
});
test('untrusted and expired tokens do not authorize requests', async () => {
  const app = buildApp(config, () =>
    createClient(config.url, config.key, {
      global: {
        fetch: async () =>
          new Response(JSON.stringify({ message: 'invalid token' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
      },
    }),
  );
  try {
    assert.equal(
      (
        await app.inject({
          url: '/v1/saved',
          headers: { authorization: 'Bearer invalid' },
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});
test('authentication outages preserve sessions and report service unavailability', async () => {
  for (const status of [0, 503]) {
    const app = buildApp(config, () =>
      createClient(config.url, config.key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async () => {
            if (!status) throw new TypeError('private network failure');
            return new Response(
              JSON.stringify({ message: 'private upstream failure' }),
              {
                status,
                headers: { 'content-type': 'application/json' },
              },
            );
          },
        },
      }),
    );
    try {
      const response = await app.inject({
        url: '/v1/saved',
        headers: { authorization: 'Bearer existing-session' },
      });
      assert.equal(response.statusCode, 503);
      assert.equal(response.json().error.code, 'AUTH_UNAVAILABLE');
      assert.equal(response.body.includes('private'), false);
    } finally {
      await app.close();
    }
  }
});

test('upstream failures are redacted and health distinguishes readiness', async () => {
  const app = buildApp(config, () => {
    throw new Error('secret database details');
  });
  try {
    assert.equal((await app.inject('/health')).statusCode, 200);
    const result = await app.inject('/v1/recipes');
    assert.equal(result.statusCode, 500);
    assert.equal(result.body.includes('secret'), false);
  } finally {
    await app.close();
  }
});
test('defaults preserve single-person budget and invalid values are rejected', () => {
  assert.equal(defaultPreferences.people, 1);
  assert.equal(defaultPreferences.weeklyBudgetCents, 15000);
  assert.equal(
    preferencesSchema.safeParse({
      ...defaultPreferences,
      weeklyBudgetCents: -1,
    }).success,
    false,
  );
  assert.equal(
    preferencesSchema.safeParse({
      ...defaultPreferences,
      timeZone: 'not-a-zone',
    }).success,
    false,
  );
});
test('recipe contracts preserve unknown quantities and provenance', () => {
  const recipe = recipeSchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Sample',
    description: 'Sample',
    cuisine: 'Italian',
    minutes: 20,
    servings: 2,
    difficulty: 'simple',
    ingredients: [
      {
        raw: 'salt to taste',
        name: 'salt',
        quantity: null,
        unit: null,
        notes: null,
      },
    ],
    instructions: ['Season.'],
    provenance: {
      source: 'Development',
      url: null,
      permission: 'Fixture',
      method: 'generated',
    },
  });
  assert.equal(recipe.ingredients[0].quantity, null);
  assert.equal(recipe.provenance.method, 'generated');
});

test('stale preferences return 409 and keep user authorization on the database request', async () => {
  let authorization: string | null = null;
  let target = '';
  let mutation: Record<string, unknown> = {};
  const app = buildApp(config, (token) =>
    createClient(config.url, config.key, {
      auth: { persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: async (input, init) => {
          const url = String(input);
          if (url.includes('/auth/v1/user'))
            return new Response(
              JSON.stringify({ id: '10000000-0000-4000-8000-000000000001' }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          authorization = new Headers(init?.headers).get('authorization');
          target = url;
          mutation = JSON.parse(String(init?.body));
          return new Response(
            JSON.stringify({
              code: '40001',
              message: 'private database error',
            }),
            {
              status: 400,
              headers: { 'content-type': 'application/json' },
            },
          );
        },
      },
    }),
  );
  try {
    const result = await app.inject({
      method: 'PUT',
      url: '/v1/preferences',
      headers: {
        authorization: 'Bearer test-token',
        'idempotency-key': 'preferences-test-001',
      },
      payload: { revision: 1, preferences: defaultPreferences },
    });
    assert.equal(result.statusCode, 409);
    assert.equal(result.json().error.code, 'REVISION_CONFLICT');
    assert.equal(authorization, 'Bearer test-token');
    assert.ok(target.includes('/rpc/apply_foundation_mutation'));
    assert.equal(mutation.p_revision, 1);
    assert.equal(mutation.p_target, '10000000-0000-4000-8000-000000000001');
    assert.equal(result.body.includes('private database error'), false);
  } finally {
    await app.close();
  }
});
test('saving retries use one stable user/recipe key and ignore duplicates', async () => {
  const writes: unknown[] = [];
  const app = buildApp(config, (token) =>
    createClient(config.url, config.key, {
      auth: { persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: async (input, init) => {
          if (String(input).includes('/auth/v1/user'))
            return new Response(
              JSON.stringify({ id: '10000000-0000-4000-8000-000000000001' }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          writes.push(JSON.parse(String(init?.body)));
          assert.ok(String(input).includes('/rpc/apply_foundation_mutation'));
          return Response.json({
            saved: true,
            recipeId: '00000000-0000-4000-8000-000000000001',
          });
        },
      },
    }),
  );
  try {
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await app.inject({
            method: 'PUT',
            url: '/v1/saved/00000000-0000-4000-8000-000000000001',
            headers: {
              authorization: 'Bearer test-token',
              'idempotency-key': 'save-recipe-test-001',
            },
          })
        ).statusCode,
        204,
      );
    assert.deepEqual(writes[0], writes[1]);
    assert.deepEqual(writes[0], {
      p_key: 'save-recipe-test-001',
      p_action: 'saved.add',
      p_target: '00000000-0000-4000-8000-000000000001',
      p_revision: 0,
      p_payload: {},
    });
  } finally {
    await app.close();
  }
});

test('legacy preferences load without a name and profile updates preserve meal defaults', () => {
  const { displayName: _name, ...legacy } = defaultPreferences;
  void _name;
  assert.equal(preferencesSchema.parse(legacy).displayName, '');
  const updated = preferencesSchema.parse({
    ...legacy,
    displayName: ' Maeve ',
    people: 2,
  });
  assert.equal(updated.displayName, 'Maeve');
  assert.equal(updated.people, 2);
  assert.equal(updated.weeklyBudgetCents, legacy.weeklyBudgetCents);
  assert.equal(
    preferencesSchema.safeParse({ ...legacy, displayName: 'x'.repeat(81) })
      .success,
    false,
  );
});

test('older profiles gain meal targets and dietary choices survive preference serialization', () => {
  const legacy = preferencesSchema.parse({
    people: 1,
    cookingSessions: 3,
    portions: 2,
  });
  assert.deepEqual(legacy.dietaryRestrictions, []);
  assert.deepEqual(legacy.mealsPerWeek, {
    breakfasts: 0,
    lunches: 0,
    dinners: 3,
  });
  const edited = {
    ...legacy,
    dietaryRestrictions: ['Peanut-free', 'Dairy-free'],
    cuisines: ['Korean', 'Greek'],
    mealsPerWeek: { breakfasts: 5, lunches: 4, dinners: 3 },
  };
  assert.deepEqual(
    preferencesSchema.parse(JSON.parse(JSON.stringify(edited))),
    edited,
  );
  for (const breakfasts of [-1, 1.5, 8]) {
    assert.equal(
      preferencesSchema.safeParse({
        ...edited,
        mealsPerWeek: { ...edited.mealsPerWeek, breakfasts },
      }).success,
      false,
    );
  }
});

test('catalog requests validate and forward account tokens for private drafts', async () => {
  let catalogToken: string | null = null;
  const app = buildApp(config, (token) =>
    createClient(config.url, config.key, {
      auth: { persistSession: false },
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        fetch: async (input, init) => {
          if (String(input).includes('/auth/v1/user'))
            return Response.json({
              id: '10000000-0000-4000-8000-000000000001',
            });
          catalogToken = new Headers(init?.headers).get('authorization');
          return Response.json([
            {
              id: '90000000-0000-4000-8000-000000000001',
              title: 'Private draft',
              description: 'Source summary',
              cuisine: 'Not recorded',
              minutes: null,
              servings: null,
              difficulty: null,
              category: 'dinner',
              incomplete: true,
              ingredients: [],
              instructions: [],
              provenance: {
                source: 'Personal collection',
                url: null,
                permission: 'Personal',
                method: 'generated',
              },
            },
          ]);
        },
      },
    }),
  );
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/recipes',
      headers: { authorization: 'Bearer owner-token' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(catalogToken, 'Bearer owner-token');
    assert.equal(response.json().items[0].minutes, null);
    assert.equal(response.json().items[0].incomplete, true);
  } finally {
    await app.close();
  }
});
