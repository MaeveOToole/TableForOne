import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { registerAccountRoutes } from '../src/account.js';
import { accountStorage } from '../../mobile/src/lib/account-storage.js';

const owner = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';

test('account deletion verifies identity, rejects injected targets and gates missing setup without deleting', async () => {
  const app = Fastify();
  let enabled = true,
    failure = false;
  const deleted: string[] = [];
  app.setErrorHandler((error, _req, reply) =>
    reply
      .code(
        error instanceof z.ZodError
          ? 400
          : (error as { statusCode?: number }).statusCode || 500,
      )
      .send({ failed: true }),
  );
  registerAccountRoutes(
    app,
    async (authorization) => {
      if (authorization !== 'Bearer owner')
        throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      return {
        userId: owner,
        db: {
          rpc: async () => ({ data: enabled, error: null }),
        } as unknown as SupabaseClient,
      };
    },
    () =>
      ({
        auth: {
          admin: {
            deleteUser: async (id: string, soft: boolean) => {
              assert.equal(soft, false);
              if (!failure) deleted.push(id);
              return { error: failure ? new Error('failure') : null };
            },
          },
        },
      }) as unknown as SupabaseClient,
  );
  try {
    assert.equal(
      (
        await app.inject({
          method: 'DELETE',
          url: '/v1/account',
          payload: { confirmation: 'DELETE' },
        })
      ).statusCode,
      401,
    );
    const headers = { authorization: 'Bearer owner' };
    for (const payload of [
      { confirmation: 'DELETE', userId: other },
      { confirmation: 'yes' },
      {},
    ])
      assert.equal(
        (
          await app.inject({
            method: 'DELETE',
            url: '/v1/account',
            headers,
            payload,
          })
        ).statusCode,
        400,
      );
    assert.deepEqual(deleted, []);
    enabled = false;
    assert.deepEqual(
      (
        await app.inject({ url: '/v1/account/deletion-status', headers })
      ).json(),
      { available: false },
    );
    assert.equal(
      (
        await app.inject({
          method: 'DELETE',
          url: '/v1/account',
          headers,
          payload: { confirmation: 'DELETE' },
        })
      ).statusCode,
      503,
    );
    assert.deepEqual(deleted, []);
    enabled = true;
    failure = true;
    assert.equal(
      (
        await app.inject({
          method: 'DELETE',
          url: '/v1/account',
          headers,
          payload: { confirmation: 'DELETE' },
        })
      ).statusCode,
      503,
    );
    failure = false;
    assert.deepEqual(
      (
        await app.inject({
          method: 'DELETE',
          url: '/v1/account',
          headers,
          payload: { confirmation: 'DELETE' },
        })
      ).json(),
      { deleted: true },
    );
    assert.deepEqual(deleted, [owner]);
  } finally {
    await app.close();
  }
});

test('account cache erasure isolates owners, blocks stale writes and survives a new storage wrapper', async () => {
  const values = new Map<string, string>();
  const raw = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: async (key: string) => {
      values.delete(key);
    },
    getAllKeys: async () => [...values.keys()],
  };
  const store = accountStorage(raw);
  const keys = ['groceries', 'library', 'week-view', 'grocery-details-cap'].map(
    (kind) => `meal-${kind}-v1:${owner}:test`,
  );
  await Promise.all(keys.map((key) => store.setItem(key, 'private')));
  await store.setItem(`meal-groceries-v1:${other}:test`, 'keep');
  await store.setItem('unrelated', 'keep');
  const pending = store.setItem(keys[0], 'late');
  await store.clearAccount(owner);
  await pending;
  keys.forEach((key) => assert.equal(values.has(key), false));
  assert.equal(values.get(`meal-groceries-v1:${other}:test`), 'keep');
  assert.equal(values.get('unrelated'), 'keep');
  const reopened = accountStorage(raw);
  await assert.rejects(reopened.setItem(keys[0], 'resurrect'), /deleted/);
  assert.equal(await reopened.getItem(keys[0]), null);
});

test('Auth deletion removes linked account data atomically while preserving public recipes and independent copies', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const dir = new URL('../../../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(dir))
      .filter((file) => file.endsWith('.sql'))
      .sort())
      await db.exec(await readFile(new URL(file, dir), 'utf8'));
    await db.exec(`insert into auth.users(id,email) values('${owner}','owner@example.test'),('${other}','other@example.test');
      insert into public.recipes select (jsonb_populate_record(null::public.recipes,to_jsonb(r)||jsonb_build_object('id','20000000-0000-4000-8000-000000000001','owner_id','${owner}','title','Private'))).* from public.recipes r where owner_id is null limit 1;
      insert into public.recipes select (jsonb_populate_record(null::public.recipes,to_jsonb(r)||jsonb_build_object('id','20000000-0000-4000-8000-000000000002','owner_id','${other}','source_recipe_id',r.id,'title','Independent copy'))).* from public.recipes r where owner_id='${owner}';
      insert into public.recipe_versions(id,user_id,recipe_id,snapshot,extraction_method) select '30000000-0000-4000-8000-000000000001','${owner}',id,to_jsonb(r),'original' from public.recipes r where owner_id='${owner}';
      insert into public.recipe_ingredients(user_id,recipe_version_id,position,raw_text) values('${owner}','30000000-0000-4000-8000-000000000001',0,'1 onion');
      insert into public.cooking_events(user_id,recipe_version_id,cooked_at,prepared_servings) values('${owner}','30000000-0000-4000-8000-000000000001',now(),2);
      insert into public.import_jobs(user_id,source_url,recipe_version_id) values('${owner}','https://example.test/recipe','30000000-0000-4000-8000-000000000001');
      insert into public.plans(id,user_id,week_start) values('40000000-0000-4000-8000-000000000001','${owner}','2026-11-02');
      insert into public.plan_slots(user_id,plan_id,day,meal,kind,recipe_version_id,servings) values('${owner}','40000000-0000-4000-8000-000000000001','2026-11-02','dinner','cook','30000000-0000-4000-8000-000000000001',2);
      insert into public.grocery_lists(id,user_id,plan_id) values('60000000-0000-4000-8000-000000000001','${owner}','40000000-0000-4000-8000-000000000001');
      insert into public.grocery_items(user_id,list_id,name,raw_text,origin) values('${owner}','60000000-0000-4000-8000-000000000001','Onion','1 onion','manual');
      insert into public.saved_recipes(user_id,recipe_id) values('${owner}','20000000-0000-4000-8000-000000000001'),('${other}','20000000-0000-4000-8000-000000000002');
      insert into public.pantry_items(user_id,name,raw_text) values('${owner}','Spinach','Spinach'),('${other}','Keep','Keep');
      insert into public.regular_purchases(user_id,name) values('${owner}','Milk');
      insert into public.weekly_checkouts(user_id,week_start,actual_cents) values('${owner}','2026-11-02',1000);
      insert into public.weekly_budgets(user_id,week_start,ceiling_cents) values('${owner}','2026-11-02',10000);
      insert into public.chat_threads(id,user_id) values('70000000-0000-4000-8000-000000000001','${owner}');
      insert into public.chat_messages(user_id,thread_id,role,content) values('${owner}','70000000-0000-4000-8000-000000000001','user','Private');
      insert into public.ratings(user_id,recipe_id,stars) values('${other}','20000000-0000-4000-8000-000000000001',4);`);
    // A constraint failure must roll back all cleanup, not leave a half-deleted account.
    await assert.rejects(db.exec(`delete from auth.users where id='${owner}'`));
    assert.equal(
      (await db.query('select * from public.grocery_items')).rows.length,
      1,
    );
    assert.equal(
      (await db.query(`select * from auth.users where id='${owner}'`)).rows
        .length,
      1,
    );
    await db.exec(
      `delete from public.ratings where user_id='${other}';delete from auth.users where id='${owner}'`,
    );
    for (const table of [
      'preferences',
      'profiles',
      'recipe_versions',
      'recipe_ingredients',
      'cooking_events',
      'import_jobs',
      'plans',
      'plan_slots',
      'grocery_lists',
      'grocery_items',
      'saved_recipes',
      'pantry_items',
      'regular_purchases',
      'weekly_checkouts',
      'weekly_budgets',
      'chat_threads',
      'chat_messages',
    ])
      assert.equal(
        (
          await db.query(
            `select * from public.${table} where user_id='${owner}'`,
          )
        ).rows.length,
        0,
        table,
      );
    const copy = (
      await db.query<{
        source_recipe_id: string | null;
        title: string;
        revision: number;
      }>(`select * from public.recipes where owner_id='${other}'`)
    ).rows[0];
    assert.equal(copy.title, 'Independent copy');
    assert.equal(copy.source_recipe_id, null);
    assert.equal(copy.revision, 2);
    assert.equal(
      (
        await db.query(
          `select * from public.pantry_items where user_id='${other}'`,
        )
      ).rows.length,
      1,
    );
    assert.ok(
      (await db.query('select * from public.recipes where owner_id is null'))
        .rows.length > 0,
    );
    await db.exec('set role anon');
    await assert.rejects(
      db.exec('select public.account_deletion_ready()'),
      /permission denied/,
    );
    await db.exec('reset role;set role authenticated');
    await assert.rejects(
      db.exec(`delete from auth.users where id='${other}'`),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
