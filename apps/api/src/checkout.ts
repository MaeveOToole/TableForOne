import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  checkoutDocumentSchema,
  checkoutEditSchema,
  estimateCheckout,
  operationKeySchema,
  planDocumentSchema,
  preferencesSchema,
  pricingRegion,
  regionalPriceReferences,
} from '@meal/contracts';
import {
  databaseFailure,
  parseDatabaseResponse,
  type Authenticate,
} from './foundation.js';
export function registerCheckoutRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
) {
  app.get('/v1/checkout/:week', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { week } = z.object({ week: z.iso.date() }).parse(request.params);
    const stored = await db.rpc('checkout_document', { p_week: week });
    const missing = ['PGRST202', '42883'].includes(stored.error?.code || '');
    if (stored.error && !missing) throw databaseFailure(stored.error.code);
    const document = missing
      ? checkoutDocumentSchema.parse({
          weekStart: week,
          revision: 0,
          actualCents: null,
          taxCents: null,
          feeCents: null,
          currency: 'USD',
        })
      : parseDatabaseResponse(checkoutDocumentSchema, stored.data);
    const [planRow, budgetRow] = await Promise.all([
      db.from('plans').select('id').eq('week_start', week).maybeSingle(),
      db
        .from('weekly_budgets')
        .select('ceiling_cents')
        .eq('week_start', week)
        .maybeSingle(),
    ]);
    if (planRow.error) throw databaseFailure(planRow.error.code);
    if (budgetRow.error) throw databaseFailure(budgetRow.error.code);
    let budgetCents = budgetRow.data?.ceiling_cents;
    if (budgetCents === undefined) {
      const profile = await db
        .from('preferences')
        .select('preferences')
        .single();
      if (profile.error) throw databaseFailure(profile.error.code);
      budgetCents = preferencesSchema.parse(
        profile.data.preferences,
      ).weeklyBudgetCents;
    }
    let plan = null;
    if (planRow.data) {
      const read = await db.rpc('plan_document', {
        p_plan_id: planRow.data.id,
      });
      if (read.error) throw databaseFailure(read.error.code);
      plan = parseDatabaseResponse(planDocumentSchema, read.data);
    }
    const needsReview = plan?.groceryState === 'needs_review';
    return {
      document,
      canSave: !missing,
      region: pricingRegion,
      budgetCents,
      needsReview,
      estimate: needsReview
        ? null
        : estimateCheckout(
            plan?.groceries.items || [],
            regionalPriceReferences,
            {
              asOf: new Date().toISOString().slice(0, 10),
              budgetCents,
              taxCents: document.taxCents,
              feeCents: document.feeCents,
            },
          ),
    };
  });
  app.put('/v1/checkout/:week', async (request) => {
    const { db } = await authenticate(request.headers.authorization);
    const { week } = z.object({ week: z.iso.date() }).parse(request.params);
    const { revision, ...payload } = checkoutEditSchema.parse(request.body);
    const key = operationKeySchema.parse(request.headers['idempotency-key']);
    const { data, error } = await db.rpc('apply_checkout_mutation', {
      p_key: key,
      p_week: week,
      p_revision: revision,
      p_payload: payload,
    });
    if (['PGRST202', '42883'].includes(error?.code || ''))
      throw Object.assign(
        new Error('Weekly spending setup is not available yet.'),
        { statusCode: 503, publicCode: 'FEATURE_NOT_READY' },
      );
    if (error) throw databaseFailure(error.code);
    return parseDatabaseResponse(checkoutDocumentSchema, data);
  });
}
