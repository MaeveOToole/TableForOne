import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  defaultPreferences,
  generateWeek,
  recipeSchema,
  validateDraftWeek,
  wasCookedRecently,
} from '@meal/contracts';
import originals from '../../../packages/contracts/src/launch-recipes.json';
const input = {
  week: '2026-11-02',
  preferences: defaultPreferences,
  recipes: originals.map((recipe) => recipeSchema.parse(recipe)),
  context: { pantry: [], ratings: {}, cooked: {} },
  id: randomUUID,
};
test('default plan has three two-portion dinners and three linked next-day leftovers', () => {
  const plan = generateWeek(input);
  const cooks = plan.slots.filter((s) => s.kind === 'cook'),
    leftovers = plan.slots.filter((s) => s.kind === 'leftover');
  assert.equal(cooks.length, 3);
  assert.equal(leftovers.length, 3);
  assert.equal(
    cooks.reduce((sum, s) => sum + s.servings!, 0),
    6,
  );
  assert.equal(new Set(cooks.map((s) => s.recipeId)).size, 3);
  assert.equal(plan.warnings.length, 0);
  assert.ok(
    leftovers.every(
      (s) => s.servings === 1 && cooks.some((c) => c.id === s.preparedSlotId),
    ),
  );
});
test('optional lunches preserve leftovers and regeneration preserves locked source meals', () => {
  const initial = generateWeek(input);
  const leftover = initial.slots.find((s) => s.kind === 'leftover')!;
  leftover.locked = true;
  const result = generateWeek({
    ...input,
    preferences: {
      ...defaultPreferences,
      mealsPerWeek: { ...defaultPreferences.mealsPerWeek, lunches: 4 },
    },
    existing: initial.slots,
    rotation: 1,
  });
  assert.deepEqual(
    result.slots.find((s) => s.id === leftover.id),
    leftover,
  );
  assert.deepEqual(
    result.slots.find((s) => s.id === leftover.preparedSlotId),
    initial.slots.find((s) => s.id === leftover.preparedSlotId),
  );
  assert.equal(result.slots.filter((s) => s.meal === 'lunch').length, 4);
});
test('constraints are applied before ranking and invalid leftover allocations are rejected', () => {
  const result = generateWeek({
    ...input,
    preferences: { ...defaultPreferences, equipment: [] },
  });
  assert.equal(result.slots.length, 0);
  assert.ok(result.warnings.length);
  const initial = generateWeek(input);
  initial.slots.find((s) => s.kind === 'leftover')!.servings = 2;
  assert.throws(
    () => validateDraftWeek(input.week, initial.slots, 1),
    /exceed/,
  );
});

test('four-week planning avoidance filters recent recipes before ranking and permits deliberate repeats', () => {
  const recipes = input.recipes.slice(0, 2);
  const preferences = {
    ...defaultPreferences,
    cookingSessions: 1,
    recentRecipeDays: 28,
  };
  const context = {
    pantry: [{ name: 'spinach', useSoon: true }],
    ratings: { [recipes[0].id]: 5 },
    cooked: { [recipes[0].id]: '2026-10-10T12:00:00Z' },
  };
  const recent = generateWeek({ ...input, recipes, preferences, context });
  assert.equal(
    recent.slots.find((slot) => slot.kind === 'cook')!.recipeId,
    recipes[1].id,
  );
  const intentional = generateWeek({
    ...input,
    recipes,
    preferences,
    context,
    preferredRecipeIds: [recipes[0].id],
  });
  assert.equal(
    intentional.slots.find((slot) => slot.kind === 'cook')!.recipeId,
    recipes[0].id,
  );
  assert.ok(
    intentional.reasons[recipes[0].id].some((reason) =>
      reason.includes('deliberate'),
    ),
  );
  const disabled = generateWeek({
    ...input,
    recipes,
    preferences: { ...preferences, recentRecipeDays: 0 },
    context,
  });
  assert.equal(
    disabled.slots.find((slot) => slot.kind === 'cook')!.recipeId,
    recipes[0].id,
  );
});
test('recent avoidance includes the 28-day boundary and explains constrained fallback', () => {
  assert.equal(
    wasCookedRecently('2026-10-05T12:00:00Z', '2026-11-02', 28),
    true,
  );
  assert.equal(
    wasCookedRecently('2026-10-04T12:00:00Z', '2026-11-02', 28),
    false,
  );
  assert.equal(
    wasCookedRecently('2026-11-03T12:00:00Z', '2026-11-02', 28),
    false,
  );
  const result = generateWeek({
    ...input,
    recipes: input.recipes.slice(0, 1),
    preferences: { ...defaultPreferences, cookingSessions: 1 },
    context: {
      ...input.context,
      cooked: { [input.recipes[0].id]: '2026-10-20T12:00:00Z' },
    },
  });
  assert.equal(result.slots.filter((slot) => slot.kind === 'cook').length, 1);
  assert.ok(result.warnings.some((warning) => warning.includes('28-day')));
});
