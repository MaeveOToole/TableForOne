import test from 'node:test';
import assert from 'node:assert/strict';
import { LibraryCache } from '../../mobile/src/lib/library-cache';
import originals from '../../../packages/contracts/src/launch-recipes.json';

test('recipe cache validates content, scopes private copies by owner, and labels offline fallback', async () => {
  const data = new Map<string, string>();
  const store = {
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
  const path = '/saved-recipes?limit=50&offset=0';
  const cache = new LibraryCache(store, 'account-a', async () => ({
    items: [originals[0]],
    nextOffset: null,
  }));
  await cache.read(path);
  const disconnected = new LibraryCache(store, 'account-a', async () => {
    throw new TypeError('Offline');
  });
  assert.equal(
    ((await disconnected.read(path)) as { items: unknown[] }).items.length,
    1,
  );
  assert.equal(disconnected.fallback.size, 1);
  const other = new LibraryCache(store, 'account-b', async () => {
    throw new TypeError('Offline');
  });
  await assert.rejects(other.read(path), /Offline/);
  const denied = new LibraryCache(store, 'account-a', async () => {
    throw Object.assign(new Error('Expired session'), { status: 401 });
  });
  await assert.rejects(denied.read(path), /Expired session/);
  const malformed = new LibraryCache(store, 'account-a', async () => ({
    items: [{ title: 'Incomplete' }],
  }));
  await assert.rejects(malformed.read(path));
  assert.equal(
    ((await disconnected.offline(path)) as { items: unknown[] }).items.length,
    1,
  );
});
