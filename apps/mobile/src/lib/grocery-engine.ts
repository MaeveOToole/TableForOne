import { OfflineGroceries } from './offline-groceries';
import { localStore } from './local-store';
import { api, preview } from './api';
import { supabase } from './supabase';
const engines = new Map<string, OfflineGroceries>();
export function getGroceryEngine(owner: string, week: string) {
  const key = `${owner}:${week}`;
  const existing = engines.get(key);
  if (existing) return existing;
  const engine = new OfflineGroceries(
    localStore,
    async (...args) => {
      if (!preview) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user.id !== owner)
          throw new Error('Sign in to the same account to sync these edits.');
      }
      return api(args[0], args[1], args[2], args[3], owner);
    },
    owner,
    week,
  );
  engines.set(key, engine);
  return engine;
}
