import { z } from 'zod';
import {
  calculateGroceries,
  recipeSchema,
  resourceSchemas,
  planDocumentSchema,
  validateDraftWeek,
  type DraftSlot,
  type Recipe,
  type Preferences,
  type PantryAvailability,
} from '@meal/contracts';
import {
  readGroceryWeek,
  type GroceryApi,
  type GroceryPlan,
} from './weekly-groceries';

export async function resources<T>(
  api: GroceryApi,
  name: string,
  schema: z.ZodType<T>,
) {
  return readPages(api, `/resources/${name}`, schema);
}
async function readPages<T>(
  api: GroceryApi,
  path: string,
  schema: z.ZodType<T>,
) {
  const items: T[] = [],
    seen = new Set<number>();
  let offset: number | null = 0;
  while (offset !== null) {
    if (seen.has(offset))
      throw new Error('Repeated resource page. Refresh before planning.');
    seen.add(offset);
    const result = z
      .object({
        items: z.array(schema),
        nextOffset: z.number().int().nonnegative().nullable(),
      })
      .parse(await api(`${path}?limit=50&offset=${offset}`));
    items.push(...result.items);
    offset = result.nextOffset;
  }
  return items;
}
export async function loadPlanningWeek(
  api: GroceryApi,
  week: string,
  reviewGroceries = false,
) {
  const plan = await readGroceryWeek(api, week);
  const [versions, pantry, storedGroceries] = await Promise.all([
    plan?.slots.some((s) => s.recipe_version_id)
      ? resources(api, 'recipe_versions', resourceSchemas.recipe_versions)
      : Promise.resolve([]),
    resources(api, 'pantry_items', resourceSchemas.pantry_items),
    reviewGroceries && plan
      ? readPages(
          api,
          `/grocery-lists/${plan.groceries.id}/items`,
          resourceSchemas.grocery_items,
        )
      : Promise.resolve(plan?.groceries.items || []),
  ]);
  const snapshots = new Map(
    versions.map((version) => [
      version.id,
      recipeSchema.parse(version.snapshot),
    ]),
  );
  const slots: DraftSlot[] = (plan?.slots || []).map((slot) => {
    const recipe = slot.recipe_version_id
      ? snapshots.get(slot.recipe_version_id)
      : null;
    if (slot.kind === 'cook' && !recipe)
      throw new Error(
        'A planned recipe snapshot is unavailable. Refresh before editing this week.',
      );
    return {
      id: slot.id,
      day: slot.day,
      meal: slot.meal,
      kind: slot.kind,
      recipeId: recipe?.id || null,
      preparedSlotId: slot.prepared_slot_id,
      servings: slot.servings,
      locked: slot.locked,
    };
  });
  return { plan, slots, snapshots, pantry, storedGroceries };
}
export type LoadedPlanningWeek = Awaited<ReturnType<typeof loadPlanningWeek>>;
export function recipeForSlot(
  slot: DraftSlot,
  loaded: LoadedPlanningWeek,
  recipes: Recipe[],
) {
  const original = loaded.plan?.slots.find((prior) => prior.id === slot.id);
  const snapshot = original?.recipe_version_id
    ? loaded.snapshots.get(original.recipe_version_id)
    : null;
  return snapshot?.id === slot.recipeId
    ? snapshot
    : recipes.find((recipe) => recipe.id === slot.recipeId);
}
export function groceryPreview(
  slots: DraftSlot[],
  loaded: LoadedPlanningWeek,
  recipes: Recipe[],
  reviewed: boolean,
) {
  const sessions = slots
    .filter((slot) => slot.kind === 'cook')
    .map((slot) => {
      const recipe = recipeForSlot(slot, loaded, recipes);
      if (!recipe)
        throw new Error('Choose an available recipe for each cooking session.');
      return { id: slot.id, kind: slot.kind, recipe, servings: slot.servings! };
    });
  return calculateGroceries(
    sessions,
    loaded.pantry as PantryAvailability[],
    reviewed ? sessions.map((s) => s.recipe.id) : [],
  );
}
export async function savePlanningWeek(input: {
  api: GroceryApi;
  week: string;
  planId: string;
  operationId: string;
  preferences: Preferences;
  loaded: LoadedPlanningWeek;
  slots: DraftSlot[];
  recipes: Recipe[];
  reviewed: boolean;
}) {
  const { api, loaded, slots, recipes, operationId } = input;
  validateDraftWeek(input.week, slots, input.preferences.people);
  const currentPantry = await resources(
    api,
    'pantry_items',
    resourceSchemas.pantry_items,
  );
  const pantryRevision = (items: LoadedPlanningWeek['pantry']) =>
    JSON.stringify(items.map((item) => `${item.id}:${item.revision}`).sort());
  if (pantryRevision(currentPantry) !== pantryRevision(loaded.pantry))
    throw new Error(
      'Your kitchen changed since this preview. Refresh and review the plan before saving.',
    );
  const versions = new Map<string, { id: string; recipe: Recipe }>();
  const prepared = [];
  for (const slot of slots) {
    let versionId: string | null = null;
    if (slot.kind === 'cook') {
      const recipe = recipeForSlot(slot, loaded, recipes);
      if (!recipe)
        throw new Error(
          'A recipe is no longer available. Refresh before saving.',
        );
      const original = loaded.plan?.slots.find((prior) => prior.id === slot.id);
      const snapshot = original?.recipe_version_id
        ? loaded.snapshots.get(original.recipe_version_id)
        : null;
      if (snapshot?.id === slot.recipeId)
        versionId = original!.recipe_version_id;
      else {
        let version = versions.get(recipe.id);
        if (!version) {
          const saved = resourceSchemas.recipe_versions.parse(
            await api(
              '/recipe-versions',
              'POST',
              { recipeId: recipe.id, expectedRevision: recipe.revision },
              `${operationId}:${recipe.id}`,
            ),
          );
          const canonical = recipeSchema.parse(saved.snapshot);
          // Revisions cover source edits; compare details too because private import
          // completions are versioned application data applied on read.
          if (
            JSON.stringify(canonical.ingredients) !==
              JSON.stringify(recipe.ingredients) ||
            canonical.servings !== recipe.servings
          )
            throw new Error(
              'Recipe amounts changed since this preview. Refresh and review before saving.',
            );
          version = { id: saved.id, recipe: canonical };
          versions.set(recipe.id, version);
        }
        versionId = version.id;
      }
    }
    prepared.push({
      id: slot.id,
      day: slot.day,
      meal: slot.meal,
      kind: slot.kind,
      recipeVersionId: versionId,
      preparedSlotId: slot.preparedSlotId,
      servings: slot.servings,
      locked: slot.locked,
    });
  }
  const groceries = groceryPreview(
    slots,
    loaded,
    recipes,
    input.reviewed,
  ).items;
  return planDocumentSchema.parse(
    await api(
      `/plans/${loaded.plan?.id || input.planId}`,
      'PUT',
      {
        revision: loaded.plan?.revision || 0,
        groceryRevision: loaded.plan?.groceries.revision || 0,
        weekStart: input.week,
        slots: prepared,
        groceries,
      },
      `${operationId}:commit`,
    ),
  );
}
export async function repairPlanningGroceries(
  api: GroceryApi,
  plan: GroceryPlan,
  operationId: string,
) {
  return planDocumentSchema.parse(
    await api(
      `/plans/${plan.id}/repair-groceries`,
      'POST',
      {
        revision: plan.revision,
        groceryRevision: plan.groceries.revision,
      },
      operationId,
    ),
  );
}
