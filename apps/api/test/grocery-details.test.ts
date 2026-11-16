import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { planDocumentSchema, resourceSchemas } from '@meal/contracts';
import { buildApp } from '../src/app.js';
const owner = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
test('grocery details are private, repeat-safe, revisioned and preserved by plan regeneration', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const dir = new URL('../../../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(dir))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile(new URL(file, dir), 'utf8'));
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [
      owner,
      'a@example.test',
      other,
      'b@example.test',
    ]);
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`,
    );
    const planId = randomUUID(),
      projection = [
        {
          originKey: 'milk',
          name: 'Milk',
          rawText: '1 bottle Milk',
          quantity: 1,
          unit: 'bottle',
          origins: [],
        },
      ];
    const commit = async (
      key: string,
      revision: number,
      groceryRevision: number,
    ) =>
      planDocumentSchema.parse(
        (
          await db.query<{ result: unknown }>(
            'select public.apply_foundation_mutation($1,$2,$3,$4,$5) as result',
            [
              key,
              'plan.commit',
              planId,
              revision,
              JSON.stringify({
                weekStart: '2026-11-02',
                slots: [],
                groceries: projection,
                groceryRevision,
              }),
            ],
          )
        ).rows[0].result,
      );
    const plan = await commit('details-plan-001', 0, 0),
      item = plan.groceries.items[0];
    const payload = {
      listId: plan.groceries.id,
      name: item.name,
      rawText: item.raw_text,
      quantity: item.quantity,
      unit: item.unit,
      checked: true,
      deleted: false,
      section: 'Cooler',
      notes: 'Unsweetened',
    };
    const write = async (key: string, revision: number, body: unknown) =>
      (
        await db.query<{ result: { item: unknown; listRevision: number } }>(
          'select public.apply_grocery_details_mutation($1,$2,$3,$4) as result',
          [key, item.id, revision, JSON.stringify(body)],
        )
      ).rows[0].result;
    const result = await write('details-save-001', item.revision, payload),
      edited = resourceSchemas.grocery_items.parse(result.item);
    assert.equal(edited.notes, 'Unsweetened');
    assert.equal(edited.section, 'Cooler');
    assert.equal(edited.checked, true);
    assert.equal(edited.overridden, false);
    assert.deepEqual(
      await write('details-save-001', item.revision, payload),
      result,
    );
    await assert.rejects(
      write('details-stale-001', item.revision, payload),
      /Revision conflict/,
    );
    await assert.rejects(
      write('details-save-001', item.revision, {
        ...payload,
        notes: 'Different',
      }),
      /Idempotency conflict/,
    );
    const regenerated = await commit(
      'details-plan-002',
      plan.revision,
      result.listRevision,
    );
    assert.equal(regenerated.groceries.items[0].notes, 'Unsweetened');
    assert.equal(regenerated.groceries.items[0].section, 'Cooler');
    assert.equal(regenerated.groceries.items[0].checked, true);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${other}',false)`,
    );
    await assert.rejects(
      write('details-other-001', edited.revision, payload),
      /Not found/,
    );
  } finally {
    await db.close();
  }
});
test('grocery detail routes authenticate before accessing the database', async () => {
  const app = buildApp(
    {
      url: 'https://example.supabase.co',
      key: 'public-test-key',
      environment: 'development',
      logLevel: 'silent',
    },
    () => {
      throw new Error('No database access');
    },
  );
  try {
    assert.equal(
      (await app.inject('/v1/grocery-details-status')).statusCode,
      401,
    );
    assert.equal(
      (await app.inject(`/v1/grocery-lists/${owner}/items`)).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: `/v1/grocery-items/${owner}/details`,
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});
