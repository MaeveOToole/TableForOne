import { recordIdSchema } from './ids';
import { z } from 'zod';
export const collectionCreateSchema = z
  .object({ name: z.string().trim().min(1).max(80) })
  .strict();
export const savedOrganizationSchema = z
  .object({
    revision: z.number().int().positive(),
    collectionId: recordIdSchema.nullable(),
    plannedWeek: z.iso.date().nullable(),
  })
  .strict();
export const recipeEditSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    sourceId: recordIdSchema.optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000),
    ingredients: z
      .array(
        z
          .object({
            raw: z.string().min(1).max(2000),
            name: z.string().min(1).max(200),
            quantity: z.number().positive().nullable(),
            unit: z.string().max(80).nullable(),
            notes: z.string().max(2000).nullable(),
            confidence: z
              .enum(['unknown', 'confirmed', 'inferred', 'generated'])
              .default('unknown'),
          })
          .strict(),
      )
      .max(100),
    instructions: z.array(z.string().trim().min(1).max(4000)).max(100),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();
export const discoveryContextSchema = z.object({
  pantry: z.array(z.object({ name: z.string(), useSoon: z.boolean() })),
  ratings: z.record(z.string(), z.number()),
  cooked: z.record(z.string(), z.string()),
  partial: z.boolean().default(false),
});
