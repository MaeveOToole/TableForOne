import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { planDocumentSchema } from '@meal/contracts';
const owner = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';

test('kitchen transactions preserve uncertainty, deduplicate regular purchases, reject stale writes, and isolate accounts', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
    const directory = new URL('../../../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(directory))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile(new URL(file, directory), 'utf8'));
    await db.exec(
      await readFile(
        new URL('../../../supabase/seed.sql', import.meta.url),
        'utf8',
      ),
    );
    await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4)', [
      owner,
      'a@example.test',
      other,
      'b@example.test',
    ]);
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false)`,
    );
    const mutate = async (
      key: string,
      action: string,
      id: string,
      revision: number,
      payload: unknown,
    ) =>
      (
        await db.query<{ result: Record<string, unknown> }>(
          'select public.apply_kitchen_mutation($1,$2,$3,$4,$5) as result',
          [key, action, id, revision, JSON.stringify(payload)],
        )
      ).rows[0].result;
    const pantryId = randomUUID();
    const payload = {
      name: 'spinach',
      quantity: null,
      unit: null,
      useSoon: true,
      staple: false,
      notes: 'Check what is left',
    };
    const first = await mutate(
      'pantry-create-001',
      'pantry.upsert',
      pantryId,
      0,
      payload,
    );
    assert.equal(first.quantity, null);
    assert.equal(first.use_soon, true);
    assert.deepEqual(
      await mutate('pantry-create-001', 'pantry.upsert', pantryId, 0, payload),
      first,
    );
    await assert.rejects(
      mutate('pantry-stale-001', 'pantry.upsert', pantryId, 0, payload),
      /Revision conflict/,
    );
    await assert.rejects(
      mutate('pantry-create-001', 'pantry.upsert', pantryId, 0, {
        ...payload,
        name: 'other',
      }),
      /Idempotency conflict/,
    );
    await assert.rejects(
      mutate('pantry-invalid-001', 'pantry.upsert', pantryId, 1, {
        ...payload,
        quantity: -1,
      }),
      /check constraint/,
    );
    const purchaseId = randomUUID();
    await mutate('regular-create-001', 'regular.upsert', purchaseId, 0, {
      name: 'Yogurt',
      quantity: 2,
      unit: 'tubs',
      cadenceWeeks: 2,
      enabled: true,
    });
    const planId = randomUUID();
    const plan = (
      await db.query<{
        result: { groceries: { id: string; revision: number } };
      }>('select public.apply_foundation_mutation($1,$2,$3,0,$4) as result', [
        'empty-week-001',
        'plan.commit',
        planId,
        JSON.stringify({
          weekStart: '2026-11-02',
          slots: [],
          groceries: [],
          groceryRevision: 0,
        }),
      ])
    ).rows[0].result;
    const include = { purchaseId, included: true };
    const included = await mutate(
      'regular-include-001',
      'regular.include',
      plan.groceries.id,
      plan.groceries.revision,
      include,
    );
    assert.deepEqual(
      await mutate(
        'regular-include-001',
        'regular.include',
        plan.groceries.id,
        plan.groceries.revision,
        include,
      ),
      included,
    );
    let list = included.groceries as {
      revision: number;
      items: { id: string; origin: string; quantity: number }[];
    };
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].origin, 'regular');
    assert.equal(list.items[0].quantity, 2);
    const again = await mutate(
      'regular-include-002',
      'regular.include',
      plan.groceries.id,
      list.revision,
      include,
    );
    list = again.groceries as typeof list;
    assert.equal(list.items.length, 1);
    const versionId = randomUUID(),
      slotId = randomUUID();
    await db.query(
      `insert into public.recipe_versions(id,recipe_id,snapshot,extraction_method) values($1,'00000000-0000-4000-8000-000000000001','{}','generated')`,
      [versionId],
    );
    const currentPlan = planDocumentSchema.parse(again);
    const cooked = planDocumentSchema.parse(
      (
        await db.query<{ result: unknown }>(
          'select public.apply_foundation_mutation($1,$2,$3,$4,$5) as result',
          [
            'lock-setup-001',
            'plan.commit',
            planId,
            currentPlan.revision,
            JSON.stringify({
              weekStart: '2026-11-02',
              slots: [
                {
                  id: slotId,
                  day: '2026-11-02',
                  meal: 'dinner',
                  kind: 'cook',
                  recipeVersionId: versionId,
                  preparedSlotId: null,
                  servings: 2,
                  locked: false,
                },
              ],
              groceries: [],
              groceryRevision: currentPlan.groceries.revision,
            }),
          ],
        )
      ).rows[0].result,
    );
    const locked = planDocumentSchema.parse(
      await mutate('lock-meal-001', 'plan.lock', planId, cooked.revision, {
        slotId,
        slotRevision: cooked.slots[0].revision,
        locked: true,
      }),
    );
    assert.equal(locked.slots[0].locked, true);
    assert.equal(locked.revision, cooked.revision + 1);
    const unlocked = planDocumentSchema.parse(
      await mutate('unlock-meal-001', 'plan.lock', planId, locked.revision, {
        slotId,
        slotRevision: locked.slots[0].revision,
        locked: false,
      }),
    );
    assert.equal(unlocked.slots[0].locked, false);
    await assert.rejects(
      mutate('stale-lock-001', 'plan.lock', planId, locked.revision, {
        slotId,
        slotRevision: locked.slots[0].revision,
        locked: false,
      }),
      /Revision conflict/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${other}',false)`,
    );
    assert.equal(
      (await db.query('select * from public.pantry_items')).rows.length,
      0,
    );
    await assert.rejects(
      mutate('other-write-001', 'pantry.upsert', pantryId, 1, payload),
      /Revision conflict/,
    );
    await assert.rejects(
      mutate(
        'other-list-001',
        'regular.include',
        plan.groceries.id,
        list.revision,
        include,
      ),
      /Not found/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false)`,
    );
    await mutate('pantry-delete-001', 'pantry.delete', pantryId, 1, {});
    assert.equal(
      (await db.query('select * from public.pantry_items')).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test('kitchen routes reject anonymous access before database work', async () => {
  const app = buildApp(
    {
      url: 'https://example.supabase.co',
      key: 'public-test-key',
      environment: 'development',
      logLevel: 'silent',
    },
    () => {
      throw new Error('Database must not be used');
    },
  );
  try {
    for (const [method, url] of [
      ['GET', '/v1/kitchen-status'],
      ['PUT', `/v1/pantry-items/${owner}`],
      ['DELETE', `/v1/pantry-items/${owner}`],
      ['PUT', `/v1/regular-purchases/${owner}`],
      ['PUT', `/v1/grocery-lists/${owner}/regular-purchases`],
      ['PUT', `/v1/plans/${owner}/lock`],
    ] as const)
      assert.equal((await app.inject({ method, url })).statusCode, 401);
  } finally {
    await app.close();
  }
});
