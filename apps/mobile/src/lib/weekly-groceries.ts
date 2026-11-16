import { z } from 'zod';
import {
  planDocumentSchema,
  recordIdSchema,
  resourceSchemas,
} from '@meal/contracts';

export type GroceryPlan = z.infer<typeof planDocumentSchema>;
export type GroceryItem = z.infer<typeof resourceSchemas.grocery_items>;
export type GroceryApi = (
  path: string,
  method?: string,
  body?: unknown,
  operationKey?: string,
) => Promise<unknown>;
export function groceryId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const value = Math.floor(Math.random() * 16);
    return (c === 'x' ? value : (value & 3) | 8).toString(16);
  });
}
export async function readGroceryWeek(
  read: GroceryApi,
  week: string,
): Promise<GroceryPlan | null> {
  let offset: number | null = 0;
  const seen = new Set<number>();
  while (offset !== null) {
    if (seen.has(offset))
      throw new Error('Unable to load this week. Please refresh.');
    seen.add(offset);
    const page = z
      .object({
        items: z.array(
          z.object({ id: recordIdSchema, week_start: z.iso.date() }),
        ),
        nextOffset: z.number().int().nonnegative().nullable(),
      })
      .parse(await read(`/resources/plans?limit=50&offset=${offset}`));
    const found = page.items.find((plan) => plan.week_start === week);
    if (found)
      return planDocumentSchema.parse(await read(`/plans/${found.id}`));
    offset = page.nextOffset;
  }
  return null;
}
export async function createGroceryWeek(
  write: GroceryApi,
  week: string,
  id: string,
  operationKey?: string,
) {
  return planDocumentSchema.parse(
    await write(
      `/plans/${id}`,
      'PUT',
      {
        revision: 0,
        groceryRevision: 0,
        weekStart: week,
        slots: [],
        groceries: [],
      },
      operationKey,
    ),
  );
}
export async function writeGroceryItem(
  write: GroceryApi,
  listId: string,
  item: Pick<
    GroceryItem,
    | 'id'
    | 'revision'
    | 'name'
    | 'raw_text'
    | 'quantity'
    | 'unit'
    | 'checked'
    | 'deleted'
  > &
    Partial<Pick<GroceryItem, 'section' | 'notes'>>,
  operationKey?: string,
  includeDetails = false,
) {
  return z
    .object({
      item: resourceSchemas.grocery_items,
      listRevision: z.number().int().positive(),
      state: z.enum(['ready', 'needs_review']),
    })
    .parse(
      await write(
        `/grocery-items/${item.id}${includeDetails ? '/details' : ''}`,
        'PUT',
        {
          listId,
          revision: item.revision,
          name: item.name,
          rawText: item.raw_text,
          quantity: item.quantity,
          unit: item.unit,
          checked: item.checked,
          deleted: item.deleted,
          ...(includeDetails
            ? { section: item.section ?? null, notes: item.notes ?? null }
            : {}),
        },
        operationKey,
      ),
    );
}
