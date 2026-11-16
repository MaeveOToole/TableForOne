import { capitalizeItem } from './item-name';
import { z } from 'zod';
import { planDocumentSchema, resourceSchemas } from '@meal/contracts';
import {
  createGroceryWeek,
  groceryId,
  readGroceryWeek,
  writeGroceryItem,
  type GroceryApi,
  type GroceryItem,
  type GroceryPlan,
} from './weekly-groceries';

const editable = resourceSchemas.grocery_items
  .pick({
    name: true,
    raw_text: true,
    quantity: true,
    unit: true,
    checked: true,
    deleted: true,
  })
  .extend({
    section: z.string().nullable().default(null),
    notes: z.string().nullable().default(null),
  });
export type GroceryChanges = z.infer<typeof editable>;
// Defaults repair legacy base snapshots only. Patches must not acquire null
// notes/sections merely because the actual edit was a checkmark or quantity.
const changesSchema = editable
  .omit({ section: true, notes: true })
  .partial()
  .extend({
    section: z.string().trim().min(1).max(80).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  });
const fields = [
  'name',
  'raw_text',
  'quantity',
  'unit',
  'checked',
  'deleted',
  'section',
  'notes',
] as const;
const operationSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  before: editable.nullable(),
  changes: changesSchema,
  attempt: z
    .object({
      key: z.string(),
      details: z.boolean().optional(),
      item: resourceSchemas.grocery_items.extend({
        revision: z.number().int().nonnegative(),
      }),
    })
    .optional(),
  conflict: z.string().optional(),
});
const cacheSchema = z.object({
  version: z.literal(1),
  creationId: z.string(),
  plan: planDocumentSchema.nullable(),
  operations: z.array(operationSchema),
  refreshedAt: z.string().nullable(),
});
type Cache = z.infer<typeof cacheSchema>;
export interface GroceryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export type GrocerySnapshot = {
  plan: GroceryPlan | null;
  items: GroceryItem[];
  pending: number;
  conflicts: { id: string; message: string }[];
  refreshedAt: string | null;
};

// A single durable record commits the cache and outbox together. Server revisions
// remain authoritative; optimistic edits never invent a server acknowledgement.
export class OfflineGroceries {
  private tail: Promise<unknown> = Promise.resolve();
  private loaded = false;
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => undefined);
    return result;
  }
  load() {
    return this.serial(() => this.loadStored());
  }
  add(text: string) {
    return this.serial(() => this.addStored(text));
  }
  edit(itemId: string, changes: Partial<GroceryChanges>) {
    return this.serial(() => this.editStored(itemId, changes));
  }
  resolve(id: string, choice: 'server' | 'device') {
    return this.serial(() => this.resolveStored(id, choice));
  }
  sync() {
    return this.serial(() => this.synchronize());
  }
  private cache: Cache = {
    version: 1,
    creationId: groceryId(),
    plan: null,
    operations: [],
    refreshedAt: null,
  };
  private readonly key: string;
  constructor(
    private storage: GroceryStorage,
    private api: GroceryApi,
    private owner: string,
    private week: string,
  ) {
    this.key = `meal-groceries-v1:${owner}:${week}`;
  }
  private async loadStored() {
    if (this.loaded) return this.snapshot();
    const raw = await this.storage.getItem(this.key);
    if (raw) this.cache = cacheSchema.parse(JSON.parse(raw));
    this.loaded = true;
    return this.snapshot();
  }
  private async persist(next: Cache) {
    await this.storage.setItem(this.key, JSON.stringify(next));
    this.cache = next;
  }
  private newItem(id: string, changes: Partial<GroceryChanges>): GroceryItem {
    const now = new Date().toISOString();
    return {
      id,
      user_id: this.owner,
      revision: 1,
      created_at: now,
      updated_at: now,
      list_id: this.cache.plan?.groceries.id || this.cache.creationId,
      name: '',
      raw_text: '',
      quantity: null,
      unit: null,
      section: null,
      notes: null,
      origin: 'manual',
      origin_key: null,
      origins: [],
      checked: false,
      overridden: false,
      deleted: false,
      ...changes,
    };
  }
  snapshot(): GrocerySnapshot {
    const items = new Map(
      this.cache.plan?.groceries.items.map((item) => [item.id, item]),
    );
    for (const op of this.cache.operations) {
      const item =
        items.get(op.itemId) || this.newItem(op.itemId, op.before || {});
      items.set(op.itemId, { ...item, ...op.changes });
    }
    return {
      plan: this.cache.plan,
      items: [...items.values()].filter((item) => !item.deleted),
      pending: this.cache.operations.length,
      conflicts: this.cache.operations.flatMap((op) =>
        op.conflict ? [{ id: op.id, message: op.conflict }] : [],
      ),
      refreshedAt: this.cache.refreshedAt,
    };
  }
  private async addStored(text: string) {
    const name = capitalizeItem(text);
    if (!name || name.length > 200)
      throw new Error('Enter an item of up to 200 characters.');
    await this.persist({
      ...this.cache,
      operations: [
        ...this.cache.operations,
        {
          id: groceryId(),
          itemId: groceryId(),
          before: null,
          changes: {
            name,
            raw_text: name,
            quantity: null,
            unit: null,
            checked: false,
            deleted: false,
          },
        },
      ],
    });
    return this.snapshot();
  }
  private async editStored(itemId: string, changes: Partial<GroceryChanges>) {
    const item = this.snapshot().items.find((item) => item.id === itemId);
    if (!item) throw new Error('Item no longer exists. Refresh the list.');
    await this.persist({
      ...this.cache,
      operations: [
        ...this.cache.operations,
        {
          id: groceryId(),
          itemId,
          before: editable.parse(item),
          changes: changesSchema.parse(changes),
        },
      ],
    });
    return this.snapshot();
  }
  private async resolveStored(id: string, choice: 'server' | 'device') {
    const op = this.cache.operations.find((op) => op.id === id);
    if (!op) return;
    const remote = this.cache.plan?.groceries.items.find(
      (item) => item.id === op.itemId,
    );
    if (choice === 'device' && !remote)
      throw new Error(
        'This item was removed on another device. Add it again to restore it.',
      );
    // Dependent edits need a fresh decision too; don't replay an obsolete base.
    const remaining = this.cache.operations.filter(
      (other) => other.itemId !== op.itemId,
    );
    if (choice === 'device' && remote) {
      const dependent = this.cache.operations.filter(
        (other) => other.itemId === op.itemId,
      );
      const desired = dependent.reduce(
        (item, operation) => ({ ...item, ...operation.changes }),
        editable.parse(remote),
      );
      const touched = new Set(
        dependent.flatMap((operation) => Object.keys(operation.changes)),
      );
      const changes = changesSchema.parse(
        Object.fromEntries(
          fields
            .filter((field) => touched.has(field))
            .map((field) => [field, desired[field]]),
        ),
      );
      remaining.push({
        id: groceryId(),
        itemId: op.itemId,
        before: editable.parse(remote),
        changes,
      });
    }
    await this.persist({ ...this.cache, operations: remaining });
  }
  private async synchronize() {
    let plan = await readGroceryWeek(this.api, this.week);
    if (!plan && this.cache.plan)
      throw new Error(
        'This week is no longer available. Pending edits are kept; refresh before continuing.',
      );
    if (!plan && this.cache.operations.length)
      plan = await createGroceryWeek(
        this.api,
        this.week,
        this.cache.creationId,
        `week-${this.cache.creationId}`,
      );
    await this.persist({
      ...this.cache,
      plan,
      refreshedAt: new Date().toISOString(),
    });
    if (!plan) return this.snapshot();
    if (plan.groceryState !== 'ready')
      throw new Error(
        'This week needs grocery repair before syncing. Your pending edits are kept.',
      );
    const blocked = new Set<string>();
    for (let op of [...this.cache.operations]) {
      if (blocked.has(op.itemId)) continue;
      const remote = plan.groceries.items.find((item) => item.id === op.itemId);
      const touched = fields.filter((field) =>
        Object.hasOwn(op.changes, field),
      );
      // Lost-response recovery: a server row already matching this intention is done.
      if (
        (remote &&
          touched.every((field) => remote[field] === op.changes[field])) ||
        (!remote && op.changes.deleted)
      ) {
        await this.persist({
          ...this.cache,
          operations: this.cache.operations.filter(
            (other) => other.id !== op.id,
          ),
        });
        continue;
      }
      const conflict =
        op.before &&
        (!remote ||
          touched.some(
            (field) =>
              remote[field] !== op.before![field] &&
              remote[field] !== op.changes[field],
          ));
      if (conflict && !op.attempt) {
        const message = `${op.before?.name || 'Item'} changed on another device. Choose which version to keep.`;
        await this.persist({
          ...this.cache,
          operations: this.cache.operations.map((other) =>
            other.id === op.id ? { ...other, conflict: message } : other,
          ),
        });
        blocked.add(op.itemId);
        continue;
      }
      if (!op.attempt) {
        op = {
          ...op,
          conflict: undefined,
          attempt: {
            key: groceryId(),
            details: touched.some(
              (field) => field === 'section' || field === 'notes',
            ),
            item: {
              ...(remote || this.newItem(op.itemId, {})),
              ...op.changes,
              revision: remote?.revision || 0,
            },
          },
        };
        await this.persist({
          ...this.cache,
          operations: this.cache.operations.map((other) =>
            other.id === op.id ? op : other,
          ),
        });
      }
      try {
        const result = await writeGroceryItem(
          this.api,
          plan.groceries.id,
          op.attempt!.item,
          op.attempt!.key,
          op.attempt!.details,
        );
        plan = {
          ...plan,
          groceries: {
            ...plan.groceries,
            revision: result.listRevision,
            state: result.state,
            items: [
              ...plan.groceries.items.filter((item) => item.id !== op.itemId),
              ...(result.item.deleted ? [] : [result.item]),
            ],
          },
        };
        await this.persist({
          ...this.cache,
          plan,
          operations: this.cache.operations.filter(
            (other) => other.id !== op.id,
          ),
        });
      } catch (error) {
        // A rejected revision has no effects. Rebase on the next fresh read.
        if (
          error &&
          typeof error === 'object' &&
          'status' in error &&
          error.status === 409
        )
          await this.persist({
            ...this.cache,
            operations: this.cache.operations.map((other) =>
              other.id === op.id ? { ...other, attempt: undefined } : other,
            ),
          });
        throw error;
      }
    }
    const latest = await readGroceryWeek(this.api, this.week);
    if (latest) await this.persist({ ...this.cache, plan: latest });
    return this.snapshot();
  }
}
