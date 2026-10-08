import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const configured = !!url && !!anonKey;

// Session lives only in the iOS Keychain / Android Keystore. SecureStore warns above ~2 KB, so split into chunks.
const CHUNK = 1800;
const SecureChunkStore = {
  async getItem(key) {
    const n = await SecureStore.getItemAsync(`${key}.n`);
    if (!n) return null;
    let out = '';
    for (let i = 0; i < +n; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part == null) return null;
      out += part;
    }
    return out;
  },
  async setItem(key, value) {
    await SecureChunkStore.removeItem(key);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${key}.n`, String(n));
  },
  async removeItem(key) {
    const n = await SecureStore.getItemAsync(`${key}.n`);
    if (n) for (let i = 0; i < +n; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

export const supabase = createClient(url || 'https://missing.supabase.co', anonKey || 'missing', {
  auth: {
    storage: Platform.OS === 'web' ? undefined : SecureChunkStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export const authRedirect = () => Linking.createURL('auth-callback');

// Handles email-confirm, password-reset and Google links: quantbeam://auth-callback?code=...
const usedCodes = new Set();
export async function handleAuthUrl(link) {
  if (!link || !link.includes('auth-callback')) return;
  const { queryParams } = Linking.parse(link);
  if (queryParams?.error_description) throw new Error(String(queryParams.error_description));
  const code = queryParams?.code;
  if (!code || usedCodes.has(code)) return;
  usedCodes.add(code);
  const { error } = await supabase.auth.exchangeCodeForSession(String(code));
  if (error) throw error;
}
