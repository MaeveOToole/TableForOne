import { z } from 'zod';
import { recordIdSchema } from './ids';

const revision = z.number().int().nonnegative();
const optionalText = (max: number) => z.string().trim().max(max).nullable();
export const pantryEditSchema = z
  .object({
    revision,
    name: z.string().trim().min(1).max(200),
    quantity: z.number().nonnegative().nullable(),
    unit: optionalText(80),
    useSoon: z.boolean(),
    staple: z.boolean(),
    notes: optionalText(2000),
  })
  .strict();
export const regularPurchaseEditSchema = z
  .object({
    revision,
    name: z.string().trim().min(1).max(200),
    quantity: z.number().positive().nullable(),
    unit: optionalText(80),
    cadenceWeeks: z.number().int().min(1).max(52),
    enabled: z.boolean(),
  })
  .strict();
export const kitchenDeleteSchema = z
  .object({ revision: z.number().int().positive() })
  .strict();
export const regularInclusionSchema = z
  .object({
    revision: z.number().int().positive(),
    purchaseId: recordIdSchema,
    included: z.boolean(),
  })
  .strict();
export const planLockSchema = z
  .object({
    revision: z.number().int().positive(),
    slotId: recordIdSchema,
    slotRevision: z.number().int().positive(),
    locked: z.boolean(),
  })
  .strict();
