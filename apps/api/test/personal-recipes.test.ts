import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { recipeSchema } from '@meal/contracts';
import {
  completePersonalRecipe,
  personalRecipeDetailsVersion,
} from '../src/personal-recipe-details';
import details from '../src/data/personal-recipe-details.json';

const summaries = JSON.parse(
  readFileSync(
    new URL('../../../supabase/import-personal-recipes.sql', import.meta.url),
    'utf8',
  ).match(/\$recipes\$([\s\S]*?)\$recipes\$/)![1],
) as { entry: number; title: string; description: string; category: string }[];
function draft(row = summaries[0]) {
  const owner = '10000000-0000-4000-8000-000000000001';
  const hex = createHash('md5')
    .update(`${owner}:personal-pdf:${row.entry}`)
    .digest('hex');
  return recipeSchema.parse({
    id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    owner_id: owner,
    title: row.title,
    description: row.description,
    cuisine: 'Not recorded',
    category: row.category,
    minutes: null,
    servings: null,
    difficulty: null,
    incomplete: true,
    ingredients: [],
    instructions: [],
    provenance: {
      source: 'Your ChatGPT recipe collection',
      method: 'generated',
      url: null,
      permission: 'Personal recipe summary; full details not recovered.',
    },
  });
}
test('all 48 original imports get complete, traceable details without mutating original summaries', () => {
  assert.equal(details.length, 48);
  assert.equal(new Set(details.map((detail) => detail.entry)).size, 48);
  for (const row of summaries) {
    const original = draft(row);
    const before = structuredClone(original);
    const completed = completePersonalRecipe(original);
    assert.doesNotThrow(() => recipeSchema.parse(completed));
    assert.equal(completed.incomplete, false, row.title);
    assert.ok(completed.minutes! > 0, row.title);
    assert.ok(completed.servings! > 0, row.title);
    assert.equal(completed.equipment_known, true, row.title);
    assert.ok(completed.ingredients.length >= 3, row.title);
    assert.ok(completed.instructions.length >= 2, row.title);
    assert.equal(completed.id, original.id);
    assert.equal(completed.owner_id, original.owner_id);
    assert.equal(completed.description, original.description);
    assert.deepEqual(completed.provenance, original.provenance);
    assert.equal(
      completed.personal_modifications[0].kind,
      personalRecipeDetailsVersion,
    );
    assert.match(
      String(completed.personal_modifications[0].note),
      /Not kitchen-tested/,
    );
    assert.deepEqual(original, before);
    assert.deepEqual(completePersonalRecipe(completed), completed);
  }
});
test('public recipes, unrelated IDs, edited and partial recipes are never replaced', () => {
  const original = draft();
  for (const protectedRecipe of [
    { ...original, owner_id: null },
    { ...original, id: '20000000-0000-4000-8000-000000000001' },
    { ...original, instructions: ['My original instructions'] },
    {
      ...original,
      personal_modifications: [{ method: 'manual', note: 'My changes' }],
    },
    { ...original, incomplete: false },
    {
      ...original,
      provenance: { ...original.provenance, source: 'Another source' },
    },
  ])
    assert.equal(completePersonalRecipe(protectedRecipe), protectedRecipe);
});
test('chilled and frozen recipes include waiting time, and distinct mac-and-cheese variations remain distinct', () => {
  assert.ok(details.find((detail) => detail.entry === 32)!.minutes >= 240);
  assert.ok(details.find((detail) => detail.entry === 33)!.minutes >= 240);
  assert.ok(details.find((detail) => detail.entry === 38)!.minutes >= 120);
  assert.notDeepEqual(
    details.find((detail) => detail.entry === 8)!.ingredients,
    details.find((detail) => detail.entry === 25)!.ingredients,
  );
});
