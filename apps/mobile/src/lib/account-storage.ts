type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
};
const ownerOf = (key: string) =>
  /^meal-(?:groceries|library|week-view|grocery-details-cap)-v1:([0-9a-f-]{36})(?::|$)/i.exec(
    key,
  )?.[1];

export function accountStorage(storage: Storage) {
  const tails = new Map<string, Promise<unknown>>();
  const marker = (owner: string) => `meal-deleted-owner-v1:${owner}`;
  function serial<T>(owner: string, run: () => Promise<T>): Promise<T> {
    const next = (tails.get(owner) || Promise.resolve())
      .catch(() => undefined)
      .then(run);
    tails.set(owner, next);
    return next;
  }
  return {
    getAllKeys: () => storage.getAllKeys(),
    removeItem: (key: string) => storage.removeItem(key),
    async getItem(key: string) {
      const owner = ownerOf(key);
      if (owner && (await storage.getItem(marker(owner)))) return null;
      return storage.getItem(key);
    },
    async setItem(key: string, value: string) {
      const owner = ownerOf(key);
      if (!owner) return storage.setItem(key, value);
      return serial(owner, async () => {
        if (await storage.getItem(marker(owner)))
          throw new Error('This account was deleted.');
        await storage.setItem(key, value);
        // Another browser tab may have deleted this account during the write.
        if (await storage.getItem(marker(owner))) await storage.removeItem(key);
      });
    },
    clearAccount(owner: string) {
      return serial(owner, async () => {
        await storage.setItem(marker(owner), 'deleted');
        const keys = await storage.getAllKeys();
        await Promise.all(
          keys
            .filter((key) => ownerOf(key) === owner)
            .map((key) => storage.removeItem(key)),
        );
      });
    },
  };
}
