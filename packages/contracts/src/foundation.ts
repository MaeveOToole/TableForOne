import { recordIdSchema } from './ids';
import { z } from 'zod';

export const operationKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const paginationSchema = z.object({
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const jobStateSchema = z.enum([
  'queued',
  'processing',
  'needs_review',
  'ready',
  'link_only',
  'failed',
]);
export const confidenceSchema = z.enum([
  'unknown',
  'confirmed',
  'inferred',
  'generated',
]);
export const permissionsSchema = z.object({
  personalStorage: z.boolean(),
  redistribution: z.boolean(),
});
export const recordSchema = z.object({
  id: recordIdSchema,
  user_id: recordIdSchema,
  revision: z.number().int().positive(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
const quantity = z.number().nonnegative().nullable();
const positiveQuantity = z.number().positive().nullable();
const text = z.string().nullable();
const jsonObject = z.record(z.string(), z.unknown());
export const resourceSchemas = {
  profiles: recordSchema.extend({ display_name: z.string() }),
  recipe_versions: recordSchema.extend({
    recipe_id: recordIdSchema,
    snapshot: jsonObject,
    attribution: jsonObject,
    extraction_method: z.enum([
      'original',
      'provider',
      'imported',
      'generated',
      'manual',
    ]),
    confidence: confidenceSchema,
    permissions: permissionsSchema,
    modifications: z.array(jsonObject),
  }),
  recipe_ingredients: recordSchema.extend({
    recipe_version_id: recordIdSchema,
    position: z.number().int().nonnegative(),
    raw_text: z.string(),
    normalized_name: text,
    quantity: positiveQuantity,
    unit: text,
    notes: text,
    confidence: confidenceSchema,
  }),
  import_jobs: recordSchema.extend({
    source_url: z.url(),
    state: jobStateSchema,
    extracted_fields: jsonObject,
    warnings: z.array(z.string()),
    recipe_version_id: recordIdSchema.nullable(),
    attempts: z.number().int().nonnegative(),
    error_code: text,
  }),
  plans: recordSchema.extend({
    week_start: z.iso.date(),
    grocery_state: z.enum(['ready', 'needs_review']),
    pending_groceries: z.array(jsonObject).nullable(),
  }),
  plan_slots: recordSchema.extend({
    plan_id: recordIdSchema,
    day: z.iso.date(),
    meal: z.enum(['breakfast', 'lunch', 'dinner']),
    kind: z.enum(['cook', 'leftover', 'eating_out', 'unplanned']),
    recipe_version_id: recordIdSchema.nullable(),
    prepared_slot_id: recordIdSchema.nullable(),
    servings: positiveQuantity,
    locked: z.boolean(),
  }),
  pantry_items: recordSchema.extend({
    name: z.string(),
    raw_text: z.string(),
    quantity,
    unit: text,
    use_soon: z.boolean(),
    staple: z.boolean().default(false),
    notes: text,
  }),
  regular_purchases: recordSchema.extend({
    name: z.string(),
    quantity: positiveQuantity,
    unit: text,
    cadence_weeks: z.number().int().positive(),
    enabled: z.boolean(),
  }),
  grocery_lists: recordSchema.extend({
    plan_id: recordIdSchema,
    state: z.enum(['ready', 'needs_review']),
    recovery_code: text,
  }),
  grocery_items: recordSchema.extend({
    list_id: recordIdSchema,
    name: z.string(),
    raw_text: z.string(),
    quantity: positiveQuantity,
    unit: text,
    section: text,
    notes: text,
    origin: z.enum(['derived', 'manual', 'regular']),
    origin_key: text,
    origins: z.array(jsonObject),
    checked: z.boolean(),
    overridden: z.boolean(),
    deleted: z.boolean(),
  }),
  price_estimates: recordSchema.extend({
    grocery_item_id: recordIdSchema,
    source: z.string(),
    store: text,
    region: text,
    currency: z.string().regex(/^[A-Z]{3}$/),
    observed_at: z.iso.datetime({ offset: true }).nullable(),
    package_quantity: positiveQuantity,
    package_unit: text,
    low_cents: z.number().int().nonnegative().nullable(),
    high_cents: z.number().int().nonnegative().nullable(),
    confidence: z.enum(['unknown', 'low', 'medium', 'high']),
  }),
  cooking_events: recordSchema.extend({
    recipe_version_id: recordIdSchema,
    cooked_at: z.iso.datetime({ offset: true }),
    prepared_servings: z.number().positive(),
    notes: text,
  }),
  ratings: recordSchema.extend({
    recipe_id: recordIdSchema,
    stars: z.number().int().min(1).max(5),
  }),
  recipe_shares: recordSchema.extend({
    recipe_version_id: recordIdSchema,
    recipient_id: recordIdSchema.nullable(),
    expires_at: z.iso.datetime({ offset: true }).nullable(),
    revoked_at: z.iso.datetime({ offset: true }).nullable(),
    can_read: z.boolean(),
    can_save: z.boolean(),
  }),
  chat_threads: recordSchema.extend({ title: z.string() }),
  chat_messages: recordSchema.extend({
    thread_id: recordIdSchema,
    role: z.enum(['user', 'assistant', 'tool']),
    content: z.string(),
    tool_outcome: jsonObject.nullable(),
  }),
  mutations: recordSchema.extend({
    operation_key: operationKeySchema,
    action: z.string(),
    request: jsonObject,
    result: jsonObject,
    before_state: jsonObject.nullable(),
    after_state: jsonObject.nullable(),
    undone_by: recordIdSchema.nullable(),
  }),
};
export const resourceNameSchema = z.enum(
  Object.keys(resourceSchemas) as [
    keyof typeof resourceSchemas,
    ...(keyof typeof resourceSchemas)[],
  ],
);

export const planSlotInputSchema = z
  .object({
    id: recordIdSchema,
    day: z.iso.date(),
    meal: z.enum(['breakfast', 'lunch', 'dinner']),
    kind: z.enum(['cook', 'leftover', 'eating_out', 'unplanned']),
    recipeVersionId: recordIdSchema.nullable(),
    preparedSlotId: recordIdSchema.nullable(),
    servings: positiveQuantity,
    locked: z.boolean(),
  })
  .strict()
  .refine(
    (slot) =>
      slot.kind === 'cook'
        ? !!slot.recipeVersionId && !!slot.servings && !slot.preparedSlotId
        : slot.kind === 'leftover'
          ? !!slot.preparedSlotId && !!slot.servings && !slot.recipeVersionId
          : !slot.recipeVersionId && !slot.preparedSlotId,
    'Invalid slot references',
  );
export const groceryProjectionSchema = z
  .array(
    z
      .object({
        originKey: z.string().min(1).max(200),
        name: z.string().min(1).max(200),
        rawText: z.string().max(2000),
        quantity: positiveQuantity,
        unit: z.string().max(80).nullable(),
        origins: z.array(jsonObject).max(100),
      })
      .strict(),
  )
  .max(500)
  .refine(
    (items) => new Set(items.map((i) => i.originKey)).size === items.length,
    'Duplicate grocery origin keys',
  );
export const planCommitSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    groceryRevision: z.number().int().nonnegative(),
    weekStart: z.iso.date(),
    slots: z.array(planSlotInputSchema).max(42),
    groceries: groceryProjectionSchema,
  })
  .strict()
  .refine(
    (plan) => new Set(plan.slots.map((s) => s.id)).size === plan.slots.length,
    'Duplicate slot IDs',
  );
export const planRepairSchema = z
  .object({
    revision: z.number().int().positive(),
    groceryRevision: z.number().int().positive(),
  })
  .strict();
export const groceryEditSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    listId: recordIdSchema,
    name: z.string().min(1).max(200),
    rawText: z.string().max(2000),
    quantity: positiveQuantity,
    unit: z.string().max(80).nullable(),
    checked: z.boolean(),
    deleted: z.boolean(),
  })
  .strict();
export const groceryDetailsSchema = groceryEditSchema.extend({
  section: z.string().trim().min(1).max(80).nullable(),
  notes: z.string().trim().max(2000).nullable(),
});
export const planDocumentSchema = z.object({
  id: recordIdSchema,
  revision: z.number().int().positive(),
  weekStart: z.iso.date(),
  groceryState: z.enum(['ready', 'needs_review']),
  slots: z.array(resourceSchemas.plan_slots),
  groceries: z.object({
    id: recordIdSchema,
    revision: z.number().int().positive(),
    state: z.enum(['ready', 'needs_review']),
    recoveryCode: text,
    items: z.array(resourceSchemas.grocery_items),
  }),
  recovery: z
    .object({ action: z.literal('repair_groceries'), message: z.string() })
    .nullable(),
});
export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    fields: z
      .array(z.object({ path: z.string(), code: z.string() }))
      .optional(),
  }),
});
