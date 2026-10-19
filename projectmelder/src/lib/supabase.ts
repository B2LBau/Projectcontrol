import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isConfigured = SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;

export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'https://niet-ingesteld.supabase.co',
  isConfigured ? SUPABASE_ANON_KEY : 'niet-ingesteld',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Token alleen verversen als de app op de voorgrond staat (aanbeveling Supabase voor React Native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const MEDIA_BUCKET = 'media';
