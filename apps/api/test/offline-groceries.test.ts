import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OfflineGroceries,
  type GroceryStorage,
} from '../../mobile/src/lib/offline-groceries';
import {
  groceryId,
  type GroceryApi,
  type GroceryPlan,
  type GroceryItem,
} from '../../mobile/src/lib/weekly-groceries';

const owner = '10000000-0000-4000-8000-000000000001';
const week = '2026-11-02';
const clone = <T>(value: T): T => structuredClone(value);
function storage(): GroceryStorage {
  const data = new Map<string, string>();
  return {
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
  };
}
function server() {
  let plan: GroceryPlan | null = null;
  let offline = false,
    loseResponse = false;
  const results = new Map<string, unknown>();
  const keys: string[] = [];
  const api: GroceryApi = async (path, method = 'GET', raw, key) => {
    if (offline) throw new TypeError('Offline');
    if (method === 'GET') {
      if (path.startsWith('/resources/plans'))
        return {
          items: plan ? [{ id: plan.id, week_start: week }] : [],
          nextOffset: null,
        };
      return clone(plan);
    }
    if (!key) throw new Error('Missing operation key');
    keys.push(key);
    if (results.has(key)) return clone(results.get(key));
    if (path.startsWith('/plans/')) {
      plan = {
        id: path.split('/').pop()!,
        revision: 1,
        weekStart: week,
        groceryState: 'ready',
        slots: [],
        recovery: null,
        groceries: {
          id: groceryId(),
          revision: 1,
          state: 'ready',
          recoveryCode: null,
          items: [],
        },
      };
      results.set(key, clone(plan));
      return clone(plan);
    }
    const body = raw as {
      revision: number;
      name: string;
      rawText: string;
      quantity: number | null;
      unit: string | null;
      checked: boolean;
      deleted: boolean;
      section?: string | null;
      notes?: string | null;
    };
    const id = path.split('/')[2];
    const old = plan!.groceries.items.find((item) => item.id === id);
    if ((old?.revision || 0) !== body.revision)
      throw Object.assign(new Error('Conflict'), { status: 409 });
    const item: GroceryItem = {
      id,
      user_id: owner,
      revision: body.revision + 1,
      created_at: '2026-11-02T12:00:00Z',
      updated_at: '2026-11-02T12:00:00Z',
      list_id: plan!.groceries.id,
      name: body.name,
      raw_text: body.rawText,
      quantity: body.quantity,
      unit: body.unit,
      section:
        body.section === undefined ? (old?.section ?? null) : body.section,
      notes: body.notes === undefined ? (old?.notes ?? null) : body.notes,
      origin: 'manual',
      origin_key: null,
      origins: [],
      checked: body.checked,
      deleted: body.deleted,
      overridden: false,
    };
    plan!.groceries.items = [
      ...plan!.groceries.items.filter((item) => item.id !== id),
      ...(item.deleted ? [] : [item]),
    ];
    const result = {
      item,
      listRevision: ++plan!.groceries.revision,
      state: 'ready',
    };
    results.set(key, clone(result));
    if (loseResponse) {
      loseResponse = false;
      throw new TypeError('Response lost');
    }
    return clone(result);
  };
  return {
    api,
    keys,
    get plan() {
      return plan!;
    },
    set offline(value: boolean) {
      offline = value;
    },
    set loseResponse(value: boolean) {
      loseResponse = value;
    },
  };
}

test('offline check and online addition survive restart and merge without losing either device edit', async () => {
  const remote = server(),
    local = storage();
  const first = new OfflineGroceries(local, remote.api, owner, week);
  await first.load();
  await first.add('Milk');
  await first.sync();
  const second = new OfflineGroceries(storage(), remote.api, owner, week);
  await second.load();
  await second.sync();
  remote.offline = true;
  await first.edit(first.snapshot().items[0].id, { checked: true });
  await assert.rejects(first.sync());
  const restarted = new OfflineGroceries(local, remote.api, owner, week);
  await restarted.load();
  assert.equal(restarted.snapshot().items[0].checked, true);
  assert.equal(restarted.snapshot().pending, 1);
  remote.offline = false;
  await second.add('Bread');
  await second.sync();
  await restarted.sync();
  assert.deepEqual(
    remote.plan.groceries.items.map((i) => [i.name, i.checked]).sort(),
    [
      ['Bread', false],
      ['Milk', true],
    ],
  );
  assert.equal(restarted.snapshot().pending, 0);
});

test('same field conflicts require a decision while unrelated changes merge', async () => {
  const remote = server(),
    first = new OfflineGroceries(storage(), remote.api, owner, week);
  await first.load();
  await first.add('Milk');
  await first.sync();
  const id = first.snapshot().items[0].id;
  await first.edit(id, { quantity: 2, unit: 'bottles' });
  remote.plan.groceries.items[0].quantity = 3;
  remote.plan.groceries.items[0].revision++;
  await first.sync();
  assert.equal(first.snapshot().conflicts.length, 1);
  assert.equal(remote.plan.groceries.items[0].quantity, 3);
  await first.resolve(first.snapshot().conflicts[0].id, 'device');
  await first.sync();
  assert.equal(remote.plan.groceries.items[0].quantity, 2);
  await first.edit(id, { checked: true });
  remote.plan.groceries.items[0].raw_text = 'Organic milk';
  remote.plan.groceries.items[0].revision++;
  await first.sync();
  assert.equal(remote.plan.groceries.items[0].raw_text, 'Organic milk');
  assert.equal(remote.plan.groceries.items[0].checked, true);
});

test('uncertain writes persist their operation key and never duplicate after restarting', async () => {
  const remote = server(),
    local = storage();
  const first = new OfflineGroceries(local, remote.api, owner, week);
  await first.load();
  await first.add('Eggs');
  remote.loseResponse = true;
  await assert.rejects(first.sync());
  const restarted = new OfflineGroceries(local, remote.api, owner, week);
  await restarted.load();
  await restarted.sync();
  await restarted.sync();
  assert.equal(remote.plan.groceries.items.length, 1);
  assert.equal(restarted.snapshot().pending, 0);
});

test('account and week caches are isolated and storage failures never acknowledge a local save', async () => {
  const remote = server(),
    local = storage();
  const first = new OfflineGroceries(local, remote.api, owner, week);
  await first.load();
  await first.add('Eggs');
  for (const [user, date] of [
    [groceryId(), week],
    [owner, '2026-11-09'],
  ]) {
    const other = new OfflineGroceries(local, remote.api, user, date);
    await other.load();
    assert.equal(other.snapshot().items.length, 0);
  }
  const broken = new OfflineGroceries(
    {
      async getItem() {
        return null;
      },
      async setItem() {
        throw new Error('Storage full');
      },
    },
    remote.api,
    owner,
    week,
  );
  await broken.load();
  await assert.rejects(broken.add('Bread'), /Storage full/);
  assert.equal(broken.snapshot().pending, 0);
});

test('offline notes survive restart, merge with a remote check, and resolve conflicts without dropping queued core edits', async () => {
  const remote = server(),
    local = storage(),
    first = new OfflineGroceries(local, remote.api, owner, week);
  await first.load();
  await first.add('Milk');
  await first.sync();
  const id = first.snapshot().items[0].id;
  remote.offline = true;
  await first.edit(id, { notes: 'Unsweetened', section: 'Cooler' });
  await assert.rejects(first.sync());
  const restarted = new OfflineGroceries(local, remote.api, owner, week);
  await restarted.load();
  assert.equal(restarted.snapshot().items[0].notes, 'Unsweetened');
  remote.offline = false;
  remote.plan.groceries.items[0].checked = true;
  remote.plan.groceries.items[0].revision++;
  await restarted.sync();
  assert.equal(remote.plan.groceries.items[0].checked, true);
  assert.equal(remote.plan.groceries.items[0].section, 'Cooler');
  await restarted.edit(id, { notes: 'This device note' });
  await restarted.edit(id, { checked: false });
  remote.plan.groceries.items[0].notes = 'Other device note';
  remote.plan.groceries.items[0].revision++;
  await restarted.sync();
  assert.equal(restarted.snapshot().conflicts.length, 1);
  await restarted.resolve(restarted.snapshot().conflicts[0].id, 'device');
  await restarted.sync();
  assert.equal(remote.plan.groceries.items[0].notes, 'This device note');
  assert.equal(remote.plan.groceries.items[0].checked, false);
  assert.equal(restarted.snapshot().pending, 0);
});
