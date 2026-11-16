import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
// Split large sessions to respect SecureStore's per-value size constraints.
const storage = {
  async getItem(key: string) {
    const count = Number((await SecureStore.getItemAsync(key + '.count')) ?? 0);
    if (!count) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.getItemAsync(key + '.' + i),
      ),
    );
    return chunks.some((chunk) => chunk === null) ? null : chunks.join('');
  },
  async setItem(key: string, value: string) {
    await storage.removeItem(key);
    const chunks = value.match(/[\s\S]{1,500}/g) ?? [];
    for (let i = 0; i < chunks.length; i++)
      await SecureStore.setItemAsync(key + '.' + i, chunks[i]);
    await SecureStore.setItemAsync(key + '.count', String(chunks.length));
  },
  async removeItem(key: string) {
    const count = Number((await SecureStore.getItemAsync(key + '.count')) ?? 0);
    await SecureStore.deleteItemAsync(key + '.count');
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.deleteItemAsync(key + '.' + i),
      ),
    );
  },
};
export const supabase = createClient(
  url || 'https://unconfigured.supabase.co',
  key || 'unconfigured',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : storage,
      autoRefreshToken: true,
      // Web uses Supabase's localStorage adapter; native uses SecureStore above.
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
// Supabase manages browser visibility and token refresh itself.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
