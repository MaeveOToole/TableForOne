import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { recipeSchema } from '@meal/contracts';
import { loadLibrary } from '../../mobile/src/lib/load-library';
import { withDeadline } from '../../mobile/src/lib/deadline';

const recipe = recipeSchema.parse({
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Private draft',
  description: 'Original notes',
  cuisine: 'Not recorded',
  minutes: null,
  servings: null,
  difficulty: null,
  incomplete: true,
  ingredients: [],
  instructions: [],
  provenance: {
    source: 'Your collection',
    url: null,
    permission: 'Personal',
    method: 'generated',
  },
});
test('profile and recommendation failures do not hide a loaded catalog or private saved drafts', async () => {
  const read = async (path: string) => {
    if (path.startsWith('/recipes?')) return { items: [], nextOffset: null };
    if (path.startsWith('/saved-recipes?'))
      return { items: [recipe], nextOffset: null };
    if (path === '/saved')
      return {
        items: [{ recipe_id: recipe.id, created_at: '2026-10-27T00:00:00Z' }],
      };
    throw new Error('Service unavailable');
  };
  const result = await loadLibrary(read, true);
  assert.equal(result.recipes[0].id, recipe.id);
  assert.equal(result.saves?.length, 1);
  assert.equal(result.profile, undefined);
  assert.ok(result.errors.some((e) => e.startsWith('Profile:')));
  assert.ok(result.errors.some((e) => e.startsWith('Recommendations:')));
});
test('repeated pagination terminates with a recoverable error rather than an endless loading state', async () => {
  const result = await loadLibrary(
    async () => ({ items: [], nextOffset: 0 }),
    false,
  );
  assert.ok(result.errors[0].includes('repeated page'));
});
test('session deadline rejects a stalled authentication check', async () => {
  await assert.rejects(
    withDeadline(new Promise<never>(() => {}), 5, 'Session timed out'),
    /Session timed out/,
  );
  assert.equal(await withDeadline(Promise.resolve(3), 100, 'timeout'), 3);
});
test('the personal import restores all 48 drafts once, preserves missing details and stays private', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
    );
    await db.exec(
      await readFile(
        new URL(
          '../../../supabase/migrations/202610260001_foundation.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.exec(
      await readFile(
        new URL('../../../supabase/upgrade-milestone-one.sql', import.meta.url),
        'utf8',
      ),
    );
    await db.exec(
      `insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','test@example.test');`,
    );
    const sql = await readFile(
      new URL('../../../supabase/import-personal-recipes.sql', import.meta.url),
      'utf8',
    );
    await db.exec(sql);
    await db.exec(sql);
    const count = await db.query<{ drafts: number; saves: number }>(
      `select (select count(*)::integer from public.recipes where owner_id is not null and incomplete and minutes is null and servings is null) as drafts,(select count(*)::integer from public.saved_recipes) as saves`,
    );
    assert.equal(count.rows[0].drafts, 48);
    assert.equal(count.rows[0].saves, 48);
    const imported = await db.query(
      'select * from public.recipes where owner_id is not null',
    );
    for (const row of imported.rows)
      assert.doesNotThrow(
        () => recipeSchema.parse(row),
        'every imported PostgreSQL ID must survive the API contract',
      );
    await db.exec('set role anon;');
    assert.equal(
      (
        await db.query(
          'select * from public.recipes where owner_id is not null',
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
