import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const base = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
};

test('hosted configuration rejects invalid flags, placeholders and insecure endpoints', () => {
  for (const APP_ENV of ['development', 'staging', 'production']) {
    assert.equal(loadConfig({ ...base, APP_ENV }).APP_ENV, APP_ENV);
  }
  assert.equal(
    loadConfig({ ...base, FEATURE_CATALOG: 'false' }).FEATURE_CATALOG,
    false,
  );
  assert.throws(() => loadConfig({ ...base, FEATURE_CATALOG: 'yes' }));
  assert.throws(() =>
    loadConfig({
      ...base,
      APP_ENV: 'production',
      SUPABASE_URL: 'http://localhost:54321',
    }),
  );
  assert.throws(() =>
    loadConfig({
      ...base,
      APP_ENV: 'staging',
      SUPABASE_PUBLISHABLE_KEY: 'replace-with-key',
    }),
  );
  assert.throws(() =>
    loadConfig({
      ...base,
      APP_ENV: 'staging',
      WEB_ORIGIN: 'http://localhost:8081',
    }),
  );
});

test('feature kill switches block database work while health remains available', async () => {
  const app = buildApp(
    {
      url: base.SUPABASE_URL,
      key: base.SUPABASE_PUBLISHABLE_KEY,
      environment: 'staging',
      features: { catalog: false, savedRecipes: false },
      logLevel: 'silent',
    },
    () => {
      throw new Error('Must not query');
    },
  );
  try {
    for (const [method, url] of [
      ['GET', '/v1/recipes'],
      ['GET', '/v1/saved'],
      ['PUT', '/v1/saved/00000000-0000-4000-8000-000000000001'],
      ['DELETE', '/v1/saved/00000000-0000-4000-8000-000000000001'],
    ] as const) {
      const result = await app.inject({
        method,
        url,
        headers: { 'x-request-id': 'untrusted-id' },
      });
      assert.equal(result.statusCode, 503);
      assert.equal(result.json().error.code, 'FEATURE_DISABLED');
      assert.equal(
        result.json().error.requestId,
        result.headers['x-request-id'],
      );
      assert.notEqual(result.headers['x-request-id'], 'untrusted-id');
    }
    assert.equal((await app.inject('/health')).json().features.catalog, false);
    assert.equal((await app.inject('/ready')).statusCode, 503);
  } finally {
    await app.close();
  }
});

test('monitoring emits safe route templates, status, duration and correlation without private content', async () => {
  let logs = '';
  const stream = new Writable({
    write(chunk, _encoding, done) {
      logs += String(chunk);
      done();
    },
  });
  const app = buildApp(
    {
      url: base.SUPABASE_URL,
      key: base.SUPABASE_PUBLISHABLE_KEY,
      environment: 'development',
      logStream: stream,
    },
    () => {
      throw new Error('private-upstream-detail');
    },
  );
  try {
    await app.inject({
      url: '/v1/recipes?q=private-search',
      headers: {
        authorization: 'Bearer private-token',
        cookie: 'private-cookie',
      },
    });
    const missing = await app.inject('/private-path?note=private-note');
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, 'NOT_FOUND');
    assert.equal((await app.inject('/ready')).statusCode, 503);
    const events = logs
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((line) => line.event === 'http_request');
    assert.equal(events.length, 3);
    assert.equal(events[0].route, '/v1/recipes');
    assert.equal(events[0].statusCode, 500);
    assert.equal(typeof events[0].durationMs, 'number');
    assert.ok(events[0].requestId);
    assert.equal(events[1].route, 'unmatched');
    for (const secret of [
      'private-search',
      'private-token',
      'private-cookie',
      'private-upstream-detail',
      'private-path',
      'private-note',
    ])
      assert.equal(logs.includes(secret), false);
  } finally {
    await app.close();
  }
});

test('mobile build environments have distinct identities and require hosted configuration', () => {
  const configure = createRequire(import.meta.url)(
    '../../mobile/app.config.js',
  );
  const original = { ...process.env };
  try {
    delete process.env.EXPO_PUBLIC_RELEASE_SCOPE;
    const identities = new Set();
    Object.assign(process.env, {
      EXPO_PUBLIC_API_URL: 'https://api.example.com',
      EXPO_PUBLIC_SUPABASE_URL: base.SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: base.SUPABASE_PUBLISHABLE_KEY,
    });
    for (const APP_ENV of ['development', 'staging', 'production']) {
      process.env.APP_ENV = APP_ENV;
      const result = configure({
        config: { name: 'Table for One', ios: { supportsTablet: true } },
      });
      identities.add(result.ios.bundleIdentifier);
      assert.equal(result.extra.environment, APP_ENV);
      assert.equal(result.extra.releaseScope, 'core');
      assert.equal(result.ios.supportsTablet, true);
    }
    assert.equal(identities.size, 3);
    process.env.EXPO_PUBLIC_RELEASE_SCOPE = 'extended';
    for (const APP_ENV of ['staging', 'production']) {
      process.env.APP_ENV = APP_ENV;
      assert.throws(() => configure({ config: {} }), /core release scope/);
    }
    process.env.APP_ENV = 'development';
    assert.equal(configure({ config: {} }).extra.releaseScope, 'extended');
    process.env.EXPO_PUBLIC_RELEASE_SCOPE = 'typo';
    assert.throws(() => configure({ config: {} }), /core or extended/);
    delete process.env.EXPO_PUBLIC_RELEASE_SCOPE;
    process.env.APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
    assert.throws(() => configure({ config: {} }));
  } finally {
    process.env = original;
  }
});
