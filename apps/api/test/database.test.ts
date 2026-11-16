import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { defaultPreferences, planDocumentSchema } from '@meal/contracts';

const owner = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const recipe = '00000000-0000-4000-8000-000000000001';

test('domain migrations execute in PostgreSQL and enforce private ownership', async () => {
  const db = new PGlite();
  try {
    // Only the Supabase auth boundary is stubbed; all application SQL is unchanged.
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;`);
    const directory = new URL('../../../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(directory))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      await db.exec(await readFile(new URL(file, directory), 'utf8'));
    }
    await db.exec(
      await readFile(
        new URL('../../../supabase/seed.sql', import.meta.url),
        'utf8',
      ),
    );
    await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4)', [
      owner,
      'one@example.test',
      other,
      'two@example.test',
    ]);
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    const pantry = await db.query<{ id: string }>(
      "insert into public.pantry_items(name,raw_text) values ('onion','half an onion') returning id",
    );
    await assert.rejects(
      db.query('update public.pantry_items set quantity=1 where id=$1', [
        pantry.rows[0].id,
      ]),
      /Revision conflict/,
    );
    await db.query(
      'update public.pantry_items set quantity=1, revision=2 where id=$1',
      [pantry.rows[0].id],
    );
    await assert.rejects(
      db.query(
        'update public.pantry_items set id=gen_random_uuid(),revision=3 where id=$1',
        [pantry.rows[0].id],
      ),
      /Immutable identity/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${other}',false);`,
    );
    assert.equal(
      (await db.query('select * from public.pantry_items')).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        'insert into public.pantry_items(user_id,name,raw_text) values ($1,$2,$3)',
        [owner, 'hidden', 'hidden'],
      ),
      /row-level security/,
    );
    await db.exec('reset role;');
    assert.equal(
      (await db.query('select * from public.recipes where id=$1', [recipe]))
        .rows.length,
      1,
    );
    await db.query(
      `update public.recipes set content_permissions='{"personalStorage":true,"redistribution":true}',revision=revision+1 where id=$1`,
      [recipe],
    );
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    const version = (
      await db.query<{ id: string }>(
        `insert into public.recipe_versions(recipe_id,snapshot,attribution,extraction_method,permissions)
      values ($1,$2,'{"source":"Test fixture"}','generated','{"personalStorage":true,"redistribution":true}') returning id`,
        [
          recipe,
          JSON.stringify({
            title: 'Recipe snapshot',
            description: 'Dinner',
            ingredients: [],
            instructions: ['Cook'],
            pantry: 'must not be shared',
          }),
        ],
      )
    ).rows[0].id;
    const planId = '20000000-0000-4000-8000-000000000001';
    const cookId = '30000000-0000-4000-8000-000000000001';
    const manualId = '40000000-0000-4000-8000-000000000001';
    const slots = [
      {
        id: cookId,
        day: '2026-10-26',
        meal: 'dinner',
        kind: 'cook',
        recipeVersionId: version,
        preparedSlotId: null,
        servings: 2,
        locked: false,
      },
    ];
    const groceries = [
      {
        originKey: 'onion:fresh:count',
        name: 'onion',
        rawText: '1 onion',
        quantity: 1,
        unit: 'count',
        origins: [{ slotId: cookId }],
      },
    ];
    const mutate = async (
      key: string,
      action: string,
      target: string,
      revision: number,
      payload: unknown,
    ) =>
      (
        await db.query<{ result: unknown }>(
          'select public.apply_foundation_mutation($1,$2,$3,$4,$5) as result',
          [key, action, target, revision, JSON.stringify(payload)],
        )
      ).rows[0].result;
    const firstPayload = {
      weekStart: '2026-10-26',
      groceryRevision: 0,
      slots,
      groceries,
    };
    const first = planDocumentSchema.parse(
      await mutate('create-plan-001', 'plan.commit', planId, 0, firstPayload),
    );
    assert.equal(first.groceryState, 'ready');
    assert.equal(first.groceries.items[0].quantity, 1);
    assert.deepEqual(
      await mutate('create-plan-001', 'plan.commit', planId, 0, firstPayload),
      first,
    );
    await assert.rejects(
      mutate('create-plan-001', 'plan.commit', planId, 0, {
        ...firstPayload,
        groceries: [],
      }),
      /Idempotency conflict/,
    );
    await assert.rejects(
      mutate('stale-plan-001', 'plan.commit', planId, 1, firstPayload),
      /Revision conflict/,
    );
    // Manual shopping edits increment the list revision, so a stale projection cannot overwrite them.
    const manual = {
      listId: first.groceries.id,
      name: 'yogurt',
      rawText: 'yogurt',
      quantity: null,
      unit: null,
      checked: true,
      deleted: false,
    };
    await mutate('manual-item-001', 'grocery.edit', manualId, 0, manual);
    const pendingPayload = {
      ...firstPayload,
      groceryRevision: first.groceries.revision,
      slots: [{ ...slots[0], servings: 3 }],
      groceries: [{ ...groceries[0], quantity: 2 }],
    };
    const pending = planDocumentSchema.parse(
      await mutate(
        'change-plan-001',
        'plan.commit',
        planId,
        first.revision,
        pendingPayload,
      ),
    );
    assert.equal(
      pending.slots[0].servings,
      3,
      'new plan is saved despite grocery conflict',
    );
    assert.equal(pending.groceryState, 'needs_review');
    assert.equal(pending.groceries.recoveryCode, 'GROCERY_REVISION_CONFLICT');
    assert.deepEqual(
      pending.groceries.items,
      [],
      'stale groceries are withheld from the plan document',
    );
    assert.equal(pending.recovery?.action, 'repair_groceries');
    const repaired = planDocumentSchema.parse(
      await mutate('repair-plan-001', 'plan.repair', planId, pending.revision, {
        groceryRevision: pending.groceries.revision,
      }),
    );
    assert.equal(repaired.groceryState, 'ready');
    assert.equal(
      repaired.groceries.items.find((i) => i.origin === 'derived')?.quantity,
      2,
    );
    assert.equal(
      repaired.groceries.items.find((i) => i.id === manualId)?.checked,
      true,
    );
    assert.equal(repaired.slots[0].id, cookId);
    assert.equal(
      repaired.slots[0].created_at,
      first.slots[0].created_at,
      'slot identity metadata survives replacement',
    );
    const bad = planDocumentSchema.parse(
      await mutate(
        'broken-list-001',
        'plan.commit',
        planId,
        repaired.revision,
        {
          ...firstPayload,
          groceryRevision: repaired.groceries.revision,
          groceries: [{ ...groceries[0], quantity: -1 }],
        },
      ),
    );
    assert.equal(
      bad.groceryState,
      'needs_review',
      'SQL constraint failure persists a recoverable projection',
    );
    const corrected = planDocumentSchema.parse(
      await mutate('correct-list-001', 'plan.commit', planId, bad.revision, {
        ...firstPayload,
        groceryRevision: bad.groceries.revision,
      }),
    );
    assert.equal(corrected.groceryState, 'ready');
    const derived = corrected.groceries.items.find(
      (i) => i.origin === 'derived',
    )!;
    await mutate(
      'override-item-001',
      'grocery.edit',
      derived.id,
      derived.revision,
      {
        listId: corrected.groceries.id,
        name: derived.name,
        rawText: derived.raw_text,
        quantity: 5,
        unit: derived.unit,
        checked: true,
        deleted: false,
      },
    );
    const listRevision = (
      await db.query<{ revision: number }>(
        'select revision from public.grocery_lists where id=$1',
        [corrected.groceries.id],
      )
    ).rows[0].revision;
    const preserved = planDocumentSchema.parse(
      await mutate(
        'preserve-edits-001',
        'plan.commit',
        planId,
        corrected.revision,
        { ...firstPayload, groceryRevision: listRevision },
      ),
    );
    assert.equal(
      preserved.groceries.items.find((i) => i.id === derived.id)?.quantity,
      5,
    );
    assert.equal(
      preserved.groceries.items.find((i) => i.id === derived.id)?.checked,
      true,
    );
    const locked = planDocumentSchema.parse(
      await mutate('lock-slot-001', 'plan.commit', planId, preserved.revision, {
        ...firstPayload,
        groceryRevision: preserved.groceries.revision,
        slots: [{ ...slots[0], locked: true }],
      }),
    );
    await assert.rejects(
      mutate('remove-locked-001', 'plan.commit', planId, locked.revision, {
        ...firstPayload,
        groceryRevision: locked.groceries.revision,
        slots: [],
      }),
      /Locked slot conflict/,
    );
    assert.equal(
      planDocumentSchema.parse(
        (
          await db.query<{ result: unknown }>(
            'select public.plan_document($1) as result',
            [planId],
          )
        ).rows[0].result,
      ).revision,
      locked.revision,
    );
    await assert.rejects(
      db.query(`insert into public.recipe_versions(recipe_id,snapshot,extraction_method,permissions)
      values('00000000-0000-4000-8000-000000000002','{}','generated','{"personalStorage":true,"redistribution":true}')`),
      /row-level security/,
    );
    const changed = await mutate(
      'preferences-001',
      'preferences.update',
      owner,
      1,
      defaultPreferences,
    );
    assert.deepEqual(
      await mutate(
        'preferences-001',
        'preferences.update',
        owner,
        1,
        defaultPreferences,
      ),
      changed,
    );
    await assert.rejects(
      mutate(
        'preferences-002',
        'preferences.update',
        owner,
        1,
        defaultPreferences,
      ),
      /Revision conflict/,
    );
    await mutate('save-recipe-001', 'saved.add', recipe, 0, {});
    await mutate('save-recipe-001', 'saved.add', recipe, 0, {});
    assert.equal(
      (await db.query('select * from public.saved_recipes')).rows.length,
      1,
    );
    const library = async (
      key: string,
      action: string,
      target: string,
      revision: number,
      payload: unknown,
    ) =>
      (
        await db.query<{ result: Record<string, unknown> }>(
          'select public.apply_library_mutation($1,$2,$3,$4,$5) as result',
          [key, action, target, revision, JSON.stringify(payload)],
        )
      ).rows[0].result;
    const collectionId = '60000000-0000-4000-8000-000000000001';
    const copyId = '70000000-0000-4000-8000-000000000001';
    const sourceId = '50000000-0000-4000-8000-000000000001';
    await library('collection-test-001', 'collection.create', collectionId, 0, {
      name: 'Weeknight favorites',
    });
    const original = (
      await db.query<{ title: string; ingredients: unknown }>(
        'select title,ingredients from public.recipes where id=$1',
        [sourceId],
      )
    ).rows[0];
    const changes = {
      sourceId,
      title: 'My lemon chickpea skillet',
      description: 'A personal variation',
      ingredients: original.ingredients,
      instructions: ['Warm the ingredients in a skillet.'],
      note: 'Changed the instructions.',
    };
    const copied = await library(
      'personal-copy-001',
      'recipe.copy',
      copyId,
      0,
      changes,
    );
    assert.equal(copied.owner_id, owner);
    assert.equal(copied.source_recipe_id, sourceId);
    assert.equal(
      (
        await db.query<{ title: string }>(
          'select title from public.recipes where id=$1',
          [sourceId],
        )
      ).rows[0].title,
      original.title,
    );
    assert.deepEqual(
      copied.dietary_tags,
      [],
      'personal changes invalidate source dietary claims',
    );
    assert.deepEqual(
      await library('personal-copy-001', 'recipe.copy', copyId, 0, changes),
      copied,
    );
    const organized = await library(
      'organize-copy-001',
      'saved.organize',
      copyId,
      1,
      { collectionId, plannedWeek: '2026-11-02' },
    );
    assert.equal(organized.collection_id, collectionId);
    assert.equal(organized.planned_week, '2026-11-02');
    await assert.rejects(
      library('stale-copy-001', 'recipe.edit', copyId, 2, changes),
      /Revision conflict/,
    );
    const budget = await library('weekly-budget-001', 'budget.set', owner, 0, {
      weekStart: '2026-11-02',
      ceilingCents: 14000,
    });
    assert.equal(budget.ceiling_cents, 14000);
    await assert.rejects(
      library('weekly-budget-002', 'budget.set', owner, 2, {
        weekStart: '2026-11-02',
        ceilingCents: 16000,
      }),
      /Revision conflict/,
    );
    const share = (
      await db.query<{ id: string }>(
        'insert into public.recipe_shares(recipe_version_id,recipient_id) values($1,$2) returning id',
        [version, other],
      )
    ).rows[0].id;
    await db.exec(
      `select set_config('request.jwt.claim.sub','${other}',false);`,
    );
    for (const table of [
      'recipe_versions',
      'plans',
      'plan_slots',
      'grocery_lists',
      'grocery_items',
      'mutations',
      'recipe_shares',
      'recipe_collections',
      'weekly_budgets',
    ])
      assert.equal(
        (await db.query(`select * from public.${table}`)).rows.length,
        0,
        `${table} is owner-only`,
      );
    await assert.rejects(
      db.query(
        'insert into public.recipe_ingredients(recipe_version_id,position,raw_text) values($1,0,$2)',
        [version, 'onion'],
      ),
      /foreign key/,
    );
    assert.equal(
      (await db.query('select * from public.recipes where id=$1', [copyId]))
        .rows.length,
      0,
    );
    await assert.rejects(
      library('attack-copy-001', 'recipe.edit', copyId, 1, changes),
      /Not found/,
    );
    await assert.rejects(
      library('attack-budget-001', 'budget.set', owner, 0, {
        weekStart: '2026-11-09',
        ceilingCents: 1,
      }),
      /Not found/,
    );
    const shared = (
      await db.query<{ result: Record<string, unknown> }>(
        'select public.read_shared_recipe($1) as result',
        [share],
      )
    ).rows[0].result;
    assert.equal(
      (shared.recipe as Record<string, unknown>).title,
      'Recipe snapshot',
    );
    assert.equal(JSON.stringify(shared).includes('must not be shared'), false);
    assert.equal(
      (
        await db.query<{ result: unknown }>(
          'select public.plan_document($1) as result',
          [planId],
        )
      ).rows[0].result,
      null,
    );
    await assert.rejects(
      mutate(
        'attack-plan-001',
        'plan.commit',
        planId,
        locked.revision,
        firstPayload,
      ),
      /Revision conflict/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    await db.query(
      'update public.recipe_shares set revoked_at=now(),revision=revision+1 where id=$1',
      [share],
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${other}',false);`,
    );
    assert.equal(
      (
        await db.query<{ result: unknown }>(
          'select public.read_shared_recipe($1) as result',
          [share],
        )
      ).rows[0].result,
      null,
    );
    await db.exec('set role anon;');
    await assert.rejects(
      db.query('select public.apply_foundation_mutation($1,$2,$3,0,$4)', [
        'anonymous-001',
        'saved.add',
        recipe,
        '{}',
      ]),
      /permission denied/,
    );
    await db.exec('reset role;');
    await db.query('delete from auth.users where id=$1', [owner]);
    assert.equal(
      (await db.query('select * from public.plans')).rows.length,
      0,
      'domain records cascade with account deletion',
    );
  } finally {
    await db.close();
  }
});
