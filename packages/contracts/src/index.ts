export { recordIdSchema } from './ids';
import { recordIdSchema } from './ids';
import { z } from 'zod';
export * from './foundation';
export * from './recovery';
export * from './discovery';
export * from './library';
export * from './grocery-calculation';
export * from './weekly-planning';
export * from './kitchen';
export * from './checkout';
export * from './regional-prices';
export * from './grocery-review';
export * from './kitchen-measurements';

export const ingredientSchema = z.object({
  confidence: z
    .enum(['unknown', 'confirmed', 'inferred', 'generated'])
    .default('unknown'),
  raw: z.string(),
  name: z.string(),
  quantity: z.number().positive().nullable(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
});
export const recipeSchema = z.object({
  id: recordIdSchema,
  revision: z.number().int().positive().default(1),
  owner_id: recordIdSchema.nullable().default(null),
  title: z.string(),
  description: z.string(),
  cuisine: z.string(),
  minutes: z.number().int().positive().nullable(),
  servings: z.number().int().positive().nullable(),
  difficulty: z.enum(['simple', 'moderate']).nullable(),
  category: z
    .enum(['breakfast', 'lunch', 'dinner', 'side'])
    .nullable()
    .default(null),
  incomplete: z.boolean().default(false),
  equipment: z.array(z.string()).default([]),
  equipment_known: z.boolean().default(false),
  dietary_tags: z.array(z.string()).default([]),
  creator: z.string().nullable().default(null),
  image_url: z.url().nullable().default(null),
  image_permission: z.enum(['none', 'licensed', 'generated']).default('none'),
  nutrition: z
    .object({
      summary: z.string(),
      source: z.string(),
      method: z.enum(['confirmed', 'estimated', 'generated']),
    })
    .nullable()
    .default(null),
  estimated_additional_cost_cents: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(null),
  cost_source: z.string().nullable().default(null),
  extraction_confidence: z
    .enum(['unknown', 'confirmed', 'inferred', 'generated'])
    .default('unknown'),
  content_permissions: z
    .object({ personalStorage: z.boolean(), redistribution: z.boolean() })
    .default({ personalStorage: true, redistribution: false }),
  personal_modifications: z
    .array(z.record(z.string(), z.unknown()))
    .default([]),
  source_recipe_id: recordIdSchema.nullable().default(null),
  ingredients: z.array(ingredientSchema),
  instructions: z.array(z.string()),
  provenance: z.object({
    source: z.string(),
    url: z.url().nullable(),
    permission: z.string(),
    method: z.enum(['original', 'provider', 'imported', 'generated']),
  }),
});
export type Recipe = z.infer<typeof recipeSchema>;
export const preferencesSchema = z.object({
  onboardingCompleted: z.boolean().default(false),
  equipment: z
    .array(z.string().trim().min(1).max(80))
    .max(30)
    .default(['Stovetop', 'Oven', 'Air fryer', 'Ninja blender']),
  nutritionPreference: z
    .enum(['Whole-food and balanced', 'No preference'])
    .default('Whole-food and balanced'),
  regularGroceries: z
    .array(z.string().trim().min(1).max(80))
    .max(100)
    .default([
      'Fruit',
      'Yogurt',
      'Bagels',
      'Eggs',
      'Cheese',
      'Sausage',
      'Avocados',
    ]),
  preferredStores: z
    .array(z.string().trim().min(1).max(80))
    .max(30)
    .default(['Whole Foods', 'Wegmans', "Shaw's", "Trader Joe's"]),
  units: z.enum(['US customary', 'Metric']).default('US customary'),
  weekStartDay: z.enum(['Monday', 'Sunday']).default('Monday'),
  difficulty: z
    .array(z.enum(['simple', 'moderate']))
    .min(1)
    .max(2)
    .default(['simple', 'moderate']),
  nextDayLeftovers: z.boolean().default(true),
  allowFreezing: z.boolean().default(false),
  displayName: z.string().trim().max(80).default(''),
  dietaryRestrictions: z
    .array(z.string().trim().min(1).max(80))
    .max(30)
    .default([]),
  mealsPerWeek: z
    .object({
      breakfasts: z.number().int().min(0).max(7).default(0),
      lunches: z.number().int().min(0).max(7).default(0),
      dinners: z.number().int().min(0).max(7).default(3),
    })
    .default({ breakfasts: 0, lunches: 0, dinners: 3 }),
  people: z.number().int().min(1).max(12).default(1),
  cookingSessions: z.number().int().min(1).max(7).default(3),
  recentRecipeDays: z.number().int().min(0).max(365).default(28),
  portions: z.number().int().min(1).max(12).default(2),
  maxMinutes: z.number().int().min(5).max(240).default(60),
  weeklyBudgetCents: z.number().int().min(0).max(1000000).default(15000),
  currency: z.literal('USD').default('USD'),
  timeZone: z
    .string()
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid time zone')
    .default('America/New_York'),
  cuisines: z
    .array(z.string().max(80))
    .max(30)
    .default(['Mexican', 'Italian', 'Mediterranean']),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences = preferencesSchema.parse({});
export const preferencesUpdateSchema = z.object({
  revision: z.number().int().positive(),
  preferences: preferencesSchema,
});
export const recipeListSchema = z.object({
  items: z.array(recipeSchema),
  nextOffset: z.number().int().nullable(),
});
export const savedListSchema = z.object({
  items: z.array(
    z.object({
      recipe_id: recordIdSchema,
      created_at: z.string(),
      revision: z.number().int().positive().default(1),
      collection_id: recordIdSchema.nullable().default(null),
      planned_week: z.iso.date().nullable().default(null),
    }),
  ),
});
