import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

/**
 * Supabase-client, of `null` als de app niet gekoppeld is (geen URL/sleutel in .env.local of EAS).
 * Zonder koppeling werkt de app zoals voorheen: alles alleen op dit toestel.
 */
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export const PHOTO_BUCKET = 'fotos';
