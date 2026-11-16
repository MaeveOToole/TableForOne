import { z } from 'zod';
import {
  recipeSchema,
  recipeListSchema,
  preferencesSchema,
  preferencesUpdateSchema,
  savedListSchema,
  collectionCreateSchema,
  savedOrganizationSchema,
  recipeEditSchema,
  discoveryContextSchema,
  errorSchema,
  operationKeySchema,
  planCommitSchema,
  planRepairSchema,
  planDocumentSchema,
  groceryEditSchema,
  groceryDetailsSchema,
  resourceSchemas,
  jobStateSchema,
  recipeVersionCreateSchema,
  pantryEditSchema,
  regularPurchaseEditSchema,
  kitchenDeleteSchema,
  regularInclusionSchema,
  planLockSchema,
  checkoutEditSchema,
  checkoutDocumentSchema,
  checkoutViewSchema,
} from '@meal/contracts';

const jsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { unrepresentable: 'any' });
const reference = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ 'application/json': { schema } });
const id = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const key = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  schema: jsonSchema(operationKeySchema),
  description:
    'One key per logical operation. Retry the identical request with the same key; reuse with different content returns 409.',
};
const pagination = [
  {
    name: 'offset',
    in: 'query',
    schema: { type: 'integer', minimum: 0, maximum: 10000, default: 0 },
  },
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  },
];
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 429, 500, 503].map((status) => [
    status,
    {
      description:
        status === 409
          ? 'Revision, uniqueness or idempotency conflict; inspect error.code.'
          : 'Structured error; values and upstream details are omitted.',
      headers: { 'x-request-id': { schema: { type: 'string' } } },
      content: json(reference('Error')),
    },
  ]),
);
function operation(
  summary: string,
  response: unknown,
  options: {
    parameters?: unknown[];
    body?: string;
    public?: boolean;
    noContent?: boolean;
  } = {},
) {
  return {
    summary,
    security: options.public ? [] : [{ bearerAuth: [] }],
    parameters: options.parameters ?? [],
    ...(options.body
      ? {
          requestBody: {
            required: true,
            content: json(reference(options.body)),
          },
        }
      : {}),
    responses: {
      ...errors,
      [options.noContent ? '204' : '200']: {
        description: 'Success',
        headers: { 'x-request-id': { schema: { type: 'string' } } },
        ...(options.noContent ? {} : { content: json(response) }),
      },
    },
  };
}

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Table for One API',
    version: '0.1.0',
    description:
      'Implemented application endpoints. Import workers, AI chat, sharing links and Undo execution remain separate. PostgreSQL RLS uses the caller token. Revisioned resource writes require an Idempotency-Key; account deletion uses verified identity and explicit confirmation. A saved plan may have groceryState=needs_review; never shop from its prior grocery projection.',
  },
  paths: {
    '/v1/account/deletion-status': {
      get: operation(
        'Whether server credentials and atomic account cleanup are configured',
        jsonSchema(z.object({ available: z.boolean() })),
      ),
    },
    '/v1/account': {
      delete: operation(
        'Permanently delete only the authenticated account; never accepts a target user ID. Retries after confirmed deletion require signing out because the account no longer authenticates.',
        jsonSchema(z.object({ deleted: z.literal(true) })),
        { body: 'AccountDeletion' },
      ),
    },
    '/v1/grocery-lists/{id}/items': {
      get: operation(
        'Own grocery rows including deliberate deletions for a truthful recalculation review',
        {
          type: 'object',
          properties: {
            items: { type: 'array', items: reference('grocery_items') },
            nextOffset: { type: ['integer', 'null'] },
          },
          required: ['items', 'nextOffset'],
        },
        { parameters: [id, ...pagination] },
      ),
    },
    '/v1/grocery-details-status': {
      get: operation('Whether grocery section/note editing is activated', {
        type: 'object',
        properties: { available: { type: 'boolean' } },
        required: ['available'],
      }),
    },
    '/v1/grocery-items/{id}/details': {
      put: operation(
        'Atomically edit grocery fields, section and notes with revision/idempotency protection',
        reference('GroceryEditResult'),
        { parameters: [id, key], body: 'GroceryDetails' },
      ),
    },
    '/v1/checkout/{week}': {
      get: operation(
        'Regional checkout estimate, completeness gaps and separately saved weekly actual spending',
        reference('CheckoutView'),
        {
          parameters: [
            {
              name: 'week',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
          ],
        },
      ),
      put: operation(
        'Save revisioned actual weekly spending and optional estimated tax/fees without altering the budget or grocery items',
        reference('CheckoutDocument'),
        {
          parameters: [
            {
              name: 'week',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
            key,
          ],
          body: 'CheckoutEdit',
        },
      ),
    },
    '/v1/kitchen-status': {
      get: operation('Whether the kitchen database upgrade is active', {
        type: 'object',
        properties: { available: { type: 'boolean' } },
        required: ['available'],
      }),
    },
    '/v1/pantry-items/{id}': {
      put: operation(
        'Create or update an owner-scoped pantry item',
        reference('pantry_items'),
        { parameters: [id, key], body: 'PantryEdit' },
      ),
      delete: operation(
        'Delete an owner-scoped pantry item with revision checking',
        { type: 'object' },
        { parameters: [id, key], body: 'KitchenDelete' },
      ),
    },
    '/v1/regular-purchases/{id}': {
      put: operation(
        'Create or update a reusable regular purchase',
        reference('regular_purchases'),
        { parameters: [id, key], body: 'RegularPurchaseEdit' },
      ),
      delete: operation(
        'Remove a reusable template without deleting existing weekly purchases',
        { type: 'object' },
        { parameters: [id, key], body: 'KitchenDelete' },
      ),
    },
    '/v1/grocery-lists/{id}/regular-purchases': {
      put: operation(
        'Include or exclude a regular purchase once for a weekly grocery list',
        reference('PlanDocument'),
        { parameters: [id, key], body: 'RegularInclusion' },
      ),
    },
    '/v1/plans/{id}/lock': {
      put: operation(
        'Lock or unlock a saved meal while incrementing its plan revision',
        reference('PlanDocument'),
        { parameters: [id, key], body: 'PlanLock' },
      ),
    },
    '/v1/recipe-versions': {
      post: operation(
        'Create an immutable, owner-scoped snapshot from an accessible recipe; retries return the same version',
        reference('recipe_versions'),
        { parameters: [key], body: 'RecipeVersionCreate' },
      ),
    },
    '/v1/saved-recipes': {
      get: operation(
        'Paginated full saved recipes, including private drafts and previously saved development recipes',
        reference('RecipeList'),
        { parameters: pagination },
      ),
    },
    '/v1/collections': {
      get: operation('Own private recipe collections', {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                revision: { type: 'integer' },
              },
            },
          },
        },
      }),
    },
    '/v1/collections/{id}': {
      put: operation(
        'Create a private collection',
        { type: 'object' },
        { parameters: [id, key], body: 'CollectionCreate' },
      ),
    },
    '/v1/saved/{id}/organization': {
      put: operation(
        'Set collection and target week without altering source attribution',
        { type: 'object' },
        { parameters: [id, key], body: 'SavedOrganization' },
      ),
    },
    '/v1/personal-recipes/{id}': {
      put: operation(
        'Create or edit a private copy; original attribution is preserved',
        reference('Recipe'),
        { parameters: [id, key], body: 'RecipeEdit' },
      ),
    },
    '/v1/recipes/{id}/rating': {
      get: operation(
        'Read your recipe rating',
        { type: 'object' },
        { parameters: [id] },
      ),
      put: operation(
        'Save a one-to-five-star rating with revision checking',
        { type: 'object' },
        { parameters: [id, key], body: 'RecipeRating' },
      ),
    },
    '/v1/discovery-context': {
      get: operation(
        'Own pantry, ratings and history for deterministic recommendation ranking',
        reference('DiscoveryContext'),
      ),
    },
    '/v1/weekly-budgets/{week}': {
      get: operation(
        'Weekly ceiling or preference default',
        { type: 'object' },
        {
          parameters: [
            {
              name: 'week',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
          ],
        },
      ),
      put: operation(
        'Revision-checked weekly grocery ceiling override',
        { type: 'object' },
        {
          parameters: [
            {
              name: 'week',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'date' },
            },
            key,
          ],
          body: 'WeeklyBudgetUpdate',
        },
      ),
    },
    '/health': {
      get: operation(
        'Process health and feature configuration',
        {
          type: 'object',
          required: ['status', 'environment', 'features'],
          properties: {
            status: { const: 'ok' },
            environment: { type: 'string' },
            features: {
              type: 'object',
              additionalProperties: { type: 'boolean' },
            },
          },
        },
        { public: true },
      ),
    },
    '/ready': {
      get: {
        summary: 'Database readiness',
        security: [],
        responses: {
          200: {
            description: 'Ready',
            content: json({
              type: 'object',
              properties: { status: { const: 'ready' } },
            }),
          },
          503: {
            description: 'Unavailable',
            content: json({
              type: 'object',
              properties: { status: { const: 'unavailable' } },
            }),
          },
        },
      },
    },
    '/v1/recipes': {
      get: operation(
        'Visible catalog and own drafts',
        reference('RecipeList'),
        {
          public: true,
          parameters: [
            ...pagination,
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string', maxLength: 100, default: '' },
            },
          ],
        },
      ),
    },
    '/v1/saved': {
      get: operation(
        'Own saved recipe IDs (legacy unpaginated slice)',
        reference('SavedList'),
      ),
    },
    '/v1/saved/{id}': {
      put: operation(
        'Repeat-safe save of an accessible recipe',
        {},
        { parameters: [id, key], noContent: true },
      ),
      delete: operation(
        'Repeat-safe removal of own save',
        {},
        { parameters: [id, key], noContent: true },
      ),
    },
    '/v1/preferences': {
      get: operation(
        'Own preferences and current revision',
        reference('PreferencesResponse'),
      ),
      put: operation(
        'Compare-and-set own preferences',
        reference('PreferencesResponse'),
        { parameters: [key], body: 'PreferencesUpdate' },
      ),
    },
    '/v1/resources/{resource}': {
      get: operation(
        'Paginated owner-only foundation rows; not a feature workflow',
        {
          type: 'object',
          required: ['items', 'nextOffset'],
          properties: {
            items: {
              type: 'array',
              items: {
                anyOf: Object.keys(resourceSchemas).map((n) => reference(n)),
              },
            },
            nextOffset: { type: ['integer', 'null'] },
          },
        },
        {
          parameters: [
            {
              name: 'resource',
              in: 'path',
              required: true,
              schema: { type: 'string', enum: Object.keys(resourceSchemas) },
            },
            ...pagination,
          ],
        },
      ),
    },
    '/v1/plans/{id}': {
      get: operation(
        'Own plan and grocery recovery state',
        reference('PlanDocument'),
        { parameters: [id] },
      ),
      put: operation(
        'Save slots and attempt transactional grocery projection; revision zero creates',
        reference('PlanDocument'),
        { parameters: [id, key], body: 'PlanCommit' },
      ),
    },
    '/v1/plans/{id}/repair-groceries': {
      post: operation(
        'Retry stored pending requirements against current revisions',
        reference('PlanDocument'),
        { parameters: [id, key], body: 'PlanRepair' },
      ),
    },
    '/v1/grocery-items/{id}': {
      put: operation(
        'Revisioned shopping edit or manual addition; revision zero creates',
        reference('GroceryEditResult'),
        { parameters: [id, key], body: 'GroceryEdit' },
      ),
    },
    '/v1/shares/{id}': {
      get: operation(
        'Read an unexpired, unrevoked recipe snapshot as its explicit recipient',
        reference('SharedRecipe'),
        { parameters: [id] },
      ),
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Supabase access token',
      },
    },
    schemas: {
      RecipeRating: jsonSchema(
        z
          .object({
            stars: z.number().int().min(1).max(5),
            revision: z.number().int().nonnegative(),
          })
          .strict(),
      ),
      AccountDeletion: jsonSchema(
        z.object({ confirmation: z.literal('DELETE') }).strict(),
      ),
      CollectionCreate: jsonSchema(collectionCreateSchema),
      SavedOrganization: jsonSchema(savedOrganizationSchema),
      RecipeEdit: jsonSchema(recipeEditSchema),
      DiscoveryContext: jsonSchema(discoveryContextSchema),
      WeeklyBudgetUpdate: jsonSchema(
        z
          .object({
            revision: z.number().int().nonnegative(),
            ceilingCents: z.number().int().min(0).max(1000000),
          })
          .strict(),
      ),
      Recipe: jsonSchema(recipeSchema),
      RecipeVersionCreate: jsonSchema(recipeVersionCreateSchema),
      CheckoutEdit: jsonSchema(checkoutEditSchema),
      CheckoutDocument: jsonSchema(checkoutDocumentSchema),
      CheckoutView: jsonSchema(checkoutViewSchema),
      PantryEdit: jsonSchema(pantryEditSchema),
      RegularPurchaseEdit: jsonSchema(regularPurchaseEditSchema),
      KitchenDelete: jsonSchema(kitchenDeleteSchema),
      RegularInclusion: jsonSchema(regularInclusionSchema),
      PlanLock: jsonSchema(planLockSchema),
      RecipeList: jsonSchema(recipeListSchema),
      SavedList: jsonSchema(savedListSchema),
      Preferences: jsonSchema(preferencesSchema),
      PreferencesUpdate: jsonSchema(preferencesUpdateSchema),
      PreferencesResponse: jsonSchema(
        z.object({
          preferences: preferencesSchema,
          revision: z.number().int().positive(),
        }),
      ),
      Error: jsonSchema(errorSchema),
      JobState: jsonSchema(jobStateSchema),
      PlanCommit: jsonSchema(planCommitSchema),
      PlanRepair: jsonSchema(planRepairSchema),
      PlanDocument: jsonSchema(planDocumentSchema),
      GroceryEdit: jsonSchema(groceryEditSchema),
      GroceryDetails: jsonSchema(groceryDetailsSchema),
      GroceryEditResult: jsonSchema(
        z.object({
          item: resourceSchemas.grocery_items,
          listRevision: z.number().int().positive(),
          state: z.enum(['ready', 'needs_review']),
        }),
      ),
      SharedRecipe: jsonSchema(
        z.object({
          shareId: z.uuid(),
          canSave: z.boolean(),
          recipe: z.object({
            title: z.string(),
            description: z.string().nullable(),
            ingredients: z.array(z.unknown()),
            instructions: z.array(z.string()),
            provenance: z.record(z.string(), z.unknown()),
          }),
        }),
      ),
      ...Object.fromEntries(
        Object.entries(resourceSchemas).map(([name, schema]) => [
          name,
          jsonSchema(schema),
        ]),
      ),
    },
  },
};
