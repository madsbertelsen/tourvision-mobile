import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// Custom storage adapter that uses SecureStore for auth tokens on native
// and AsyncStorage for other data
const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key)
      }
      return null
    }
    
    // Use SecureStore for auth tokens, AsyncStorage for other data
    if (key.includes('auth')) {
      return SecureStore.getItemAsync(key)
    }
    const value = await AsyncStorage.getItem(key)
    return value
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value)
      }
      return
    }
    
    // Use SecureStore for auth tokens, AsyncStorage for other data
    if (key.includes('auth')) {
      await SecureStore.setItemAsync(key, value)
    } else {
      await AsyncStorage.setItem(key, value)
    }
  },
  removeItem: async (key: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key)
      }
      return
    }
    
    // Use SecureStore for auth tokens, AsyncStorage for other data
    if (key.includes('auth')) {
      await SecureStore.deleteItemAsync(key)
    } else {
      await AsyncStorage.removeItem(key)
    }
  },
}

// Supabase client disabled - authentication is not being used
// export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
//   auth: {
//     storage: ExpoSecureStoreAdapter,
//     autoRefreshToken: true,
//     persistSession: true,
//     detectSessionInUrl: false,
//   },
// })

// Create a mock supabase object to prevent errors in other files
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  from: () => ({
    select: () => Promise.resolve({ data: [], error: null }),
    insert: () => Promise.resolve({ data: null, error: null }),
    update: () => Promise.resolve({ data: null, error: null }),
    delete: () => Promise.resolve({ data: null, error: null }),
  }),
}
