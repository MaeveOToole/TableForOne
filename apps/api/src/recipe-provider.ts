import { completePersonalRecipe } from './personal-recipe-details.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recipeSchema, recipeListSchema, type Recipe } from '@meal/contracts';
import originals from '../../../packages/contracts/src/launch-recipes.json';
export type CatalogQuery = { q: string; offset: number; limit: number };
export interface RecipeProvider {
  list(
    query: CatalogQuery,
  ): Promise<{ items: Recipe[]; nextOffset: number | null }>;
}
export class SupabaseRecipeProvider implements RecipeProvider {
  constructor(private readonly db: SupabaseClient) {}
  async list(query: CatalogQuery) {
    let selection = this.db
      .from('recipes')
      .select('*')
      .neq('provenance->>source', 'Table for One development kitchen')
      .order('id')
      .range(query.offset, query.offset + query.limit);
    if (query.q)
      selection = selection.ilike(
        'title',
        `%${query.q.replace(/[%_\\]/g, '')}%`,
      );
    const { data, error } = await selection;
    if (error) throw new Error('Catalog unavailable');
    return recipeListSchema.parse({
      items: data
        .slice(0, query.limit)
        .map((row) => completePersonalRecipe(recipeSchema.parse(row))),
      nextOffset: data.length > query.limit ? query.offset + query.limit : null,
    });
  }
}
export class OriginalRecipeProvider implements RecipeProvider {
  async list(query: CatalogQuery) {
    const all = originals
      .map((r) => recipeSchema.parse(r))
      .filter((r) => r.title.toLowerCase().includes(query.q.toLowerCase()));
    return {
      items: all.slice(query.offset, query.offset + query.limit),
      nextOffset:
        query.offset + query.limit < all.length
          ? query.offset + query.limit
          : null,
    };
  }
}
