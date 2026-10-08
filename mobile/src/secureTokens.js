// Broker tokens / API keys: iOS Keychain / Android Keystore only. Never sent to Supabase.
import * as SecureStore from 'expo-secure-store';

const K = (id) => `broker.${id}`;
export async function getToken(id) {
  const v = await SecureStore.getItemAsync(K(id));
  return v ? JSON.parse(v) : null;
}
export const setToken = (id, t) => SecureStore.setItemAsync(K(id), JSON.stringify(t));
export const clearToken = (id) => SecureStore.deleteItemAsync(K(id));

export async function getJSON(key, fallback) {
  const v = await SecureStore.getItemAsync(key);
  return v ? JSON.parse(v) : fallback;
}
export const setJSON = (key, v) => SecureStore.setItemAsync(key, JSON.stringify(v));
