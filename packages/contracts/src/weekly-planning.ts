import { z } from 'zod';
import { recordIdSchema } from './ids';
import { discoverRecipes, type DiscoveryContext } from './discovery';
import { ingredientIdentity } from './grocery-calculation';
import type { Preferences, Recipe } from './index';

export const draftSlotSchema = z
  .object({
    id: recordIdSchema,
    day: z.iso.date(),
    meal: z.enum(['breakfast', 'lunch', 'dinner']),
    kind: z.enum(['cook', 'leftover', 'eating_out', 'unplanned']),
    recipeId: recordIdSchema.nullable(),
    preparedSlotId: recordIdSchema.nullable(),
    servings: z.number().positive().max(24).nullable(),
    locked: z.boolean(),
  })
  .strict();
export type DraftSlot = z.infer<typeof draftSlotSchema>;
export const recipeVersionCreateSchema = z
  .object({
    recipeId: recordIdSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict();
export function plusDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function wasCookedRecently(
  cookedAt: string | undefined,
  plannedDay: string,
  days: number,
) {
  if (!cookedAt || days <= 0) return false;
  const cooked = cookedAt.slice(0, 10);
  if (!z.iso.date().safeParse(cooked).success) return false;
  return cooked >= plusDays(plannedDay, -days) && cooked <= plannedDay;
}
export function validateDraftWeek(
  week: string,
  slots: DraftSlot[],
  people: number,
) {
  z.iso.date().parse(week);
  const ids = new Set<string>(),
    occupied = new Set<string>();
  for (const raw of slots) {
    const slot = draftSlotSchema.parse(raw);
    if (ids.has(slot.id) || occupied.has(`${slot.day}:${slot.meal}`))
      throw new Error('Each meal can occupy only one slot.');
    ids.add(slot.id);
    occupied.add(`${slot.day}:${slot.meal}`);
    if (slot.day < week || slot.day > plusDays(week, 6))
      throw new Error('Meals must stay within the selected week.');
    if (
      slot.kind === 'cook'
        ? !slot.recipeId || !slot.servings || slot.preparedSlotId
        : slot.kind === 'leftover'
          ? !slot.preparedSlotId || !slot.servings || slot.recipeId
          : slot.recipeId || slot.preparedSlotId
    )
      throw new Error('Invalid meal references.');
  }
  for (const cook of slots.filter((slot) => slot.kind === 'cook')) {
    const leftovers = slots.filter((slot) => slot.preparedSlotId === cook.id);
    const allocated = leftovers.reduce(
      (sum, slot) => sum + (slot.servings || 0),
      0,
    );
    if (allocated + people > cook.servings!)
      throw new Error(
        'Leftovers exceed prepared portions after the cooking meal.',
      );
  }
  for (const leftover of slots.filter((slot) => slot.kind === 'leftover')) {
    const source = slots.find((slot) => slot.id === leftover.preparedSlotId);
    if (
      !source ||
      source.kind !== 'cook' ||
      source.day > leftover.day ||
      (source.day === leftover.day &&
        ['breakfast', 'lunch', 'dinner'].indexOf(source.meal) >=
          ['breakfast', 'lunch', 'dinner'].indexOf(leftover.meal))
    )
      throw new Error('Leftovers must follow their cooking session.');
  }
}

export function generateWeek(input: {
  week: string;
  preferences: Preferences;
  recipes: Recipe[];
  context: DiscoveryContext;
  existing?: DraftSlot[];
  preferredRecipeIds?: string[];
  id: () => string;
  rotation?: number;
}) {
  const { week, preferences: p, recipes, context, id } = input;
  z.iso.date().parse(week);
  const warnings: string[] = [];
  const existing = input.existing || [];
  const retained = new Set(
    existing
      .filter((slot) => slot.locked || slot.kind === 'eating_out')
      .map((slot) => slot.id),
  );
  // A locked leftover retains its source even if that cooking slot is unlocked.
  for (const slot of existing)
    if (retained.has(slot.id) && slot.preparedSlotId)
      retained.add(slot.preparedSlotId);
  const slots = existing
    .filter((slot) => retained.has(slot.id))
    .map((slot) => ({ ...slot }));
  const isFree = (day: string, meal: DraftSlot['meal']) =>
    !slots.some((slot) => slot.day === day && slot.meal === meal);
  const used = new Set(
    slots.flatMap((slot) => (slot.recipeId ? [slot.recipeId] : [])),
  );
  const usedIngredients = new Set(
    slots.flatMap(
      (slot) =>
        recipes
          .find((r) => r.id === slot.recipeId)
          ?.ingredients.map((i) => ingredientIdentity(i.name, i.notes || '')) ||
        [],
    ),
  );
  const reasons: Record<string, string[]> = {};
  const candidates = (meal: string) =>
    discoverRecipes(recipes, p, context, { meal });
  function choose(meal: string, day: string) {
    const pool = candidates(meal).filter(
      (candidate) =>
        candidate.recipe.servings !== null &&
        candidate.recipe.instructions.length > 0,
    );
    const fresh = pool.filter((candidate) => !used.has(candidate.recipe.id));
    const unused = fresh.length ? fresh : pool;
    const outsideWindow = unused.filter(
      (candidate) =>
        input.preferredRecipeIds?.includes(candidate.recipe.id) ||
        !wasCookedRecently(
          context.cooked[candidate.recipe.id],
          day,
          p.recentRecipeDays,
        ),
    );
    const available = outsideWindow.length ? outsideWindow : unused;
    const ranked = available
      .map((candidate) => {
        const overlap = candidate.recipe.ingredients.filter((i) =>
          usedIngredients.has(ingredientIdentity(i.name, i.notes || '')),
        ).length;
        const repeatsCuisine = slots.some(
          (slot) =>
            recipes.find((r) => r.id === slot.recipeId)?.cuisine ===
            candidate.recipe.cuisine,
        );
        const preferred = input.preferredRecipeIds?.includes(
          candidate.recipe.id,
        )
          ? 5
          : 0;
        return {
          ...candidate,
          score:
            candidate.score +
            overlap * 2 -
            (repeatsCuisine ? 2 : 0) +
            preferred,
          overlap,
        };
      })
      .sort(
        (a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id),
      );
    if (!ranked.length) return null;
    const selected = ranked[Math.abs(input.rotation || 0) % ranked.length];
    const recent = wasCookedRecently(
      context.cooked[selected.recipe.id],
      day,
      p.recentRecipeDays,
    );
    if (recent && !input.preferredRecipeIds?.includes(selected.recipe.id))
      warnings.push(
        `A recently cooked ${meal} was included because no unused alternative outside the ${p.recentRecipeDays}-day window matches your preferences.`,
      );
    used.add(selected.recipe.id);
    selected.recipe.ingredients.forEach((i) =>
      usedIngredients.add(ingredientIdentity(i.name, i.notes || '')),
    );
    reasons[selected.recipe.id] = [
      ...selected.reasons,
      ...(recent
        ? [
            input.preferredRecipeIds?.includes(selected.recipe.id)
              ? 'A deliberate week pick allows this recent repeat'
              : 'Recent repeat: no suitable unused alternative remained',
          ]
        : []),
      ...(selected.overlap
        ? [`Shares ${selected.overlap} ingredients with other meals`]
        : []),
    ];
    return selected.recipe;
  }
  const retainedDinners = slots.filter(
    (slot) => slot.kind === 'cook' && slot.meal === 'dinner',
  ).length;
  const desiredDinners = Math.max(p.cookingSessions, retainedDinners);
  for (let index = retainedDinners; index < desiredDinners; index++) {
    const preferredDay = Math.floor((index * 6) / desiredDinners);
    const days = Array.from(
      { length: 7 },
      (_, offset) => (preferredDay + offset) % 7,
    );
    const dayIndex = days.find((offset) =>
      isFree(plusDays(week, offset), 'dinner'),
    );
    if (dayIndex === undefined) {
      warnings.push(
        'No available dinner slot remains. Locked meals and eating-out slots were kept.',
      );
      break;
    }
    const day = plusDays(week, dayIndex);
    const recipe = choose('dinner', day);
    if (!recipe) {
      warnings.push(
        'Not enough dinners match your dietary, equipment, time and difficulty settings. Review your preferences or add suitable recipes.',
      );
      break;
    }
    const cookId = id();
    const portions = Math.max(p.portions, p.people);
    slots.push({
      id: cookId,
      day,
      meal: 'dinner',
      kind: 'cook',
      recipeId: recipe.id,
      preparedSlotId: null,
      servings: portions,
      locked: false,
    });
  }
  for (const cook of slots.filter(
    (slot) => slot.kind === 'cook' && slot.meal === 'dinner',
  )) {
    const alreadyAllocated = slots
      .filter((slot) => slot.preparedSlotId === cook.id)
      .reduce((sum, slot) => sum + (slot.servings || 0), 0);
    const remaining = cook.servings! - p.people - alreadyAllocated;
    const next = plusDays(cook.day, 1);
    if (p.nextDayLeftovers && remaining > 0 && next <= plusDays(week, 6)) {
      const meal = isFree(next, 'lunch')
        ? 'lunch'
        : isFree(next, 'dinner')
          ? 'dinner'
          : null;
      if (meal)
        slots.push({
          id: id(),
          day: next,
          meal,
          kind: 'leftover',
          recipeId: null,
          preparedSlotId: cook.id,
          servings: remaining,
          locked: false,
        });
      else
        warnings.push(
          `Leftovers from ${cook.day} need an available next-day meal slot.`,
        );
    }
  }
  for (const [meal, target] of [
    ['breakfast', p.mealsPerWeek.breakfasts],
    ['lunch', p.mealsPerWeek.lunches],
  ] as const) {
    // Leftover lunches count toward the requested lunch total.
    let count = slots.filter(
      (slot) => slot.meal === meal && ['cook', 'leftover'].includes(slot.kind),
    ).length;
    for (let offset = 0; offset < 7 && count < target; offset++) {
      const day = plusDays(week, offset);
      if (!isFree(day, meal)) continue;
      const recipe = choose(meal, day);
      if (!recipe) {
        warnings.push(
          `No suitable ${meal} recipe is available. Existing leftovers were kept.`,
        );
        break;
      }
      slots.push({
        id: id(),
        day,
        meal,
        kind: 'cook',
        recipeId: recipe.id,
        preparedSlotId: null,
        servings: p.people,
        locked: false,
      });
      count++;
    }
  }
  validateDraftWeek(week, slots, p.people);
  return {
    slots: slots.sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        ['breakfast', 'lunch', 'dinner'].indexOf(a.meal) -
          ['breakfast', 'lunch', 'dinner'].indexOf(b.meal),
    ),
    warnings,
    reasons,
  };
}
