import source from './northeast-price-references.json';
import { priceReferenceSchema } from './checkout';
export const pricingRegion = {
  requestedRegion: source.requestedRegion,
  coverageRegion: source.coverageRegion,
  observedPeriod: source.observedPeriod,
  source: source.source,
  sourceUrl: source.sourceUrl,
  note: source.note,
};
export const regionalPriceReferences = source.items.map((item) =>
  priceReferenceSchema.parse({
    id: item.id,
    aliases: item.aliases,
    priceCents: item.dollarsPerPound * 100,
    quantity: 1,
    unit: 'lb',
    basis: 'standard_unit',
    source: source.source,
    sourceUrl: source.sourceUrl,
    region: source.coverageRegion,
    store: null,
    currency: 'USD',
    observedPeriod: source.observedPeriod,
    confidence: 'low',
  }),
);
