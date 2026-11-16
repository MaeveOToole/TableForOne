import { accountStorage } from './account-storage';
export const localStore = accountStorage({
  async getAllKeys() {
    return Object.keys(localStorage);
  },
  async getItem(key: string) {
    return localStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    localStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    localStorage.removeItem(key);
  },
});
