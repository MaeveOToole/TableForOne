import { createHash } from 'node:crypto';
import {
  recipeSchema,
  withKitchenMeasurements,
  kitchenMeasurementNote,
  type Recipe,
} from '@meal/contracts';
import details from './data/personal-recipe-details.json';

export const personalRecipeDetailsVersion = 'personal_recipe_completion_v1';
const byTitle = new Map(details.map((detail) => [detail.title, detail]));

/** Complete only untouched, private PDF imports. Stored original summaries stay intact. */
export function completePersonalRecipe(recipe: Recipe): Recipe {
  const detail = byTitle.get(recipe.title);
  if (
    !detail ||
    !recipe.owner_id ||
    !recipe.incomplete ||
    recipe.ingredients.length ||
    recipe.instructions.length ||
    recipe.personal_modifications.length ||
    recipe.provenance.source !== 'Your ChatGPT recipe collection'
  )
    return withKitchenMeasurements(recipe);
  const expectedId = createHash('md5')
    .update(`${recipe.owner_id}:personal-pdf:${detail.entry}`)
    .digest('hex');
  if (recipe.id.replaceAll('-', '').toLowerCase() !== expectedId)
    return withKitchenMeasurements(recipe);
  return recipeSchema.parse({
    ...recipe,
    minutes: detail.minutes,
    servings: detail.servings,
    difficulty: 'simple',
    equipment: detail.equipment.filter(
      (appliance) => appliance !== 'No cooking appliance',
    ),
    equipment_known: true,
    ingredients: detail.ingredients.map((raw) => ({
      raw,
      name: raw,
      quantity: null,
      unit: null,
      notes: null,
      confidence: 'generated',
    })),
    instructions: detail.instructions,
    incomplete: false,
    extraction_confidence: 'generated',
    personal_modifications: [
      ...recipe.personal_modifications,
      {
        method: 'generated',
        kind: personalRecipeDetailsVersion,
        entry: detail.entry,
        note: 'AI-drafted details based on the original personal summary. Not kitchen-tested. Total times are estimates and include any stated chilling or freezing. Original summary is retained in description. Ingredient quantities are measured in the text; normalized conversions remain unverified.',
      },
      kitchenMeasurementNote,
    ],
  });
}
