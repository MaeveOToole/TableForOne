import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import {
  checkoutDocumentSchema,
  estimateCheckout,
  regionalPriceReferences,
  type PriceReference,
} from '@meal/contracts';
import { buildApp } from '../src/app.js';
const owner = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
const options = {
  asOf: '2026-11-03',
  taxCents: 0,
  feeCents: 0,
  budgetCents: 15000,
};
const item = {
  id: 'one',
  name: 'ground beef',
  quantity: 1,
  unit: 'lb',
  deleted: false,
};
test('regional reference estimates preserve unknown prices, package sizes, units and stale observations', () => {
  const result = estimateCheckout(
    [item, { ...item, id: 'unknown', name: 'paper towels' }],
    regionalPriceReferences,
    options,
  );
  assert.equal(result.subtotalCents, 702);
  assert.equal(result.missingCount, 1);
  assert.equal(result.packageUnknownCount, 1);
  assert.equal(result.complete, false);
  assert.equal(result.totalCents, null);
  assert.equal(result.lines[0].reference!.region, 'Northeast US');
  assert.equal(
    estimateCheckout(
      [{ ...item, unit: 'cup' }],
      regionalPriceReferences,
      options,
    ).subtotalCents,
    null,
  );
  assert.equal(
    estimateCheckout(
      [{ ...item, quantity: null }],
      regionalPriceReferences,
      options,
    ).subtotalCents,
    null,
  );
  assert.equal(
    estimateCheckout([item], regionalPriceReferences, {
      ...options,
      asOf: '2027-03-01',
    }).subtotalCents,
    null,
  );
  assert.equal(
    estimateCheckout(
      [{ ...item, name: 'canned tomatoes' }],
      regionalPriceReferences,
      options,
    ).subtotalCents,
    null,
  );
  assert.equal(
    estimateCheckout(
      [{ ...item, deleted: true }],
      regionalPriceReferences,
      options,
    ).lines.length,
    0,
  );
});
test('package checkout rounds up while incomplete $130 totals never claim a complete estimate', () => {
  const reference: PriceReference = {
    ...regionalPriceReferences[0],
    basis: 'package',
    quantity: 1,
    unit: 'lb',
    priceCents: 6500,
  };
  const complete = estimateCheckout([{ ...item, quantity: 1.5 }], [reference], {
    ...options,
    taxCents: 100,
    feeCents: 200,
  });
  assert.equal(complete.subtotalCents, 13000);
  assert.equal(complete.totalCents, 13300);
  assert.equal(complete.complete, true);
  const incomplete = estimateCheckout(
    [
      { ...item, quantity: 1.5 },
      { ...item, id: 'missing', name: 'snacks' },
    ],
    [reference],
    { ...options, taxCents: null },
  );
  assert.equal(incomplete.subtotalCents, 13000);
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.totalCents, null);
  assert.equal(incomplete.taxUnknown, true);
});
test('weekly actual totals are nullable, isolated, idempotent and revision checked without changing budgets', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
    const dir = new URL('../../../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(dir))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await db.exec(await readFile(new URL(file, dir), 'utf8'));
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [
      owner,
      'a@example.test',
      other,
      'b@example.test',
    ]);
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false)`,
    );
    const read = async (week: string) =>
      checkoutDocumentSchema.parse(
        (
          await db.query<{ result: unknown }>(
            'select public.checkout_document($1) as result',
            [week],
          )
        ).rows[0].result,
      );
    const write = async (key: string, revision: number, payload: unknown) =>
      checkoutDocumentSchema.parse(
        (
          await db.query<{ result: unknown }>(
            'select public.apply_checkout_mutation($1,$2,$3,$4) as result',
            [key, '2026-11-02', revision, JSON.stringify(payload)],
          )
        ).rows[0].result,
      );
    assert.equal((await read('2026-11-02')).actualCents, null);
    const payload = { actualCents: 0, taxCents: null, feeCents: null };
    const first = await write('checkout-save-001', 0, payload);
    assert.equal(first.actualCents, 0);
    assert.deepEqual(await write('checkout-save-001', 0, payload), first);
    await assert.rejects(
      write('checkout-stale-001', 0, payload),
      /Revision conflict/,
    );
    await assert.rejects(
      write('checkout-save-001', 0, { ...payload, actualCents: 11200 }),
      /Idempotency conflict/,
    );
    const second = await write('checkout-save-002', first.revision, {
      actualCents: 11200,
      taxCents: 500,
      feeCents: 200,
    });
    assert.equal(second.actualCents, 11200);
    assert.equal((await read('2026-11-09')).actualCents, null);
    assert.equal(
      (await db.query('select * from public.weekly_budgets')).rows.length,
      0,
    );
    await assert.rejects(
      write('checkout-invalid-001', second.revision, {
        ...payload,
        actualCents: -1,
      }),
      /check constraint/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${other}',false)`,
    );
    assert.equal((await read('2026-11-02')).actualCents, null);
    assert.equal(
      (await db.query('select * from public.weekly_checkouts')).rows.length,
      0,
    );
    await db.exec(`set role anon`);
    await assert.rejects(
      db.query('select public.checkout_document($1)', ['2026-11-02']),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test('checkout API rejects anonymous reads and writes before database work', async () => {
  const app = buildApp(
    {
      url: 'https://example.supabase.co',
      key: 'public-test-key',
      environment: 'development',
      logLevel: 'silent',
    },
    () => {
      throw new Error('No database access');
    },
  );
  try {
    for (const method of ['GET', 'PUT'] as const)
      assert.equal(
        (await app.inject({ method, url: '/v1/checkout/2026-11-02' }))
          .statusCode,
        401,
      );
  } finally {
    await app.close();
  }
});
