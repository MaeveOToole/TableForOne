import { z } from 'zod';
import { compatibleQuantity } from './grocery-calculation';

const cents = z.number().int().min(0).max(1000000).nullable();
export const checkoutEditSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    actualCents: cents,
    taxCents: cents,
    feeCents: cents,
  })
  .strict();
export const checkoutDocumentSchema = checkoutEditSchema.extend({
  weekStart: z.iso.date(),
  currency: z.literal('USD'),
});
export const priceReferenceSchema = z.object({
  id: z.string(),
  aliases: z.array(z.string()),
  priceCents: z.number().nonnegative(),
  quantity: z.number().positive(),
  unit: z.string(),
  basis: z.enum(['package', 'standard_unit']),
  source: z.string(),
  sourceUrl: z.url(),
  region: z.string(),
  store: z.string().nullable(),
  currency: z.literal('USD'),
  observedPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  confidence: z.enum(['low', 'medium', 'high']),
});
export type PriceReference = z.infer<typeof priceReferenceSchema>;
export const checkoutEstimateSchema = z.object({
  lines: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      estimatedCents: z.number().int().nonnegative().nullable(),
      packageUnknown: z.boolean(),
      reason: z.string(),
      reference: priceReferenceSchema.nullable(),
    }),
  ),
  subtotalCents: z.number().int().nonnegative().nullable(),
  missingCount: z.number().int().nonnegative(),
  packageUnknownCount: z.number().int().nonnegative(),
  complete: z.boolean(),
  totalCents: z.number().int().nonnegative().nullable(),
  taxUnknown: z.boolean(),
  feesUnknown: z.boolean(),
  overBudgetCents: z.number().int().positive().nullable(),
});
export const checkoutViewSchema = z.object({
  document: checkoutDocumentSchema,
  canSave: z.boolean(),
  budgetCents: z.number().int().nonnegative(),
  needsReview: z.boolean(),
  estimate: checkoutEstimateSchema.nullable(),
  region: z.object({
    requestedRegion: z.string(),
    coverageRegion: z.string(),
    observedPeriod: z.string(),
    source: z.string(),
    sourceUrl: z.url(),
    note: z.string(),
  }),
});
type Item = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  deleted: boolean;
};
const normalize = (text: string) =>
  text.trim().toLowerCase().replace(/\s+/g, ' ');
export function estimateCheckout(
  items: Item[],
  references: PriceReference[],
  options: {
    asOf: string;
    taxCents: number | null;
    feeCents: number | null;
    budgetCents: number;
  },
) {
  z.iso.date().parse(options.asOf);
  z.number().int().nonnegative().parse(options.budgetCents);
  for (const amount of [options.taxCents, options.feeCents])
    cents.parse(amount);
  const lines = items
    .filter((item) => !item.deleted)
    .map((item) => {
      const reference = references.find((reference) =>
        reference.aliases.some(
          (alias) => normalize(alias) === normalize(item.name),
        ),
      );
      const unknown = (reason: string) => ({
        id: item.id,
        name: item.name,
        estimatedCents: null as number | null,
        packageUnknown: true,
        reason,
        reference: reference || null,
      });
      if (!reference) return unknown('No matching regional reference price.');
      const endOfPeriod = new Date(`${reference.observedPeriod}-01T12:00:00Z`);
      endOfPeriod.setUTCMonth(endOfPeriod.getUTCMonth() + 1);
      endOfPeriod.setUTCDate(0);
      const age =
        (Date.parse(`${options.asOf}T12:00:00Z`) - endOfPeriod.getTime()) /
        86400000;
      if (age < 0 || age > 120)
        return unknown('Reference price is outside the supported date range.');
      if (item.quantity === null || item.quantity <= 0 || !item.unit?.trim())
        return unknown('Quantity and unit need review before estimating.');
      const needed = compatibleQuantity(item.quantity, item.unit),
        basis = compatibleQuantity(reference.quantity, reference.unit);
      if (needed.unit !== basis.unit)
        return unknown('No verified conversion to the reference unit.');
      const packages =
        reference.basis === 'package'
          ? Math.ceil(needed.quantity / basis.quantity - 1e-10)
          : needed.quantity / basis.quantity;
      return {
        id: item.id,
        name: item.name,
        estimatedCents: Math.round(packages * reference.priceCents),
        packageUnknown: reference.basis !== 'package',
        reason:
          reference.basis === 'package'
            ? 'Estimated package checkout cost.'
            : 'Quantity-based average; purchasable package size is unknown.',
        reference,
      };
    });
  const priced = lines.filter((line) => line.estimatedCents !== null);
  const missingCount = lines.length - priced.length;
  const packageUnknownCount = lines.filter(
    (line) => line.packageUnknown && line.estimatedCents !== null,
  ).length;
  const subtotalCents = priced.length
    ? priced.reduce((sum, line) => sum + line.estimatedCents!, 0)
    : null;
  const complete =
    missingCount === 0 &&
    packageUnknownCount === 0 &&
    options.taxCents !== null &&
    options.feeCents !== null;
  const totalCents = complete
    ? (subtotalCents || 0) + options.taxCents! + options.feeCents!
    : null;
  const knownChargesCents =
    (subtotalCents || 0) + (options.taxCents || 0) + (options.feeCents || 0);
  return {
    lines,
    subtotalCents,
    missingCount,
    packageUnknownCount,
    complete,
    totalCents,
    taxUnknown: options.taxCents === null,
    feesUnknown: options.feeCents === null,
    overBudgetCents:
      knownChargesCents > options.budgetCents
        ? knownChargesCents - options.budgetCents
        : null,
  };
}
