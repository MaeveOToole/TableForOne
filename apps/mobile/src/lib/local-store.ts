import Storage from 'expo-sqlite/kv-store';
import { accountStorage } from './account-storage';

export const localStore = accountStorage(Storage);
