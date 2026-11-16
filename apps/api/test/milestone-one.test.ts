import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultPreferences,
  preferencesSchema,
  recipeSchema,
  discoverRecipes,
  scaleRecipe,
  recoveryCredential,
} from '@meal/contracts';
import { OriginalRecipeProvider } from '../src/recipe-provider.js';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const context = { pantry: [], ratings: {}, cooked: {} };
test('starter catalog provides a complete week without imports and has reproducible normalized quantities', async () => {
  const provider = new OriginalRecipeProvider();
  const first = await provider.list({ q: '', offset: 0, limit: 5 });
  const second = await provider.list({ q: '', offset: 5, limit: 50 });
  assert.equal(first.nextOffset, 5);
  const recipes = [...first.items, ...second.items];
  assert.equal(recipes.length, 12);
  assert.ok(recipes.filter((r) => r.category === 'dinner').length >= 7);
  const ranked = discoverRecipes(recipes, defaultPreferences, context);
  assert.ok(ranked.filter((r) => r.recipe.category === 'dinner').length >= 7);
  for (const recipe of recipes) {
    assert.equal(recipe.incomplete, false);
    assert.ok(recipe.instructions.length >= 3);
    assert.ok(recipe.ingredients.every((i) => i.quantity !== null));
    assert.equal(recipe.provenance.method, 'generated');
    assert.equal(recipe.image_url, null);
    assert.equal(recipe.nutrition, null);
  }
});
test('discovery excludes unknown dietary/equipment/cost data before ranking and explains use-soon matches', async () => {
  const { items } = await new OriginalRecipeProvider().list({
    q: '',
    offset: 0,
    limit: 50,
  });
  const chosen = items[0];
  const rated = {
    pantry: [{ name: 'spinach', useSoon: true }],
    ratings: { [chosen.id]: 5 },
    cooked: {},
  };
  assert.equal(
    discoverRecipes(items, defaultPreferences, rated)[0].recipe.id,
    chosen.id,
  );
  assert.ok(
    discoverRecipes(items, defaultPreferences, rated)[0].reasons.some((s) =>
      s.includes('use soon'),
    ),
  );
  assert.equal(
    discoverRecipes(
      items,
      {
        ...defaultPreferences,
        dietaryRestrictions: ['Unverified custom restriction'],
      },
      context,
    ).length,
    0,
  );
  assert.equal(
    discoverRecipes(items, defaultPreferences, context, { maxCostCents: 10000 })
      .length,
    0,
  );
  const noEquipment = { ...defaultPreferences, equipment: [] };
  assert.ok(
    discoverRecipes(items, noEquipment, context).every(
      (r) => r.recipe.equipment.length === 0,
    ),
  );
  assert.equal(
    discoverRecipes(
      [recipeSchema.parse({ ...chosen, equipment_known: false })],
      defaultPreferences,
      context,
    ).length,
    0,
  );
});
test('serving changes preserve raw text, notes and unknowns without modifying instructions', async () => {
  const base = (
    await new OriginalRecipeProvider().list({ q: '', offset: 0, limit: 1 })
  ).items[0];
  const recipe = recipeSchema.parse({
    ...base,
    ingredients: [
      {
        raw: 'Half an onion, chopped',
        name: 'onion',
        quantity: 0.5,
        unit: 'whole',
        notes: 'chopped',
      },
      {
        raw: 'salt to taste',
        name: 'salt',
        quantity: null,
        unit: null,
        notes: 'to taste',
      },
    ],
  });
  const scaled = scaleRecipe(recipe, 4);
  assert.equal(scaled.ingredients[0].quantity, 1);
  assert.equal(scaled.ingredients[0].raw, recipe.ingredients[0].raw);
  assert.equal(scaled.ingredients[1].quantity, null);
  assert.ok(scaled.warning.includes('instructions'));
  assert.equal(
    scaleRecipe({ ...recipe, servings: null }, 4).ingredients[0].quantity,
    0.5,
  );
  assert.throws(() => scaleRecipe(recipe, 0));
});
test('legacy profiles gain editable milestone-one defaults without changing saved fields', () => {
  const p = preferencesSchema.parse({
    displayName: 'Maeve',
    weeklyBudgetCents: 12000,
  });
  assert.equal(p.onboardingCompleted, false);
  assert.equal(p.people, 1);
  assert.equal(p.cookingSessions, 3);
  assert.equal(p.portions, 2);
  assert.equal(p.maxMinutes, 60);
  assert.equal(p.nextDayLeftovers, true);
  assert.equal(p.allowFreezing, false);
  assert.equal(p.weeklyBudgetCents, 12000);
  assert.ok(p.equipment.includes('Ninja blender'));
  assert.ok(p.regularGroceries.includes('Yogurt'));
  assert.ok(p.preferredStores.includes('Wegmans'));
  assert.deepEqual(preferencesSchema.parse(JSON.parse(JSON.stringify(p))), p);
});
test('recovery accepts only a trusted recovery link or an emailed OTP', () => {
  assert.deepEqual(
    recoveryCredential('123456', 'https://example.supabase.co'),
    { token: '123456' },
  );
  const token = 'a'.repeat(64);
  assert.deepEqual(
    recoveryCredential(
      `https://example.supabase.co/auth/v1/verify?type=recovery&token=${token}`,
      'https://example.supabase.co',
    ),
    { token_hash: token },
  );
  assert.throws(() =>
    recoveryCredential(
      `https://attacker.test/auth/v1/verify?type=recovery&token=${token}`,
      'https://example.supabase.co',
    ),
  );
  assert.throws(() =>
    recoveryCredential(
      `https://example.supabase.co/auth/v1/verify?type=signup&token=${token}`,
      'https://example.supabase.co',
    ),
  );
});
test('reviewed upgrade preserves initialized development data and is repeat-safe', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
    );
    await db.exec(
      await readFile(
        new URL(
          '../../../supabase/migrations/202610260001_foundation.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.exec(
      await readFile(
        new URL('../../../supabase/seed.sql', import.meta.url),
        'utf8',
      ),
    );
    const upgrade = await readFile(
      new URL('../../../supabase/upgrade-milestone-one.sql', import.meta.url),
      'utf8',
    );
    await db.exec(upgrade);
    await db.exec(upgrade);
    const result = await db.query<{ marker: string; count: number }>(
      `select public.foundation_ready() as marker,(select count(*)::integer from public.recipes) as count`,
    );
    assert.equal(result.rows[0].marker, '202610270004');
    assert.equal(result.rows[0].count, 18);
  } finally {
    await db.close();
  }
});
