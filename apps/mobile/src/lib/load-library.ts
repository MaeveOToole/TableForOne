import { recordIdSchema } from '@meal/contracts';
import { z } from 'zod';
import {
  recipeListSchema,
  savedListSchema,
  preferencesSchema,
  discoveryContextSchema,
  withKitchenMeasurements,
  type Recipe,
} from '@meal/contracts';
type Read = (path: string) => Promise<unknown>;
async function pages(read: Read, path: string) {
  const all: Recipe[] = [],
    seen = new Set<number>();
  let offset: number | null = 0;
  while (offset !== null) {
    if (seen.has(offset))
      throw new Error('The service returned a repeated page. Please retry.');
    seen.add(offset);
    const page = recipeListSchema.parse(
      await read(`${path}?limit=50&offset=${offset}`),
    );
    all.push(...page.items.map(withKitchenMeasurements));
    offset = page.nextOffset;
  }
  return all;
}
export async function loadLibrary(
  read: Read,
  privateAccess: boolean,
  demo = false,
) {
  const results = await Promise.allSettled([
    pages(read, '/recipes'),
    privateAccess || demo
      ? read('/preferences').then((value) =>
          z
            .object({
              preferences: preferencesSchema,
              revision: z.number().int().positive(),
            })
            .parse(value),
        )
      : Promise.resolve(undefined),
    privateAccess || demo
      ? read('/saved').then((value) => savedListSchema.parse(value).items)
      : Promise.resolve(undefined),
    privateAccess
      ? pages(read, '/saved-recipes')
      : Promise.resolve([] as Recipe[]),
    privateAccess
      ? read('/discovery-context').then((value) =>
          discoveryContextSchema.parse(value),
        )
      : Promise.resolve(undefined),
    privateAccess
      ? read('/collections').then(
          (value) =>
            z
              .object({
                items: z.array(
                  z.object({
                    id: recordIdSchema,
                    name: z.string(),
                    revision: z.number().int().positive().optional(),
                  }),
                ),
              })
              .parse(value).items,
        )
      : Promise.resolve(undefined),
  ] as const);
  const [catalog, profile, saves, savedRecipes, context, collections] = results;
  const recipes = new Map<string, Recipe>();
  if (catalog.status === 'fulfilled')
    for (const r of catalog.value) recipes.set(r.id, r);
  if (savedRecipes.status === 'fulfilled')
    for (const r of savedRecipes.value) recipes.set(r.id, r);
  const labels = [
    'Discover',
    'Profile',
    'Saved list',
    'Saved recipe details',
    'Recommendations',
    'Collections',
  ];
  const errors = results.flatMap((r, index) =>
    r.status === 'rejected'
      ? [
          `${labels[index]}: ${r.reason instanceof z.ZodError ? 'The service returned unexpected data. Please refresh.' : r.reason instanceof Error ? r.reason.message : 'Unable to load. Please retry.'}`,
        ]
      : [],
  );
  return {
    recipes: [...recipes.values()],
    profile: profile.status === 'fulfilled' ? profile.value : undefined,
    saves: saves.status === 'fulfilled' ? saves.value : undefined,
    context: context.status === 'fulfilled' ? context.value : undefined,
    collections:
      collections.status === 'fulfilled' ? collections.value : undefined,
    errors,
  };
}
