import type { Recipe } from './index';

type Unit = { base: string; factor: number };
const units: Record<string, Unit> = {};
function register(names: string[], base: string, factor: number) {
  for (const name of names) units[name] = { base, factor };
}
register(['g', 'gram', 'grams'], 'g', 1);
register(['kg', 'kilogram', 'kilograms'], 'g', 1000);
register(['oz', 'ounce', 'ounces'], 'g', 28.349523125);
register(['lb', 'lbs', 'pound', 'pounds'], 'g', 453.59237);
register(['ml', 'milliliter', 'milliliters'], 'ml', 1);
register(['l', 'liter', 'liters'], 'ml', 1000);
register(['tsp', 'teaspoon', 'teaspoons'], 'ml', 4.92892159375);
register(['tbsp', 'tablespoon', 'tablespoons'], 'ml', 14.78676478125);
register(['cup', 'cups'], 'ml', 236.5882365);
register(['whole', 'each', 'count', 'piece', 'pieces'], 'each', 1);
const clean = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
const round = (value: number) => Math.round(value * 1000000) / 1000000;
const aliases: Record<string, string> = {
  onions: 'onion',
  lemons: 'lemon',
  eggs: 'egg',
  tomatoes: 'tomato',
};
export function ingredientIdentity(name: string, notes = '') {
  const normalized = clean(name);
  const form = [
    'canned',
    'fresh',
    'frozen',
    'dried',
    'cooked',
    'raw',
    'ground',
    'powder',
  ].filter((word) =>
    new RegExp(`\\b${word}\\b`).test(clean(`${name} ${notes}`)),
  );
  return `${aliases[normalized] || normalized}|${form.join(',')}`;
}
export function compatibleQuantity(quantity: number, unit: string | null) {
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error('Quantity must be positive.');
  const normalized = clean(unit || 'unspecified');
  const definition = units[normalized];
  return {
    quantity: quantity * (definition?.factor || 1),
    unit: definition?.base || normalized,
  };
}
export type GroceryRequirement = {
  originKey: string;
  name: string;
  rawText: string;
  quantity: number | null;
  unit: string | null;
  origins: Record<string, unknown>[];
};
export type CookingRequirement = {
  id: string;
  kind: string;
  recipe: Recipe;
  servings: number;
};
export type PantryAvailability = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  notes?: string | null;
};

// No NLP quantity guessing or volume-to-weight conversion. Unreviewed amounts
// retain their original text and separate origins rather than acquiring a total.
export function calculateGroceries(
  sessions: CookingRequirement[],
  pantry: PantryAvailability[] = [],
  reviewedRecipeIds: string[] = [],
) {
  const grouped = new Map<string, GroceryRequirement>();
  const warnings = new Set<string>();
  const questions: { pantryId: string; name: string }[] = [];
  const seen = new Set<string>();
  const requiredIdentities = new Set<string>();
  for (const session of sessions) {
    if (session.kind !== 'cook') continue;
    if (seen.has(session.id)) throw new Error('Duplicate cooking session.');
    seen.add(session.id);
    if (
      !Number.isFinite(session.servings) ||
      session.servings <= 0 ||
      session.servings > 24
    )
      throw new Error('Choose 1 to 24 prepared portions.');
    const recipe = session.recipe;
    for (const [index, ingredient] of recipe.ingredients.entries()) {
      if (
        /^(?:(?:cold|hot|warm|boiling|tap|filtered|drinking|ice)\s+)*water$/i.test(
          ingredient.name.trim(),
        )
      )
        continue;
      const reviewed =
        ingredient.confidence === 'confirmed' ||
        reviewedRecipeIds.includes(recipe.id);
      const canCalculate =
        reviewed &&
        ingredient.quantity !== null &&
        !!ingredient.unit?.trim() &&
        recipe.servings !== null;
      const normalized = canCalculate
        ? compatibleQuantity(
            (ingredient.quantity! * session.servings) / recipe.servings!,
            ingredient.unit,
          )
        : null;
      const identity = ingredientIdentity(
        ingredient.name,
        ingredient.notes || '',
      );
      requiredIdentities.add(identity);
      const originKey = normalized
        ? `${identity}|${normalized.unit}`
        : `uncertain:${session.id}:${index}`;
      if (!normalized)
        warnings.add(
          `${recipe.title}: review the amount for ${ingredient.name}. Original text is kept; the total is unknown.`,
        );
      const origin = {
        slotId: session.id,
        recipeId: recipe.id,
        title: recipe.title,
        ingredientIndex: index,
        raw: ingredient.raw,
        preparedServings: session.servings,
        quantityReviewed: reviewed,
      };
      const prior = grouped.get(originKey);
      if (prior && normalized) {
        prior.quantity = (prior.quantity || 0) + normalized.quantity;
        prior.origins.push(origin);
      } else
        grouped.set(originKey, {
          originKey,
          name: ingredient.name,
          rawText: ingredient.raw,
          quantity: normalized?.quantity ?? null,
          unit: normalized?.unit ?? ingredient.unit,
          origins: [origin],
        });
    }
  }
  const pantryGroups = new Map<string, number>();
  for (const available of pantry) {
    const identity = ingredientIdentity(available.name, available.notes || '');
    const matches = requiredIdentities.has(identity);
    if (available.quantity === null) {
      if (matches)
        questions.push({ pantryId: available.id, name: available.name });
      continue;
    }
    if (available.quantity === 0) continue;
    if (!available.unit?.trim()) {
      if (matches)
        questions.push({ pantryId: available.id, name: available.name });
      continue;
    }
    const converted = compatibleQuantity(available.quantity, available.unit);
    const key = `${identity}|${converted.unit}`;
    pantryGroups.set(key, (pantryGroups.get(key) || 0) + converted.quantity);
  }
  const items: GroceryRequirement[] = [];
  for (const [key, item] of grouped) {
    if (item.quantity !== null) {
      item.quantity = round(
        Math.max(0, item.quantity - (pantryGroups.get(key) || 0)),
      );
      if (item.quantity === 0) continue;
      item.rawText = `${item.quantity} ${item.unit} ${item.name}`;
    }
    items.push(item);
  }
  return { items, warnings: [...warnings], questions };
}
