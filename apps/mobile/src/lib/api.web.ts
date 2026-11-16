import { configured } from './supabase';
import { api as remoteApi } from './transport';
import recipes from '../data/demo-recipes.json';
import {
  defaultPreferences,
  preferencesUpdateSchema,
  planCommitSchema,
  groceryEditSchema,
  groceryDetailsSchema,
  planDocumentSchema,
  recordIdSchema,
} from '@meal/contracts';
import { groceryId, type GroceryPlan } from './weekly-groceries';
export const preview = !configured;
const key = 'meal-planner-browser-demo-v1';
function read() {
  const stored = localStorage.getItem(key);
  return stored
    ? JSON.parse(stored)
    : { saved: [] as string[], preferences: defaultPreferences, revision: 1 };
}
export async function api(
  path: string,
  method = 'GET',
  body?: unknown,
  retryKey?: string,
  expectedOwner?: string,
) {
  if (!preview) return remoteApi(path, method, body, retryKey, expectedOwner);
  const state = read();
  if (/^\/recipes\/[^/]+\/rating$/.test(path)) {
    state.ratings ??= {};
    const id = path.split('/')[2];
    const current = state.ratings[id] || { stars: null, revision: 0 };
    if (method === 'GET') return current;
    const change = body as { stars: number; revision: number };
    if (
      !Number.isInteger(change.stars) ||
      change.stars < 1 ||
      change.stars > 5 ||
      change.revision !== current.revision
    )
      throw new Error('Rating changed. Refresh and try again.');
    state.ratings[id] = { stars: change.stars, revision: current.revision + 1 };
    localStorage.setItem(key, JSON.stringify(state));
    return state.ratings[id];
  }
  state.plans ??= {};
  const plans = state.plans as Record<string, GroceryPlan>;
  const visiblePlan = (plan: GroceryPlan) => ({
    ...plan,
    groceries: {
      ...plan.groceries,
      items: plan.groceries.items.filter((item) => !item.deleted),
    },
  });
  if (path.startsWith('/resources/plans')) {
    const params = new URLSearchParams(path.split('?')[1]);
    const offset = Number(params.get('offset') || 0),
      limit = Number(params.get('limit') || 50);
    const all = Object.values(plans).sort((a, b) => a.id.localeCompare(b.id));
    return {
      items: all
        .slice(offset, offset + limit)
        .map((plan) => ({ id: plan.id, week_start: plan.weekStart })),
      nextOffset: offset + limit < all.length ? offset + limit : null,
    };
  }
  if (path.startsWith('/plans/')) {
    const id = recordIdSchema.parse(path.split('/').pop());
    if (method === 'GET') {
      if (!plans[id])
        throw new Error('Weekly list not found. Refresh and retry.');
      return visiblePlan(plans[id]);
    }
    const input = planCommitSchema.parse(body);
    if (
      plans[id] ||
      Object.values(plans).some((plan) => plan.weekStart === input.weekStart)
    )
      throw new Error('This week already exists. Refresh and retry.');
    if (input.revision !== 0 || input.slots.length || input.groceries.length)
      throw new Error('The browser demo supports manual grocery lists only.');
    const plan = planDocumentSchema.parse({
      id,
      revision: 1,
      weekStart: input.weekStart,
      groceryState: 'ready',
      slots: [],
      groceries: {
        id: groceryId(),
        revision: 1,
        state: 'ready',
        recoveryCode: null,
        items: [],
      },
      recovery: null,
    });
    plans[id] = plan;
    localStorage.setItem(key, JSON.stringify(state));
    return visiblePlan(plan);
  }
  if (path.startsWith('/grocery-items/')) {
    const id = recordIdSchema.parse(path.split('/')[2]);
    const details = path.endsWith('/details');
    const detailInput = details ? groceryDetailsSchema.parse(body) : null;
    const input = detailInput || groceryEditSchema.parse(body);
    const plan = Object.values(plans).find(
      (plan) => plan.groceries.id === input.listId,
    );
    if (!plan) throw new Error('Weekly list not found. Refresh and retry.');
    const old = plan.groceries.items.find((item) => item.id === id);
    if (details && !old)
      throw new Error('Item no longer exists. Refresh the list.');
    if ((old?.revision || 0) !== input.revision)
      throw new Error('This item changed. Refresh before trying again.');
    const now = new Date().toISOString();
    const item = {
      ...old,
      id,
      user_id: '00000000-0000-4000-8000-000000000001',
      revision: input.revision + 1,
      created_at: old?.created_at || now,
      updated_at: now,
      list_id: input.listId,
      name: input.name,
      raw_text: input.rawText,
      quantity: input.quantity,
      unit: input.unit,
      section: detailInput ? detailInput.section : old?.section || null,
      notes: detailInput ? detailInput.notes : old?.notes || null,
      origin: old?.origin || 'manual',
      origin_key: old?.origin_key || null,
      origins: old?.origins || [],
      checked: input.checked,
      deleted: input.deleted,
      overridden: old?.overridden || false,
    };
    plan.groceries.items = [
      ...plan.groceries.items.filter((item) => item.id !== id),
      item,
    ];
    plan.groceries.revision++;
    localStorage.setItem(key, JSON.stringify(state));
    return {
      item,
      listRevision: plan.groceries.revision,
      state: plan.groceries.state,
    };
  }
  if (path.startsWith('/weekly-budgets/')) {
    state.weeklyBudgets ??= {};
    const week = path.split('/').pop()!;
    const current = state.weeklyBudgets[week] || {
      weekStart: week,
      revision: 0,
      ceilingCents: state.preferences.weeklyBudgetCents,
      currency: 'USD',
    };
    if (method === 'GET') return current;
    const change = body as { revision: number; ceilingCents: number };
    if (change.revision !== current.revision)
      throw new Error('Weekly budget changed. Reload before saving.');
    const updated = {
      ...current,
      revision: current.revision + 1,
      ceilingCents: change.ceilingCents,
    };
    state.weeklyBudgets[week] = updated;
    localStorage.setItem(key, JSON.stringify(state));
    return updated;
  }
  if (path.startsWith('/recipes')) {
    const query = new URLSearchParams(path.split('?')[1]);
    const offset = Number(query.get('offset') || 0);
    const limit = Number(query.get('limit') || 20);
    const items = recipes.filter((recipe) =>
      recipe.title.toLowerCase().includes((query.get('q') || '').toLowerCase()),
    );
    return {
      items: items.slice(offset, offset + limit),
      nextOffset: offset + limit < items.length ? offset + limit : null,
    };
  }
  if (path === '/saved')
    return {
      items: state.saved.map((recipe_id: string) => ({
        recipe_id,
        created_at: new Date(0).toISOString(),
      })),
    };
  if (path.startsWith('/saved/')) {
    const id = path.split('/').pop();
    state.saved = state.saved.filter((saved: string) => saved !== id);
    if (method === 'PUT') state.saved.push(id);
  } else if (path === '/preferences') {
    if (method === 'GET')
      return { preferences: state.preferences, revision: state.revision };
    const input = preferencesUpdateSchema.parse(body);
    if (input.revision !== state.revision)
      throw new Error(
        'Preferences changed in another tab. Reload and try again.',
      );
    state.preferences = input.preferences;
    state.revision++;
  } else throw new Error('This feature is not available in the browser demo.');
  localStorage.setItem(key, JSON.stringify(state));
  return path === '/preferences'
    ? { preferences: state.preferences, revision: state.revision }
    : undefined;
}
