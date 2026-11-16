import { z } from 'zod';
import {
  recipeListSchema,
  savedListSchema,
  preferencesSchema,
  discoveryContextSchema,
  recordIdSchema,
} from '@meal/contracts';
import type { GroceryStorage } from './offline-groceries';

function schemaFor(path: string): z.ZodType {
  if (path.startsWith('/recipes?') || path.startsWith('/saved-recipes?'))
    return recipeListSchema;
  if (path === '/saved') return savedListSchema;
  if (path === '/preferences')
    return z.object({
      preferences: preferencesSchema,
      revision: z.number().int().positive(),
    });
  if (path === '/discovery-context') return discoveryContextSchema;
  if (path === '/collections')
    return z.object({
      items: z.array(
        z.object({
          id: recordIdSchema,
          name: z.string(),
          revision: z.number().int().positive().optional(),
        }),
      ),
    });
  throw new Error('This request is not available in the offline library.');
}

export class LibraryCache {
  readonly fallback = new Set<string>();
  storageFailed = false;
  constructor(
    private storage: GroceryStorage,
    private owner: string,
    private remote: (path: string) => Promise<unknown>,
  ) {}
  private key(path: string) {
    return `meal-library-v1:${this.owner}:${path}`;
  }
  offline = async (path: string) => {
    const raw = await this.storage.getItem(this.key(path));
    if (!raw) throw new Error('Not saved on this device yet.');
    return schemaFor(path).parse(JSON.parse(raw));
  };
  read = async (path: string) => {
    let data: unknown;
    try {
      data = schemaFor(path).parse(await this.remote(path));
    } catch (error) {
      // Authentication/authorization and malformed responses must remain visible.
      const status =
        error && typeof error === 'object' && 'status' in error
          ? error.status
          : null;
      if (
        error instanceof z.ZodError ||
        (typeof status === 'number' && status < 500)
      )
        throw error;
      try {
        const cached = await this.offline(path);
        this.fallback.add(path);
        return cached;
      } catch {
        throw error;
      }
    }
    try {
      await this.storage.setItem(this.key(path), JSON.stringify(data));
    } catch {
      this.storageFailed = true;
    }
    return data;
  };
}
