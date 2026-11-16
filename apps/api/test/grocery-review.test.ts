import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewGroceryProjection,
  type GroceryRequirement,
  type StoredGroceryRequirement,
} from '@meal/contracts';
const stored: StoredGroceryRequirement = {
  name: 'onion',
  raw_text: '1 each onion',
  quantity: 1,
  unit: 'each',
  origin: 'derived',
  origin_key: 'onion',
  overridden: false,
  deleted: false,
  checked: true,
};
const projected: GroceryRequirement = {
  name: 'onion',
  rawText: '2 each onion',
  quantity: 2,
  unit: 'each',
  originKey: 'onion',
  origins: [],
};
test('grocery review highlights changed quantities without changing the stored list and identifies removals', () => {
  const prior = { ...stored },
    result = reviewGroceryProjection(
      [projected],
      [
        prior,
        { ...stored, origin_key: 'rice', name: 'rice', raw_text: '100 g rice' },
      ],
    );
  assert.equal(result.rows[0].status, 'quantity_changed');
  assert.equal(result.rows[0].previous!.checked, true);
  assert.equal(result.removed[0].name, 'rice');
  assert.deepEqual(prior, stored);
  assert.deepEqual(
    result,
    reviewGroceryProjection(
      [projected],
      [
        prior,
        { ...stored, origin_key: 'rice', name: 'rice', raw_text: '100 g rice' },
      ],
    ),
  );
});
test('grocery review reports preserved overrides, deletions and unrelated purchases truthfully', () => {
  assert.equal(
    reviewGroceryProjection([projected], [{ ...stored, overridden: true }])
      .rows[0].status,
    'kept_override',
  );
  assert.equal(
    reviewGroceryProjection([projected], [{ ...stored, deleted: true }]).rows[0]
      .status,
    'kept_deletion',
  );
  const result = reviewGroceryProjection(
    [],
    [
      { ...stored, origin: 'manual', origin_key: null, name: 'Yogurt' },
      { ...stored, origin: 'regular', origin_key: null, name: 'Milk' },
      { ...stored, overridden: true },
    ],
  );
  assert.equal(result.removed.length, 0);
  assert.deepEqual(
    result.kept.map((item) => item.name),
    ['Yogurt', 'Milk', 'onion'],
  );
});
