import { test, expect, type Page } from '@playwright/test';
import { completePersonalRecipe } from '../../apps/api/src/personal-recipe-details';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  defaultPreferences,
  recipeSchema,
  planDocumentSchema,
  resourceSchemas,
  checkoutDocumentSchema,
  checkoutEditSchema,
  estimateCheckout,
  pricingRegion,
  regionalPriceReferences,
} from '../../packages/contracts/src/index';
import originals from '../../packages/contracts/src/launch-recipes.json';
const userId = '10000000-0000-4000-8000-000000000001';
const user = {
  id: userId,
  email: 'ui-test@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-10-27T00:00:00Z',
};
const rows = JSON.parse(
  readFileSync('supabase/import-personal-recipes.sql', 'utf8').match(
    /\$recipes\$([\s\S]*?)\$recipes\$/,
  )![1],
) as { entry: number; title: string; description: string; category: string }[];
const drafts = rows.map((row) => {
  const hex = createHash('md5')
    .update(userId + ':personal-pdf:' + row.entry)
    .digest('hex');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return recipeSchema.parse({
    id,
    owner_id: userId,
    title: row.title,
    description: row.description,
    category: row.category,
    cuisine: 'Not recorded',
    minutes: null,
    servings: null,
    difficulty: null,
    incomplete: true,
    ingredients: [],
    instructions: [],
    provenance: {
      source: 'Your ChatGPT recipe collection',
      url: null,
      permission: 'Private draft',
      method: 'generated',
    },
  });
});
async function prepare(
  page: Page,
  {
    signedIn = true,
    failProfile = false,
    failSave = false,
    failGrocery = false,
    completeDrafts = false,
    kitchen = false,
    checkoutReady = false,
    groceryDetails = false,
  } = {},
) {
  const plans = new Map<string, ReturnType<typeof planDocumentSchema.parse>>();
  const storedGroceryRows = new Map<
    string,
    ReturnType<typeof resourceSchemas.grocery_items.parse>
  >();
  const checkouts = new Map<
    string,
    ReturnType<typeof checkoutDocumentSchema.parse>
  >();
  const budgets = new Map<string, { revision: number; ceilingCents: number }>();
  const checkoutReceipts = new Map<
    string,
    { request: string; result: ReturnType<typeof checkoutDocumentSchema.parse> }
  >();
  const versions = new Map<
    string,
    ReturnType<typeof resourceSchemas.recipe_versions.parse>
  >();
  const pantryItems = new Map<
    string,
    ReturnType<typeof resourceSchemas.pantry_items.parse>
  >();
  const regularPurchases = new Map<
    string,
    ReturnType<typeof resourceSchemas.regular_purchases.parse>
  >();
  const ratings = new Map<string, { stars: number | null; revision: number }>();
  const saved = new Map(
    drafts.map((r) => [
      r.id,
      {
        recipe_id: r.id,
        created_at: '2026-10-27T00:00:00Z',
        revision: 1,
        collection_id: null as string | null,
        planned_week: null as string | null,
      },
    ]),
  );
  if (signedIn) {
    const now = Math.floor(Date.now() / 1000);
    const encode = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString('base64url');
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 3600 })}.test-signature`;
    await page.addInitScript(
      (session) =>
        localStorage.setItem('sb-ui-test-auth-token', JSON.stringify(session)),
      {
        access_token: token,
        refresh_token: 'test-only-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: now + 3600,
        user,
      },
    );
  }
  await page.route('https://ui-test.supabase.co/**', (route) =>
    route.fulfill({ json: user }),
  );
  await page.route('http://127.0.0.1:3199/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      pathname = url.pathname.replace('/v1', ''),
      method = request.method();
    const done = (json: unknown, status = 200) =>
      route.fulfill({
        status,
        json,
        headers: { 'access-control-allow-origin': '*' },
      });
    if (method === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,PUT,DELETE,POST',
          'access-control-allow-headers':
            'authorization,content-type,idempotency-key',
        },
      });
    if (pathname === '/account/deletion-status')
      return done({ available: false });
    if (pathname === '/recipes') {
      const offset = Number(url.searchParams.get('offset') || 0),
        limit = Number(url.searchParams.get('limit') || 50);
      return done({
        items: originals.slice(offset, offset + limit),
        nextOffset: offset + limit < originals.length ? offset + limit : null,
      });
    }
    if (pathname === '/preferences' && method === 'PUT')
      return done({
        revision: 2,
        preferences: request.postDataJSON().preferences,
      });
    if (pathname === '/preferences')
      return failProfile
        ? done({ error: { message: 'Profile temporarily unavailable.' } }, 503)
        : done({
            revision: 1,
            preferences: {
              ...defaultPreferences,
              onboardingCompleted: true,
              displayName: 'UI test',
            },
          });
    if (pathname === '/saved') return done({ items: [...saved.values()] });
    if (pathname === '/saved-recipes') {
      const all = [...drafts, ...originals].filter((r) => saved.has(r.id));
      const offset = Number(url.searchParams.get('offset') || 0);
      return done({
        items: all
          .slice(offset, offset + 50)
          .map((recipe) =>
            completeDrafts ? completePersonalRecipe(recipe) : recipe,
          ),
        nextOffset: offset + 50 < all.length ? offset + 50 : null,
      });
    }
    if (pathname === '/collections') return done({ items: [] });
    const groceryReview = pathname.match(/^\/grocery-lists\/([^/]+)\/items$/);
    if (groceryReview) {
      const offset = Number(url.searchParams.get('offset') || 0),
        limit = Number(url.searchParams.get('limit') || 50);
      const rows = [...storedGroceryRows.values()]
        .filter((item) => item.list_id === groceryReview[1])
        .sort((a, b) => a.id.localeCompare(b.id));
      return done({
        items: rows.slice(offset, offset + limit),
        nextOffset: offset + limit < rows.length ? offset + limit : null,
      });
    }
    if (pathname === '/grocery-details-status')
      return done({ available: groceryDetails });
    if (pathname === '/kitchen-status') return done({ available: kitchen });
    const kitchenItem = pathname.match(
      /^\/(pantry-items|regular-purchases)\/([^/]+)$/,
    );
    if (kitchenItem) {
      const body = request.postDataJSON();
      const common = {
        id: kitchenItem[2],
        user_id: userId,
        revision: body.revision + 1,
        created_at: '2026-11-03T12:00:00Z',
        updated_at: '2026-11-03T12:00:00Z',
      };
      if (kitchenItem[1] === 'pantry-items') {
        if (method === 'DELETE') {
          pantryItems.delete(kitchenItem[2]);
          return done({ deleted: true, id: kitchenItem[2] });
        }
        const item = resourceSchemas.pantry_items.parse({
          ...common,
          name: body.name,
          raw_text: body.name,
          quantity: body.quantity,
          unit: body.unit,
          use_soon: body.useSoon,
          staple: body.staple,
          notes: body.notes,
        });
        pantryItems.set(item.id, item);
        return done(item);
      }
      if (method === 'DELETE') {
        regularPurchases.delete(kitchenItem[2]);
        return done({ deleted: true, id: kitchenItem[2] });
      }
      const item = resourceSchemas.regular_purchases.parse({
        ...common,
        name: body.name,
        quantity: body.quantity,
        unit: body.unit,
        cadence_weeks: body.cadenceWeeks,
        enabled: body.enabled,
      });
      regularPurchases.set(item.id, item);
      return done(item);
    }
    const regularInclude = pathname.match(
      /^\/grocery-lists\/([^/]+)\/regular-purchases$/,
    );
    if (regularInclude) {
      const body = request.postDataJSON(),
        purchase = regularPurchases.get(body.purchaseId)!;
      const plan = [...plans.values()].find(
        (plan) => plan.groceries.id === regularInclude[1],
      )!;
      if (plan.groceries.revision !== body.revision)
        return done(
          { error: { message: 'List changed. Refresh and retry.' } },
          409,
        );
      const old = plan.groceries.items.find(
        (item) =>
          item.origin === 'regular' &&
          item.origins.some(
            (origin) => origin.regularPurchaseId === purchase.id,
          ),
      );
      plan.groceries.items = plan.groceries.items.filter(
        (item) => item.id !== old?.id,
      );
      if (body.included)
        plan.groceries.items.push(
          resourceSchemas.grocery_items.parse({
            id: old?.id || purchase.id,
            user_id: userId,
            revision: (old?.revision || 0) + 1,
            created_at: '2026-11-03T12:00:00Z',
            updated_at: '2026-11-03T12:00:00Z',
            list_id: plan.groceries.id,
            name: purchase.name,
            raw_text:
              `${purchase.quantity || ''} ${purchase.unit || ''} ${purchase.name}`.trim(),
            quantity: purchase.quantity,
            unit: purchase.unit,
            section: old?.section ?? null,
            notes: old?.notes ?? null,
            origin: 'regular',
            origin_key: null,
            origins: [{ regularPurchaseId: purchase.id }],
            checked: old?.checked || false,
            overridden: false,
            deleted: false,
          }),
        );
      if (!body.included && old)
        storedGroceryRows.set(old.id, { ...old, deleted: true });
      for (const item of plan.groceries.items)
        storedGroceryRows.set(item.id, item);
      plan.groceries.revision++;
      return done(plan);
    }
    const planLock = pathname.match(/^\/plans\/([^/]+)\/lock$/);
    if (planLock) {
      const body = request.postDataJSON(),
        plan = plans.get(planLock[1])!;
      const slot = plan.slots.find((slot) => slot.id === body.slotId)!;
      if (
        plan.revision !== body.revision ||
        slot.revision !== body.slotRevision
      )
        return done(
          { error: { message: 'Plan changed. Refresh and retry.' } },
          409,
        );
      slot.locked = body.locked;
      slot.revision++;
      plan.revision++;
      return done(plan);
    }
    if (pathname === '/resources/pantry_items')
      return done({ items: [...pantryItems.values()], nextOffset: null });
    if (pathname === '/resources/regular_purchases')
      return done({ items: [...regularPurchases.values()], nextOffset: null });
    if (pathname === '/resources/recipe_versions')
      return done({ items: [...versions.values()], nextOffset: null });
    if (pathname === '/recipe-versions') {
      const body = request.postDataJSON();
      const recipe = recipeSchema.parse(
        originals.find((recipe) => recipe.id === body.recipeId),
      );
      const hex = createHash('md5')
        .update(request.headers()['idempotency-key'])
        .digest('hex');
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      const version = resourceSchemas.recipe_versions.parse({
        id,
        user_id: userId,
        revision: 1,
        created_at: '2026-11-03T12:00:00Z',
        updated_at: '2026-11-03T12:00:00Z',
        recipe_id: recipe.id,
        snapshot: recipe,
        attribution: recipe.provenance,
        extraction_method: recipe.provenance.method,
        confidence: recipe.extraction_confidence,
        permissions: recipe.content_permissions,
        modifications: [],
      });
      versions.set(id, version);
      return done(version);
    }
    const ratingMatch = pathname.match(/^\/recipes\/([^/]+)\/rating$/);
    if (ratingMatch) {
      const current = ratings.get(ratingMatch[1]) || {
        stars: null,
        revision: 0,
      };
      if (method === 'GET') return done(current);
      const body = request.postDataJSON();
      if (body.revision !== current.revision)
        return done({ error: { message: 'Rating changed. Refresh.' } }, 409);
      const next = { stars: body.stars, revision: current.revision + 1 };
      ratings.set(ratingMatch[1], next);
      return done(next);
    }
    if (pathname === '/discovery-context')
      return done({ pantry: [], ratings: {}, cooked: {}, partial: false });
    if (pathname === '/resources/plans')
      return done({
        items: [...plans.values()].map((plan) => ({
          id: plan.id,
          week_start: plan.weekStart,
        })),
        nextOffset: null,
      });
    if (pathname.startsWith('/weekly-budgets/')) {
      const week = pathname.split('/').pop()!,
        current = budgets.get(week) || { revision: 0, ceilingCents: 15000 };
      if (method === 'GET') return done(current);
      const body = request.postDataJSON();
      if (body.revision !== current.revision)
        return done(
          { error: { message: 'Budget changed. Reload and retry.' } },
          409,
        );
      const result = {
        revision: current.revision + 1,
        ceilingCents: body.ceilingCents,
      };
      budgets.set(week, result);
      return done(result);
    }
    if (pathname.startsWith('/checkout/')) {
      const week = pathname.split('/').pop()!;
      const document =
        checkouts.get(week) ||
        checkoutDocumentSchema.parse({
          weekStart: week,
          revision: 0,
          actualCents: null,
          taxCents: null,
          feeCents: null,
          currency: 'USD',
        });
      if (method === 'PUT') {
        const body = checkoutEditSchema.parse(request.postDataJSON()),
          key = request.headers()['idempotency-key'];
        const receipt = checkoutReceipts.get(key);
        if (receipt)
          return receipt.request === JSON.stringify(body)
            ? done(receipt.result)
            : done({ error: { message: 'Operation key reused.' } }, 409);
        if (body.revision !== document.revision)
          return done(
            { error: { message: 'Spending changed. Reload and retry.' } },
            409,
          );
        const result = checkoutDocumentSchema.parse({
          ...document,
          ...body,
          revision: body.revision + 1,
        });
        checkouts.set(week, result);
        checkoutReceipts.set(key, { request: JSON.stringify(body), result });
        return done(result);
      }
      const plan = [...plans.values()].find((plan) => plan.weekStart === week),
        budgetCents = budgets.get(week)?.ceilingCents ?? 15000;
      return done({
        document,
        canSave: checkoutReady,
        region: pricingRegion,
        budgetCents,
        needsReview: plan?.groceryState === 'needs_review',
        estimate: estimateCheckout(
          plan?.groceries.items || [],
          regionalPriceReferences,
          {
            asOf: '2026-11-03',
            taxCents: document.taxCents,
            feeCents: document.feeCents,
            budgetCents,
          },
        ),
      });
    }
    const groceryPlan = pathname.match(/^\/plans\/([^/]+)$/);
    if (groceryPlan) {
      if (method === 'GET') return done(plans.get(groceryPlan[1]));
      const body = request.postDataJSON();
      const prior = plans.get(groceryPlan[1]);
      const items =
        prior?.groceries.items.filter(
          (item) => item.origin !== 'derived' || item.overridden,
        ) || [];
      for (const projection of body.groceries) {
        const old =
          prior?.groceries.items.find(
            (item) => item.origin_key === projection.originKey,
          ) ||
          [...storedGroceryRows.values()].find(
            (item) =>
              item.list_id === groceryPlan[1] &&
              item.origin_key === projection.originKey,
          );
        if (old?.overridden || old?.deleted) continue;
        const hex = createHash('md5')
          .update(groceryPlan[1] + projection.originKey)
          .digest('hex');
        const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
        items.push(
          resourceSchemas.grocery_items.parse({
            id,
            user_id: userId,
            revision: (old?.revision || 0) + 1,
            created_at: '2026-11-03T12:00:00Z',
            updated_at: '2026-11-03T12:00:00Z',
            list_id: groceryPlan[1],
            name: projection.name,
            raw_text: projection.rawText,
            quantity: projection.quantity,
            unit: projection.unit,
            section: old?.section ?? null,
            notes: old?.notes ?? null,
            origin: 'derived',
            origin_key: projection.originKey,
            origins: projection.origins,
            checked:
              old?.quantity === projection.quantity &&
              old?.unit === projection.unit
                ? old.checked
                : false,
            overridden: false,
            deleted: false,
          }),
        );
      }
      const document = planDocumentSchema.parse({
        id: groceryPlan[1],
        revision: (prior?.revision || 0) + 1,
        weekStart: body.weekStart,
        groceryState: 'ready',
        slots: body.slots.map(
          (slot: {
            id: string;
            day: string;
            meal: string;
            kind: string;
            recipeVersionId: string | null;
            preparedSlotId: string | null;
            servings: number | null;
            locked: boolean;
          }) => ({
            id: slot.id,
            user_id: userId,
            revision: 1,
            created_at: '2026-11-03T12:00:00Z',
            updated_at: '2026-11-03T12:00:00Z',
            plan_id: groceryPlan[1],
            day: slot.day,
            meal: slot.meal,
            kind: slot.kind,
            recipe_version_id: slot.recipeVersionId,
            prepared_slot_id: slot.preparedSlotId,
            servings: slot.servings,
            locked: slot.locked,
          }),
        ),
        groceries: {
          id: groceryPlan[1],
          revision: (prior?.groceries.revision || 0) + 1,
          state: 'ready',
          recoveryCode: null,
          items,
        },
        recovery: null,
      });
      plans.set(document.id, document);
      const projectionKeys = new Set(
        body.groceries.map((item: { originKey: string }) => item.originKey),
      );
      for (const [id, item] of storedGroceryRows)
        if (
          item.list_id === document.groceries.id &&
          item.origin === 'derived' &&
          !item.overridden &&
          !item.deleted &&
          !projectionKeys.has(item.origin_key)
        )
          storedGroceryRows.delete(id);
      for (const item of document.groceries.items)
        storedGroceryRows.set(item.id, item);
      return done(document);
    }
    const groceryItem = pathname.match(
      /^\/grocery-items\/([^/]+)(?:\/details)?$/,
    );
    if (groceryItem) {
      if (failGrocery)
        return done(
          {
            error: {
              message:
                'Groceries temporarily unavailable. Your text has been kept.',
            },
          },
          503,
        );
      const body = request.postDataJSON();
      const plan = [...plans.values()].find(
        (plan) => plan.groceries.id === body.listId,
      )!;
      const old = plan.groceries.items.find(
        (item) => item.id === groceryItem[1],
      );
      if ((old?.revision || 0) !== body.revision)
        return done(
          { error: { message: 'Item changed. Refresh and retry.' } },
          409,
        );
      const item = resourceSchemas.grocery_items.parse({
        id: groceryItem[1],
        user_id: userId,
        created_at: '2026-10-29T12:00:00Z',
        updated_at: '2026-10-29T12:00:00Z',
        revision: body.revision + 1,
        list_id: body.listId,
        name: body.name,
        raw_text: body.rawText,
        quantity: body.quantity,
        unit: body.unit,
        section:
          body.section === undefined ? (old?.section ?? null) : body.section,
        notes: body.notes === undefined ? (old?.notes ?? null) : body.notes,
        origin: old?.origin || 'manual',
        origin_key: old?.origin_key || null,
        origins: old?.origins || [],
        checked: body.checked,
        overridden:
          old?.overridden ||
          (!!old &&
            ['derived', 'regular'].includes(old.origin) &&
            (old.quantity !== body.quantity ||
              old.unit !== body.unit ||
              old.name !== body.name ||
              old.raw_text !== body.rawText)),
        deleted: body.deleted,
      });
      storedGroceryRows.set(item.id, item);
      plan.groceries.items = [
        ...plan.groceries.items.filter((existing) => existing.id !== item.id),
        ...(item.deleted ? [] : [item]),
      ];
      plan.groceries.revision++;
      return done({
        item,
        listRevision: plan.groceries.revision,
        state: 'ready',
      });
    }
    const organization = pathname.match(/^\/saved\/([^/]+)\/organization$/);
    if (organization) {
      const old = saved.get(organization[1]);
      if (!old) return done({ error: { message: 'Not saved' } }, 404);
      const body = request.postDataJSON();
      saved.set(organization[1], {
        ...old,
        revision: old.revision + 1,
        collection_id: body.collectionId,
        planned_week: body.plannedWeek,
      });
      return done(saved.get(organization[1]));
    }
    const save = pathname.match(/^\/saved\/([^/]+)$/);
    if (save) {
      // Match Fastify's body parser: an empty JSON mutation is rejected before the handler.
      if (
        request.headers()['content-type']?.includes('application/json') &&
        !request.postData()
      )
        return done(
          {
            error: {
              code: 'INVALID_INPUT',
              message: 'Request could not be completed.',
            },
          },
          400,
        );
      if (failSave)
        return done(
          { error: { message: 'Save temporarily unavailable.' } },
          503,
        );
      if (method === 'DELETE') saved.delete(save[1]);
      else
        saved.set(save[1], {
          recipe_id: save[1],
          created_at: '2026-10-27T00:00:00Z',
          revision: 1,
          collection_id: null,
          planned_week: null,
        });
      return route.fulfill({ status: 204 });
    }
    return done(
      { error: { message: 'Unexpected test endpoint: ' + pathname } },
      501,
    );
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Discover', exact: true }).click();
  if (completeDrafts)
    await expect(page.getByText(/^\d+ recipes$/)).toBeVisible();
  else
    await expect(page.getByText('12 recipes', { exact: true })).toBeVisible();
}

test('weekly options persist and Find a recipe respects the release scope', async ({
  page,
}, testInfo) => {
  await prepare(page);
  await page.getByRole('tab', { name: 'Week', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Breakfast', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Preview weekly plan', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '+ Saved', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search saved recipes' })
    .fill('Healthy Banana Pancakes');
  const add = page.getByRole('button', {
    name: 'Add to week: Healthy Banana Pancakes',
    exact: true,
  });
  await add.click();
  await expect(add).toBeDisabled();
  await page
    .getByRole('button', { name: 'Return to weekly planning', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Open weekly recipe Healthy Banana Pancakes',
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', {
      name: 'Open weekly recipe Healthy Banana Pancakes',
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: 'output/weekly-options-phone.png' });
  await page
    .getByRole('button', { name: 'Find a recipe', exact: true })
    .click();
  const core = testInfo.config.metadata.releaseScope === 'core';
  if (core) {
    await expect(
      page.getByRole('textbox', { name: 'Search recipes', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Recipe chat', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(/waiting for API setup/)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Recipe chat', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/^Choosing meals for week starting /),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Return to weekly planning', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Open weekly recipe Healthy Banana Pancakes',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Discover', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Recipe chat', exact: true }),
    ).toHaveCount(0);
  } else {
    await expect(
      page.getByRole('heading', { name: 'Recipe chat', exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole('tab', { name: 'Chat', exact: true }),
  ).toHaveCount(0);
});

test('clean navigation keeps profile and simple pantry inside Settings', async ({
  page,
}) => {
  await prepare(page, { kitchen: true });
  await expect(page.getByRole('tab')).toHaveCount(5);
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByText('Profile & preferences', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'output/settings-phone.png' });
  await expect(
    page.getByRole('textbox', { name: 'Name (optional)', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: '✎ Edit profile & preferences', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Name (optional)', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Done editing profile', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Pantry & regular purchases', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Kitchen item name', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Kitchen item unit', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: 'Kitchen item notes', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('checkbox', { name: 'Use soon', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Kitchen item name', exact: true })
    .fill('Rice');
  await page
    .getByRole('button', { name: 'Save kitchen item', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Edit pantry item: Rice', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'output/simple-pantry-phone.png' });
});

test('phone Discover exposes reachable recipe buttons and can save/remove a recipe', async ({
  page,
}) => {
  await prepare(page);
  const view = page
    .getByRole('button', { name: 'View recipe', exact: true })
    .first();
  await view.scrollIntoViewIfNeeded();
  await expect(view).toBeInViewport();
  await page
    .getByRole('button', {
      name: 'Save recipe: Lemon chickpea and spinach skillet',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Recipe saved to your account.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Saved', exact: true }).click();
  await expect(
    page.getByText('49 saved recipes', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search saved recipes' })
    .fill('Lemon chickpea and spinach skillet');
  await expect(
    page.getByText('1 saved recipes', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Remove saved recipe: Lemon chickpea and spinach skillet',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('0 saved recipes', { exact: true }),
  ).toBeVisible();
});
test('all 48 private drafts remain available when Profile fails and Discover filters do not leak into Saved', async ({
  page,
}) => {
  await prepare(page, { failProfile: true });
  await page
    .getByRole('textbox', { name: 'Search recipes', exact: true })
    .fill('no such recipe');
  await expect(page.getByText('0 recipes', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Saved', exact: true }).click();
  await expect(
    page.getByText('48 saved recipes', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search saved recipes' })
    .fill('Healthy Banana Pancakes');
  await expect(
    page.getByText('1 saved recipes', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'View recipe', exact: true }).click();
  await expect(
    page.getByText('Ingredients have not been added to this recipe yet.', {
      exact: true,
    }),
  ).toBeVisible();
});
test('save errors are visible on the page rather than lost in a browser alert', async ({
  page,
}) => {
  await prepare(page, { failSave: true });
  await page
    .getByRole('button', {
      name: 'Save recipe: Lemon chickpea and spinach skillet',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Save temporarily unavailable.', { exact: true }),
  ).toBeVisible();
});
test('marking a private draft for next week makes it visible in Week', async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole('tab', { name: 'Saved', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search saved recipes' })
    .fill('Healthy Banana Pancakes');
  await page
    .getByRole('button', {
      name: 'Organize recipe: Healthy Banana Pancakes',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Mark for next week', exact: true })
    .click();
  await expect(
    page.getByText('Recipe organization saved.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close recipe', exact: true }).click();
  await page.getByRole('tab', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'Open weekly recipe Healthy Banana Pancakes',
      exact: true,
    }),
  ).toBeVisible();
});
test('signed-out saving leads to sign-in with an explicit explanation', async ({
  page,
}) => {
  await prepare(page, { signedIn: false });
  await page
    .getByRole('button', {
      name: 'Save recipe: Lemon chickpea and spinach skillet',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Sign in to save recipes to your account.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible();
});

test('iPad recipe detail remains clickable beside the recipe list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1000 });
  await prepare(page);
  await page
    .getByRole('button', { name: 'View recipe', exact: true })
    .first()
    .click();
  const close = page.getByRole('button', { name: 'Close recipe', exact: true });
  await expect(close).toBeVisible();
  await close.click();
  await expect(close).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'View recipe', exact: true }).first(),
  ).toBeVisible();
});

test('compact filters collapse into removable chips and preserve recipe results', async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Show filters', exact: true }).click();
  await expect(page.getByText('Refine recipes', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Filter dinner', exact: true })
    .click();
  await expect(page.getByText('8 recipes', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Cuisine: Any cuisine', exact: true })
    .click();
  await page.getByRole('radio', { name: 'Italian', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Italian', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('3 recipes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText('Refine recipes', { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole('button', { name: 'Remove Dinner filter', exact: true })
    .click();
  await expect(page.getByText('4 recipes', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Remove Italian filter', exact: true })
    .click();
  await expect(page.getByText('12 recipes', { exact: true })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search recipes', exact: true })
    .fill('Lemon chickpea and spinach skillet');
  await expect(page.getByText('1 recipes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.getByText('12 recipes', { exact: true })).toBeVisible();
});

test('cooking mode follows recipe steps and checks off ingredients without changing the recipe', async ({
  page,
}) => {
  await prepare(page);
  await page
    .getByRole('button', { name: /^Organize recipe:/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: 'Start cooking', exact: true })
    .click();
  await expect(page.getByText('STEP 1 OF', { exact: false })).toBeVisible();
  const ingredient = page.getByRole('checkbox').first();
  await ingredient.click();
  await expect(ingredient).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.getByText('STEP 2 OF', { exact: false })).toBeVisible();
  await page
    .getByRole('button', { name: 'Previous step', exact: true })
    .click();
  await expect(page.getByText('STEP 1 OF', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Exit cooking', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Close recipe', exact: true }),
  ).toBeVisible();
});

test('meal filters show alphabetized recipe groups and recipe reading stays simple', async ({
  page,
}) => {
  await prepare(page);
  for (const [category, label] of [
    ['breakfast', 'Breakfast'],
    ['lunch', 'Lunch'],
    ['dinner', 'Dinner'],
    ['side', 'Sides'],
  ]) {
    await page
      .getByRole('button', { name: `Filter ${category}`, exact: true })
      .click();
    const expected = originals
      .filter((recipe) => recipe.category === category)
      .map((recipe) => `Open ${recipe.title}`)
      .sort((a, b) =>
        a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }),
      );
    if (expected.length)
      await expect(
        page.getByRole('heading', { name: label, exact: true }),
      ).toBeVisible();
    else
      await expect(
        page.getByText(
          'No matching recipes. Clear filters to see the full list.',
          { exact: true },
        ),
      ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(
      expected.length,
    );
    expect(
      await page
        .getByRole('button', { name: /^Open / })
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('aria-label')),
        ),
    ).toEqual(expected);
  }
  await page.getByRole('button', { name: 'All meals', exact: true }).click();
  const expectedGroups = ['breakfast', 'lunch', 'dinner', 'side'];
  const expectedTitles = expectedGroups.flatMap((category) =>
    originals
      .filter((recipe) => recipe.category === category)
      .map((recipe) => `Open ${recipe.title}`)
      .sort((a, b) =>
        a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }),
      ),
  );
  const seenTitles = new Set<string>();
  await expect
    .poll(async () => {
      const labels = await page
        .getByRole('button', { name: /^Open / })
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('aria-label')!),
        );
      labels.forEach((label) => seenTitles.add(label));
      await page.getByTestId('recipe-list').evaluate((node) => {
        node.scrollTop += 500;
      });
      return seenTitles.size;
    })
    .toBe(expectedTitles.length);
  expect([...seenTitles]).toEqual(expectedTitles);
  await page
    .getByRole('button', { name: 'Filter dinner', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Open Lemon chickpea and spinach skillet',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Lemon chickpea and spinach skillet',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('20 minutes', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ingredients', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Preparation', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start cooking', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('AI-generated sample recipe. Not kitchen-tested.', {
      exact: true,
    }),
  ).toHaveCount(0);
  const recipe = originals.find(
    (recipe) => recipe.title === 'Lemon chickpea and spinach skillet',
  )!;
  for (const ingredient of recipe.ingredients)
    await expect(page.getByText(ingredient.raw, { exact: true })).toBeVisible();
  for (const instruction of recipe.instructions)
    await expect(page.getByText(instruction, { exact: true })).toBeVisible();
});

test('weekly groceries support typed additions, checking, reload persistence, week isolation and removal', async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  const input = page.getByRole('textbox', {
    name: 'Grocery item',
    exact: true,
  });
  await expect(
    page.getByText('A fresh list for the week.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add grocery item', exact: true }),
  ).toBeDisabled();
  await input.fill('  6 eggs  ');
  await input.press('Enter');
  const eggs = page.getByRole('checkbox', { name: '6 Eggs', exact: true });
  await expect(eggs).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Dairy and eggs', exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue('');
  await input.fill('Paper towels');
  await page
    .getByRole('button', { name: 'Add grocery item', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: 'Paper towels', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Household', exact: true }),
  ).toBeVisible();
  await eggs.click();
  await expect(eggs).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('heading', { name: 'Checked off', exact: true }),
  ).toBeVisible();
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/weekly-groceries-phone.png' });
  await page.reload();
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  await expect(eggs).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await expect(
    page.getByText('A fresh list for the week.', { exact: true }),
  ).toBeVisible();
  await expect(eggs).toHaveCount(0);
  await input.fill('Milk');
  await input.press('Enter');
  await expect(
    page.getByRole('checkbox', { name: 'Milk', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Previous week', exact: true })
    .click();
  await expect(eggs).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('checkbox', { name: 'Milk', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Remove grocery item: 6 Eggs', exact: true })
    .click();
  await expect(eggs).toHaveCount(0);
  await expect(
    page.getByRole('checkbox', { name: 'Paper towels', exact: true }),
  ).toBeVisible();
});

test('failed grocery sync keeps the item locally and labels it pending', async ({
  page,
}) => {
  await prepare(page, { failGrocery: true });
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  await expect(
    page.getByText('A fresh list for the week.', { exact: true }),
  ).toBeVisible();
  const input = page.getByRole('textbox', {
    name: 'Grocery item',
    exact: true,
  });
  await input.fill('Milk');
  await input.press('Enter');
  await expect(
    page.getByText(
      'Groceries temporarily unavailable. Your text has been kept.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(
    page.getByRole('checkbox', { name: 'Milk', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Changes saved on this device. Waiting to sync.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Edit grocery item: Milk', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Quantity to buy: 1', exact: true })
    .click();
  await page.getByRole('radio', { name: '2', exact: true }).click();
  await page
    .getByRole('button', { name: 'Buy as: packages', exact: true })
    .click();
  await page.getByRole('radio', { name: 'bottles', exact: true }).click();
  await page
    .getByRole('button', { name: 'Save grocery changes', exact: true })
    .click();
  await expect(page.getByText('2 bottles', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Milk', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      '2 pending grocery edits. Kept on this device until synced.',
      { exact: true },
    ),
  ).toBeVisible();
});

test('cached groceries support offline check, addition and removal across reload, then reconnect once', async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  const input = page.getByRole('textbox', {
    name: 'Grocery item',
    exact: true,
  });
  await expect(input).toBeEditable();
  await input.fill('Milk');
  await input.press('Enter');
  await expect(
    page.getByText('All grocery changes synced.', { exact: true }),
  ).toBeVisible();
  let disconnected = true;
  await page.route('http://127.0.0.1:3199/**', (route) =>
    disconnected ? route.abort('internetdisconnected') : route.fallback(),
  );
  await page.getByRole('checkbox', { name: 'Milk', exact: true }).click();
  await expect(
    page.getByText('Changes saved on this device. Waiting to sync.', {
      exact: true,
    }),
  ).toBeVisible();
  await input.fill('Bread');
  await input.press('Enter');
  await expect(
    page.getByRole('checkbox', { name: 'Bread', exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Milk', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByText('Changes saved on this device. Waiting to sync.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Remove grocery item: Bread', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: 'Bread', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Changes saved on this device. Waiting to sync.', {
      exact: true,
    }),
  ).toBeVisible();
  disconnected = false;
  await page
    .getByRole('button', { name: 'Refresh grocery list', exact: true })
    .click();
  await expect(
    page.getByText('All grocery changes synced.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  await expect(
    page.getByText('All grocery changes synced.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Milk', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('checkbox', { name: 'Bread', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: 'output/offline-groceries-reconnected.png' });
});

test('public and personal recipes use kitchen measures without gram amounts', async ({
  page,
}) => {
  await prepare(page, { completeDrafts: true });
  await page
    .getByRole('textbox', { name: 'Search recipes', exact: true })
    .fill('Lemon chickpea and spinach skillet');
  await page.getByRole('button', { name: 'View recipe', exact: true }).click();
  await expect(
    page.getByText('3 1/2 cups loosely packed spinach, washed', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('1 can chickpeas (15-ounce can), drained and rinsed', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/\b\d+\s*g\b/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close recipe', exact: true }).click();
  await page.getByRole('button', { name: /^Organize recipe:/ }).click();
  await page
    .getByRole('button', { name: 'Start cooking', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', {
      name: '3 1/2 cups loosely packed spinach, washed',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/\b\d+\s*g\b/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Exit cooking', exact: true }).click();
  await page.getByRole('button', { name: 'Close recipe', exact: true }).click();
  await page.getByRole('tab', { name: 'Saved', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search saved recipes', exact: true })
    .fill('Crispy Garlic Parmesan Chicken Tenders');
  await page.getByRole('button', { name: 'View recipe', exact: true }).click();
  await expect(
    page.getByText('5 raw chicken tenderloins', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/\b\d+\s*g\b/)).toHaveCount(0);
});

test('completed personal recipes show estimated time, appliances, ingredients and preparation', async ({
  page,
}) => {
  await prepare(page, { completeDrafts: true });
  await page.getByRole('tab', { name: 'Saved', exact: true }).click();
  await expect(
    page.getByText('48 saved recipes', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search saved recipes', exact: true })
    .fill('Healthy Banana Pancakes');
  await page.getByRole('button', { name: 'View recipe', exact: true }).click();
  await expect(
    page.getByText('15 minutes total (estimated)', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Appliances needed', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Stovetop', { exact: true })).toBeVisible();
  await expect(page.getByText('1 ripe banana', { exact: true })).toBeVisible();
  await expect(
    page.getByText('3 tbsp rolled oats', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Preparation', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/AI-drafted from your recipe notes/),
  ).toBeVisible();
  await page.screenshot({ path: 'output/completed-personal-recipe-phone.png' });
});

test('saved recipe ingredients and steps remain readable after reloading without the API', async ({
  page,
}) => {
  await prepare(page, { completeDrafts: true });
  await page.route('http://127.0.0.1:3199/**', (route) =>
    route.abort('internetdisconnected'),
  );
  await page.reload();
  await page.getByRole('tab', { name: 'Saved', exact: true }).click();
  await expect(
    page.getByText('48 saved recipes', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search saved recipes', exact: true })
    .fill('Healthy Banana Pancakes');
  await page.getByRole('button', { name: 'View recipe', exact: true }).click();
  await expect(page.getByText('1 ripe banana', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Preparation', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Offline recipe copies shown. Changes require a connection.',
      { exact: true },
    ),
  ).toBeVisible();
});

test('weekly meal ingredients build groceries once and preserve manual purchases', async ({
  page,
}) => {
  await prepare(page, { completeDrafts: true });
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Grocery item', exact: true })
    .fill('Paper towels');
  await page
    .getByRole('button', { name: 'Add grocery item', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: 'Paper towels', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: '+ Saved', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search saved recipes' })
    .fill('Healthy Banana Pancakes');
  await page
    .getByRole('button', {
      name: 'Add to week: Healthy Banana Pancakes',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Return to weekly planning', exact: true })
    .click();
  const build = page.getByRole('button', {
    name: 'Add ingredients to Grocery List',
    exact: true,
  });
  await build.click();
  await expect(
    page.getByText(/^Ingredients added to Grocery List/),
  ).toBeVisible();
  await build.click();
  await expect(
    page.getByText('Your ingredients are already on Grocery List.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Paper towels', exact: true }),
  ).toBeVisible();
  expect(await page.getByRole('checkbox').count()).toBeGreaterThan(1);
  await expect(
    page.getByRole('checkbox', { name: /\b(?:tbsp|tsp|cups?)\b/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('checkbox', { name: /^(?:hot |cold )?water$/i }),
  ).toHaveCount(0);
  await page.screenshot({ path: 'output/weekly-options-groceries.png' });
});

test('kitchen keeps unknown pantry amounts and reusable purchases are selected independently by week', async ({
  page,
}) => {
  await prepare(page, { kitchen: true });
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('button', { name: 'Pantry & regular purchases', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Kitchen item name', exact: true })
    .fill('Spinach');
  await page
    .getByRole('button', { name: 'Save kitchen item', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Edit pantry item: Spinach',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Add regular purchase', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Kitchen item name', exact: true })
    .fill('Milk');
  await page
    .getByRole('textbox', { name: 'Kitchen item quantity', exact: true })
    .fill('2');
  await page
    .getByRole('textbox', {
      name: 'Regular purchase cadence in weeks',
      exact: true,
    })
    .fill('2');
  await page
    .getByRole('button', { name: 'Save kitchen item', exact: true })
    .click();
  await expect(
    page.getByText(
      'Kitchen saved. Weekly groceries and inventory are separate.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  const include = page.getByRole('checkbox', {
    name: 'Include regular purchase: Milk',
    exact: true,
  });
  await expect(include).toHaveAttribute('aria-checked', 'false');
  await include.click();
  await expect(include).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('checkbox', { name: 'Milk', exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await expect(include).toHaveAttribute('aria-checked', 'false');
  await page
    .getByRole('button', { name: 'Previous week', exact: true })
    .click();
  await expect(include).toHaveAttribute('aria-checked', 'true');
  await include.click();
  await expect(include).toHaveAttribute('aria-checked', 'false');
  await expect(
    page.getByRole('checkbox', { name: 'Milk', exact: true }),
  ).toHaveCount(0);
  await include.click();
  await expect(
    page.getByRole('checkbox', { name: 'Milk', exact: true }),
  ).toHaveCount(1);
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('button', { name: 'Remove regular purchase: Milk', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Edit regular purchase: Milk',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Milk', exact: true }),
  ).toHaveCount(1);
  await expect(include).toHaveCount(0);
  await page.screenshot({ path: 'output/kitchen-regular-shopping.png' });
});

test('budget confirms a successful save and collapses, with weekly spending removed', async ({
  page,
}) => {
  await prepare(page, { checkoutReady: true });
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  await expect(page.getByText('Weekly spending', { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole('button', { name: 'Edit weekly grocery budget', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Weekly grocery ceiling in USD' })
    .fill('125');
  await page
    .getByRole('button', { name: 'Save this week', exact: true })
    .click();
  await expect(
    page.getByText('\u2713 Budget saved', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Weekly grocery ceiling in USD' }),
  ).toHaveCount(0);
  await expect(page.getByText('$125 this week', { exact: true })).toBeVisible();
});

test('grocery notes and section overrides persist offline, survive checkmarks and clear back to suggested groups', async ({
  page,
}) => {
  await prepare(page, { groceryDetails: true });
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  const input = page.getByRole('textbox', {
    name: 'Grocery item',
    exact: true,
  });
  await expect(input).toBeEditable();
  await input.fill('Milk');
  await input.press('Enter');
  const notesButton = page.getByRole('button', {
    name: 'Edit notes and section: Milk',
    exact: true,
  });
  await notesButton.click();
  await page
    .getByRole('button', { name: /^Grocery shopping section:/ })
    .click();
  await expect(
    page.getByRole('textbox', {
      name: 'Grocery shopping section',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('radio', { name: 'Frozen', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Grocery notes', exact: true })
    .fill('Unsweetened');
  await page
    .getByRole('button', {
      name: 'Save grocery notes and section',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Grocery notes', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Frozen', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Unsweetened', { exact: true })).toBeVisible();
  const milk = page.getByRole('checkbox', { name: 'Milk', exact: true });
  await milk.click();
  await expect(milk).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Unsweetened', { exact: true })).toBeVisible();
  let offline = true;
  await page.route('http://127.0.0.1:3199/**', (route) =>
    offline ? route.abort('internetdisconnected') : route.fallback(),
  );
  await notesButton.click();
  await page
    .getByRole('button', { name: /^Grocery shopping section:/ })
    .click();
  await expect(
    page.getByRole('textbox', {
      name: 'Grocery shopping section',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('radio', { name: 'Produce', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Grocery notes', exact: true })
    .fill('Choose unsweetened');
  await page
    .getByRole('button', {
      name: 'Save grocery notes and section',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Changes saved on this device. Waiting to sync.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  await expect(
    page.getByText('Choose unsweetened', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Changes saved on this device. Waiting to sync.', {
      exact: true,
    }),
  ).toBeVisible();
  await milk.click();
  await expect(milk).toHaveAttribute('aria-checked', 'false');
  await expect(
    page.getByRole('heading', { name: 'Produce', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Changes saved on this device. Waiting to sync.', {
      exact: true,
    }),
  ).toBeVisible();
  offline = false;
  await page
    .getByRole('button', { name: 'Refresh grocery list', exact: true })
    .click();
  await expect(
    page.getByText('All grocery changes synced.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  await expect(
    page.getByText('All grocery changes synced.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Choose unsweetened', { exact: true }),
  ).toBeVisible();
  await expect(milk).toHaveAttribute('aria-checked', 'false');
  await notesButton.click();
  await page
    .getByRole('button', { name: /^Grocery shopping section:/ })
    .click();
  await expect(
    page.getByRole('textbox', {
      name: 'Grocery shopping section',
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole('radio', { name: 'Automatic (suggested section)', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Grocery notes', exact: true })
    .fill('');
  await page
    .getByRole('button', {
      name: 'Save grocery notes and section',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Grocery notes', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Dairy and eggs', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Choose unsweetened', { exact: true }),
  ).toHaveCount(0);
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/grocery-notes-sections.png' });
});

test('removing a weekly option keeps the recipe in Saved', async ({ page }) => {
  await prepare(page);
  await page.getByRole('tab', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: '+ Saved', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search saved recipes' })
    .fill('Healthy Banana Pancakes');
  await page
    .getByRole('button', {
      name: 'Add to week: Healthy Banana Pancakes',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Return to weekly planning', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Remove from week: Healthy Banana Pancakes',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Open weekly recipe Healthy Banana Pancakes',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('tab', { name: 'Saved', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search saved recipes' })
    .fill('Healthy Banana Pancakes');
  await expect(
    page.getByRole('button', {
      name: 'Open Healthy Banana Pancakes',
      exact: true,
    }),
  ).toBeVisible();
});

test('weekly picks keep the selected future week when browsing Discover', async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole('tab', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await page.getByRole('button', { name: '+ Discover', exact: true }).click();
  const add = page.getByRole('button', { name: /^Add to week:/ }).first();
  const title = (await add.getAttribute('aria-label'))!.replace(
    'Add to week: ',
    '',
  );
  await add.click();
  await expect(add).toBeDisabled();
  await expect(add).toHaveText('Added to week');
  await page
    .getByRole('button', { name: 'Return to weekly planning', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: `Open weekly recipe ${title}`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Previous week', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: `Open weekly recipe ${title}`,
      exact: true,
    }),
  ).toHaveCount(0);
});

test('account deletion requires confirmation, keeps the account on failure and clears only its device caches after success', async ({
  page,
}) => {
  await prepare(page);
  let attempts = 0;
  let fail = true;
  await page.route(
    'http://127.0.0.1:3199/v1/account/deletion-status',
    (route) => route.fulfill({ json: { available: true } }),
  );
  await page.route('http://127.0.0.1:3199/v1/account', (route) => {
    attempts++;
    expect(route.request().method()).toBe('DELETE');
    expect(route.request().postDataJSON()).toEqual({ confirmation: 'DELETE' });
    return fail
      ? route.fulfill({
          status: 503,
          json: { error: { message: 'Deletion temporarily unavailable.' } },
        })
      : route.fulfill({ json: { deleted: true } });
  });
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('button', { name: 'Delete my account', exact: true })
    .click();
  const final = page.getByRole('button', {
    name: 'Permanently delete account',
    exact: true,
  });
  await expect(final).toBeDisabled();
  await page
    .getByRole('button', { name: 'Keep my account', exact: true })
    .click();
  expect(attempts).toBe(0);
  await page
    .getByRole('button', { name: 'Delete my account', exact: true })
    .click();
  await page
    .getByRole('checkbox', {
      name: 'I understand account deletion is permanent',
      exact: true,
    })
    .click();
  await final.click();
  await expect(
    page.getByText('Deletion temporarily unavailable.', { exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(1);
  const ownKey = `meal-groceries-v1:${userId}:deletion-test`;
  const otherKey =
    'meal-groceries-v1:10000000-0000-4000-8000-000000000002:deletion-test';
  await page.evaluate(
    ({ ownKey, otherKey }) => {
      localStorage.setItem(ownKey, 'erase');
      localStorage.setItem(otherKey, 'keep');
    },
    { ownKey, otherKey },
  );
  fail = false;
  await final.click();
  await expect(
    page.getByText(
      'Your account and its active server data were deleted. Cached account data on this device was cleared.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(attempts).toBe(2);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), ownKey),
  ).toBeNull();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), otherKey),
  ).toBe('keep');
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'output/account-deletion-complete.png' });
});

test('rate a cooked recipe out of five stars and retain the rating after reopening', async ({
  page,
}) => {
  await prepare(page);
  await page
    .getByRole('button', { name: 'View recipe', exact: true })
    .first()
    .click();
  const stars = page.getByRole('button', {
    name: 'Rate 4 out of 5 stars',
    exact: true,
  });
  await expect(stars).toBeEnabled();
  await stars.click();
  await expect(
    page.getByText('Rated 4 out of 5. Saved.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close recipe', exact: true }).click();
  await page
    .getByRole('button', { name: 'View recipe', exact: true })
    .first()
    .click();
  await expect(stars).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: 'Rate 5 out of 5 stars', exact: true })
    .click();
  await expect(
    page.getByText('Rated 5 out of 5. Saved.', { exact: true }),
  ).toBeVisible();
});

test('profile save visibly confirms success and closes the profile editor', async ({
  page,
}) => {
  await prepare(page);
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('button', { name: /Edit profile & preferences/ })
    .click();
  const name = page.getByRole('textbox', {
    name: 'Name (optional)',
    exact: true,
  });
  await name.fill('Maeve');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByText('\u2713 Profile & preferences saved', { exact: true }),
  ).toBeVisible();
  await expect(name).toHaveCount(0);
});

test('manual grocery names are capitalized and edit actions have clear labels', async ({
  page,
}) => {
  await prepare(page, { groceryDetails: true });
  await page.getByRole('tab', { name: 'Groceries', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Grocery item', exact: true })
    .fill('bananas');
  await page
    .getByRole('button', { name: 'Add grocery item', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: 'Bananas', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Edit grocery item: Bananas',
      exact: true,
    }),
  ).toHaveText('Qty / name');
  await expect(
    page.getByRole('button', {
      name: 'Edit notes and section: Bananas',
      exact: true,
    }),
  ).toHaveText('Notes / aisle');
  await page.screenshot({ path: 'output/grocery-feedback-phone.png' });
});
