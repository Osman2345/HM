import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const isWebServerRender = () => Platform.OS === 'web' && typeof window === 'undefined';
const authStorage = {
  getItem: (key: string) => (isWebServerRender() ? Promise.resolve(null) : AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) =>
    isWebServerRender() ? Promise.resolve() : AsyncStorage.setItem(key, value),
  removeItem: (key: string) => (isWebServerRender() ? Promise.resolve() : AsyncStorage.removeItem(key)),
};

// The local generated schema is intentionally loose while the database contract is being aligned
// with the live Supabase project; the runtime client still uses the same auth/session setup.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
}) as any;

export const initializeSupabaseAuth = (): (() => void) => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
      return;
    }

    void supabase.auth.stopAutoRefresh();
  });

  void supabase.auth.startAutoRefresh();

  return () => {
    subscription.remove();
    void supabase.auth.stopAutoRefresh();
  };
};
