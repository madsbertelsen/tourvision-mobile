import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cross-platform storage utility
 * Uses localStorage on web and AsyncStorage on native
 */

export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return await AsyncStorage.getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  },

  async clear(): Promise<void> {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.clear();
      return;
    }
    await AsyncStorage.clear();
  },
};
