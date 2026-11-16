import test from 'node:test';
import assert from 'node:assert/strict';
import { recipeSchema, calculateGroceries } from '@meal/contracts';
import {
  isWater,
  shoppingName,
  shoppingQuantity,
  weeklyIngredients,
} from '../../mobile/src/lib/shopping-quantities';
import originals from '../../../packages/contracts/src/launch-recipes.json';

test('weekly shopping excludes plain water, scales countable items and avoids guessing package sizes', () => {
  const recipe = recipeSchema.parse({
    ...originals[0],
    servings: 2,
    ingredients: [
      {
        name: 'hot water',
        raw: '1 cup hot water',
        quantity: 1,
        unit: 'cup',
        notes: null,
      },
      { name: 'egg', raw: '3 eggs', quantity: 3, unit: 'each', notes: null },
      {
        name: 'flour',
        raw: '1 cup flour',
        quantity: 1,
        unit: 'cup',
        notes: null,
      },
    ],
  });
  const items = weeklyIngredients([recipe, recipe], 1);
  assert.deepEqual(items, [
    { name: 'egg', quantity: 3, unit: 'each' },
    { name: 'flour', quantity: null, unit: null },
  ]);
  assert.equal(shoppingQuantity(1.5, 'each'), '2 items');
  assert.equal(shoppingQuantity(200, 'g'), 'Choose quantity');
  assert.equal(shoppingQuantity(null, null), 'Choose quantity');
  assert.equal(shoppingQuantity(null, null, '6 eggs'), '6 items');
  assert.equal(isWater('coconut water'), false);
  assert.equal(isWater('filtered water'), true);
  assert.equal(isWater('1 cup water'), true);
  assert.equal(shoppingName('1 tbsp olive oil'), 'olive oil');
  assert.equal(shoppingName('1/3 cup panko breadcrumbs'), 'panko breadcrumbs');
  assert.equal(shoppingName('300 g raw chicken breast'), 'raw chicken breast');
  const imported = recipeSchema.parse({
    ...recipe,
    ingredients: ['2 eggs', '1/3 cup flour', '1 cup water'].map((raw) => ({
      name: raw,
      raw,
      quantity: null,
      unit: null,
      notes: null,
    })),
  });
  assert.deepEqual(weeklyIngredients([imported], 1), [
    { name: 'eggs', quantity: 1, unit: 'each' },
    { name: 'flour', quantity: null, unit: null },
  ]);
  assert.ok(
    calculateGroceries([
      { id: 'test', kind: 'cook', recipe, servings: 2 },
    ]).items.every((item) => !isWater(item.name)),
  );
});
