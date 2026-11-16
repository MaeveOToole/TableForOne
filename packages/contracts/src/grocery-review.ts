import type { GroceryRequirement } from './grocery-calculation';
export type StoredGroceryRequirement = {
  name: string;
  raw_text: string;
  quantity: number | null;
  unit: string | null;
  origin: string;
  origin_key: string | null;
  overridden: boolean;
  deleted: boolean;
  checked: boolean;
};
export function reviewGroceryProjection(
  projection: GroceryRequirement[],
  stored: StoredGroceryRequirement[],
) {
  const previous = new Map(
    stored
      .filter((item) => item.origin === 'derived' && item.origin_key)
      .map((item) => [item.origin_key, item]),
  );
  const keys = new Set(projection.map((item) => item.originKey));
  const rows = projection.map((item) => {
    const prior = previous.get(item.originKey) || null;
    const status = !prior
      ? 'new'
      : prior.deleted
        ? 'kept_deletion'
        : prior.overridden
          ? 'kept_override'
          : prior.quantity !== item.quantity || prior.unit !== item.unit
            ? 'quantity_changed'
            : 'unchanged';
    return { item, previous: prior, status };
  });
  const removed = stored.filter(
    (item) =>
      item.origin === 'derived' &&
      !item.deleted &&
      !item.overridden &&
      !keys.has(item.origin_key!),
  );
  const kept = stored.filter(
    (item) =>
      !item.deleted &&
      (item.origin !== 'derived' || item.overridden) &&
      !keys.has(item.origin_key!),
  );
  return { rows, removed, kept };
}
