import { ingredientIdentity, type Recipe } from '@meal/contracts';

const amountPrefix = /^(\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s+/;
const measurePrefix =
  /^(?:g|kg|mg|oz|ml|l|lb|lbs|grams?|kilograms?|ounces?|pounds?|milliliters?|liters?|cups?|tablespoons?|teaspoons?|tbsp|tsp)\.?\s+(?:of\s+)?/i;
const packagePrefix =
  /^(cans?|jars?|bags?|bottles?|packages?|packs?|bunches?|heads?)\s+(?:of\s+)?/i;
function quantityValue(value: string) {
  const fractions: Record<string, number> = {
    '¼': 0.25,
    '½': 0.5,
    '¾': 0.75,
    '⅓': 1 / 3,
    '⅔': 2 / 3,
    '⅛': 0.125,
    '⅜': 0.375,
    '⅝': 0.625,
    '⅞': 0.875,
  };
  if (value in fractions) return fractions[value];
  return value.split(/\s+/).reduce((sum, part) => {
    const [numerator, denominator] = part.split('/').map(Number);
    return sum + (denominator ? numerator / denominator : numerator);
  }, 0);
}
function purchaseName(raw: string) {
  const amount = raw.trim().match(amountPrefix);
  let name = raw
    .trim()
    .replace(amountPrefix, '')
    .replace(/^\([\d.]+\s*(?:oz|g|ml)\)\s*/i, '');
  const measured = measurePrefix.test(name);
  const pack = name.match(packagePrefix);
  name = name
    .replace(measurePrefix, '')
    .replace(packagePrefix, '')
    .split(',')[0]
    .trim();
  return {
    name: name || raw.trim(),
    quantity: amount && !measured ? quantityValue(amount[1]) : null,
    unit: pack?.[1].toLowerCase() || 'each',
  };
}
export const shoppingName = (raw: string) => purchaseName(raw).name;
export const shoppingCount = (raw: string) => purchaseName(raw).quantity;

export const isWater = (name: string) =>
  /^(?:(?:cold|hot|warm|boiling|tap|filtered|drinking|ice|bottled|spring)\s+)*water(?:\s+(?:as needed|for boiling))?$/i.test(
    shoppingName(name),
  );

const countUnits =
  /^(each|whole|count|pieces?|cloves?|cans?|jars?|bags?|bottles?|packages?|packs?|bunches?|heads?)$/i;

// Recipe measures stay in recipe data. Shopping quantities only use countable
// units; package sizes cannot be inferred safely from cups, grams or spoons.
export function shoppingQuantity(
  quantity: number | null,
  unit: string | null,
  raw = '',
) {
  if (quantity === null && !unit && raw) {
    const purchase = purchaseName(raw);
    quantity = purchase.quantity;
    unit = purchase.unit;
  }
  if (quantity !== null && unit && countUnits.test(unit))
    return `${Math.ceil(quantity)} ${/^(each|whole|count|pieces?)$/i.test(unit) ? (Math.ceil(quantity) === 1 ? 'item' : 'items') : unit}`;
  return 'Choose quantity';
}

export function weeklyIngredients(recipes: Recipe[], people: number) {
  const items = new Map<
    string,
    { name: string; quantity: number | null; unit: string | null }
  >();
  for (const recipe of recipes)
    for (const ingredient of recipe.ingredients) {
      if (isWater(ingredient.name)) continue;
      const purchase = purchaseName(ingredient.name);
      const name = purchase.name;
      const amount = ingredient.quantity ?? purchase.quantity;
      const originalUnit =
        ingredient.unit ?? (purchase.quantity !== null ? purchase.unit : null);
      const countable =
        amount !== null && !!originalUnit && countUnits.test(originalUnit);
      const unit = countable
        ? /^(each|whole|count|pieces?)$/i.test(originalUnit!)
          ? 'each'
          : originalUnit!.toLowerCase()
        : null;
      const key = ingredientIdentity(name, ingredient.notes || '');
      const quantity = countable
        ? (amount! * people) / (recipe.servings || people)
        : null;
      const prior = items.get(key);
      if (!prior) items.set(key, { name, quantity, unit });
      else if (
        prior.quantity !== null &&
        quantity !== null &&
        prior.unit === unit
      )
        prior.quantity += quantity;
      else {
        prior.quantity = null;
        prior.unit = null;
      }
    }
  return [...items.values()];
}
