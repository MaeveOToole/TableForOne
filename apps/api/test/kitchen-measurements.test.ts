import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recipeSchema,
  withKitchenMeasurements,
  scaleRecipe,
  formatKitchenQuantity,
} from '@meal/contracts';
import originals from '../../../packages/contracts/src/launch-recipes.json';
import demo from '../../mobile/src/data/demo-recipes.json';
import personal from '../src/data/personal-recipe-details.json';

const mass = /\b(?:\d+(?:\.\d+)?\s*(?:g|kg)\b|grams?\b|kilograms?\b)/i;

test('kitchen quantities use familiar fractions when portions change', () => {
  assert.equal(formatKitchenQuantity(3.5), '3 1/2');
  assert.equal(formatKitchenQuantity(0.666667), '2/3');
  assert.equal(formatKitchenQuantity(1.333333), '1 1/3');
  assert.equal(formatKitchenQuantity(0.125), '1/8');
  assert.equal(formatKitchenQuantity(2), '2');
});

test('every starter, demo and personal recipe uses kitchen measures instead of metric weights', () => {
  assert.equal(originals.length, 12);
  assert.equal(personal.length, 48);
  for (const recipe of [...originals, ...demo, ...personal]) {
    for (const ingredient of recipe.ingredients) {
      assert.equal(
        mass.test(
          typeof ingredient === 'string'
            ? ingredient
            : JSON.stringify(ingredient),
        ),
        false,
        recipe.title,
      );
    }
    assert.equal(mass.test(recipe.instructions.join(' ')), false, recipe.title);
  }
});

test('legacy account recipes and cached ingredients adapt consistently without mutation or invented normalized amounts', () => {
  const original = recipeSchema.parse({
    ...originals[0],
    personal_modifications: [],
    ingredients: [
      {
        name: 'spinach',
        raw: '100 g spinach, washed',
        quantity: 100,
        unit: 'g',
        notes: 'washed',
        confidence: 'confirmed',
      },
      {
        name: 'chickpeas',
        raw: '1 400 g can chickpeas, drained and rinsed',
        quantity: 1,
        unit: '400 g can',
        notes: 'drained and rinsed',
      },
      {
        name: '300 g raw chicken breast',
        raw: '300 g raw chicken breast',
        quantity: null,
        unit: null,
        notes: null,
      },
    ],
  });
  const before = structuredClone(original);
  const result = withKitchenMeasurements(original);
  assert.deepEqual(original, before);
  assert.deepEqual(
    result.ingredients.map((i) => [i.quantity, i.unit]),
    [
      [3.5, 'cup'],
      [1, '15-ounce can'],
      [null, null],
    ],
  );
  assert.equal(mass.test(JSON.stringify(result.ingredients)), false);
  assert.equal(result.ingredients[0].confidence, 'generated');
  assert.equal(scaleRecipe(result, 1).ingredients[0].quantity, 1.75);
  assert.equal(withKitchenMeasurements(result), result);
  assert.equal(result.personal_modifications.length, 1);
  assert.match(String(result.personal_modifications[0].note), /approximate/);
});

test('kitchen adaptations preserve unrelated edits and never apply a universal grams-to-cups ratio', () => {
  const original = recipeSchema.parse({
    ...originals[0],
    instructions: ['My own preparation steps'],
    ingredients: [
      {
        name: 'spinach',
        raw: '100 g spinach, washed',
        quantity: 200,
        unit: 'g',
        notes: 'My edited amount',
      },
      {
        name: 'custom ingredient',
        raw: '100 g custom ingredient',
        quantity: 100,
        unit: 'g',
        notes: null,
      },
      {
        name: 'flour',
        raw: '1 cup flour',
        quantity: 1,
        unit: 'cup',
        notes: null,
      },
    ],
  });
  assert.equal(withKitchenMeasurements(original), original);
});
