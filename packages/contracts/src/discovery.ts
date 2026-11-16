import type { Preferences, Recipe } from './index';

export type DiscoveryContext = {
  pantry: { name: string; useSoon: boolean }[];
  ratings: Record<string, number>;
  cooked: Record<string, string>;
};
export type DiscoveryFilters = {
  query?: string;
  meal?: string;
  cuisine?: string;
  maxMinutes?: number;
  difficulty?: string;
  ingredient?: string;
  maxCostCents?: number;
  includeDrafts?: boolean;
  respectPreferences?: boolean;
};
const normalize = (value: string) => value.trim().toLowerCase();
export function discoverRecipes(
  recipes: Recipe[],
  preferences: Preferences,
  context: DiscoveryContext,
  filters: DiscoveryFilters = {},
) {
  return recipes
    .flatMap((recipe) => {
      if (recipe.incomplete && !filters.includeDrafts) return [];
      const names = recipe.ingredients.map((i) => normalize(i.name));
      const tags = recipe.dietary_tags.map(normalize);
      if (
        filters.respectPreferences !== false &&
        !recipe.incomplete &&
        preferences.dietaryRestrictions.some(
          (d) => !tags.includes(normalize(d)),
        )
      )
        return [];
      if (
        filters.respectPreferences !== false &&
        !recipe.incomplete &&
        (!recipe.equipment_known ||
          recipe.equipment.some(
            (e) => !preferences.equipment.map(normalize).includes(normalize(e)),
          ))
      )
        return [];
      if (
        filters.query &&
        !normalize(
          `${recipe.title} ${recipe.description} ${names.join(' ')}`,
        ).includes(normalize(filters.query))
      )
        return [];
      if (filters.meal && recipe.category !== filters.meal) return [];
      if (
        filters.cuisine &&
        normalize(recipe.cuisine) !== normalize(filters.cuisine)
      )
        return [];
      const limit = filters.maxMinutes ?? preferences.maxMinutes;
      if (
        filters.respectPreferences !== false &&
        !recipe.incomplete &&
        (recipe.minutes === null ||
          recipe.minutes > limit ||
          recipe.difficulty === null ||
          !preferences.difficulty.includes(recipe.difficulty))
      )
        return [];
      if (filters.difficulty && recipe.difficulty !== filters.difficulty)
        return [];
      if (
        filters.ingredient &&
        !names.some((n) => n.includes(normalize(filters.ingredient!)))
      )
        return [];
      if (
        filters.maxCostCents !== undefined &&
        (recipe.estimated_additional_cost_cents === null ||
          !recipe.cost_source ||
          recipe.estimated_additional_cost_cents > filters.maxCostCents)
      )
        return [];
      const available = context.pantry.filter((p) =>
        names.some((n) => n === normalize(p.name)),
      );
      const reasons: string[] = [];
      let score = 0;
      if (available.length) {
        score += available.length * 3;
        reasons.push(
          `${available.length} ingredient matches in your kitchen (quantities not deducted)`,
        );
      }
      const soon = available.filter((p) => p.useSoon).length;
      if (soon) {
        score += soon * 4;
        reasons.push('Uses ingredients marked use soon');
      }
      if (
        preferences.cuisines.map(normalize).includes(normalize(recipe.cuisine))
      ) {
        score += 3;
        reasons.push('A preferred cuisine');
      }
      const rating = context.ratings[recipe.id];
      if (rating) {
        score += rating;
        reasons.push(`Your rating: ${rating}/5`);
      }
      if (context.cooked[recipe.id]) {
        score -= 3;
        reasons.push(
          `Previously cooked ${context.cooked[recipe.id].slice(0, 10)}`,
        );
      } else {
        score += 2;
        reasons.push('Not in your cooking history');
      }
      if (
        recipe.estimated_additional_cost_cents !== null &&
        recipe.cost_source
      ) {
        score += 1 / (1 + recipe.estimated_additional_cost_cents / 100);
        reasons.push(`Additional-cost estimate from ${recipe.cost_source}`);
      }
      return [{ recipe, score, reasons }];
    })
    .sort(
      (a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id),
    );
}

export function scaleRecipe(recipe: Recipe, servings: number) {
  if (!Number.isFinite(servings) || servings <= 0 || servings > 24)
    throw new Error('Choose 1 to 24 portions.');
  if (recipe.servings === null)
    return {
      ingredients: recipe.ingredients,
      warning: 'Original servings are unknown. Quantities cannot be scaled.',
    };
  const factor = servings / recipe.servings;
  return {
    ingredients: recipe.ingredients.map((i) => ({
      ...i,
      quantity:
        i.quantity === null
          ? null
          : Math.round(i.quantity * factor * 1000000) / 1000000,
    })),
    warning:
      factor === 1
        ? 'Unknown quantities still need your judgment.'
        : 'Quantities scaled; review whole items, pan size, cooking times and instructions. Notes and original instructions are unchanged.',
  };
}
