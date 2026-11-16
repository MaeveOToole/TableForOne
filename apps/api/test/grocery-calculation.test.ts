import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGroceries,
  compatibleQuantity,
  recipeSchema,
} from '@meal/contracts';
import originals from '../../../packages/contracts/src/launch-recipes.json';
const recipe = recipeSchema.parse({
  ...originals[0],
  ingredients: [
    {
      name: 'onion',
      raw: 'half an onion',
      quantity: 0.5,
      unit: 'whole',
      notes: null,
      confidence: 'confirmed',
    },
    {
      name: 'tomatoes',
      raw: '100 g fresh tomatoes',
      quantity: 100,
      unit: 'g',
      notes: 'fresh',
      confidence: 'confirmed',
    },
    {
      name: 'tomatoes',
      raw: '100 g canned tomatoes',
      quantity: 100,
      unit: 'g',
      notes: 'canned',
      confidence: 'confirmed',
    },
  ],
});
test('two half onions merge, forms stay separate, and leftovers add no ingredients', () => {
  const sessions = ['a', 'b'].map((id) => ({
    id,
    kind: 'cook',
    recipe,
    servings: 2,
  }));
  const result = calculateGroceries([
    ...sessions,
    { id: 'c', kind: 'leftover', recipe, servings: 1 },
  ]);
  assert.equal(result.items.length, 3);
  assert.equal(result.items.find((i) => i.name === 'onion')!.quantity, 1);
  assert.equal(result.items.filter((i) => i.name === 'tomatoes').length, 2);
  assert.deepEqual(
    result,
    calculateGroceries([
      ...sessions,
      { id: 'c', kind: 'leftover', recipe, servings: 1 },
    ]),
  );
});
test('only compatible units merge and pantry uncertainty is never subtracted silently', () => {
  assert.equal(compatibleQuantity(1, 'kg').quantity, 1000);
  assert.notEqual(
    compatibleQuantity(1, 'cup').unit,
    compatibleQuantity(1, 'g').unit,
  );
  const result = calculateGroceries(
    [{ id: 'a', kind: 'cook', recipe, servings: 4 }],
    [
      { id: 'unknown', name: 'onion', quantity: null, unit: null },
      {
        id: 'known',
        name: 'tomatoes',
        quantity: 0.1,
        unit: 'kg',
        notes: 'fresh',
      },
    ],
  );
  assert.equal(result.items.find((i) => i.name === 'onion')!.quantity, 1);
  assert.equal(result.questions.length, 1);
  assert.equal(
    result.items.find((i) => i.originKey.includes('fresh'))!.quantity,
    100,
  );
});
test('unreviewed generated quantities and missing serving counts remain unknown', () => {
  const generated = recipeSchema.parse(originals[0]);
  const result = calculateGroceries([
    { id: 'a', kind: 'cook', recipe: generated, servings: 2 },
  ]);
  assert.ok(result.items.every((i) => i.quantity === null));
  assert.ok(result.warnings.length);
  const reviewed = calculateGroceries(
    [{ id: 'a', kind: 'cook', recipe: generated, servings: 2 }],
    [],
    [generated.id],
  );
  assert.ok(reviewed.items.every((i) => i.quantity !== null));
  const unknown = calculateGroceries(
    [
      {
        id: 'a',
        kind: 'cook',
        recipe: { ...generated, servings: null },
        servings: 2,
      },
    ],
    [],
    [generated.id],
  );
  assert.ok(unknown.items.every((i) => i.quantity === null));
});
