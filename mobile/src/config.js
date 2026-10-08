// Public build settings only. Secrets (broker client secrets) live in Supabase secrets, never here.
export const BROKER_ENV = process.env.EXPO_PUBLIC_BROKER_ENV === 'production' ? 'production' : 'sandbox';
export const LIVE_ENABLED = process.env.EXPO_PUBLIC_LIVE_TRADING !== 'off';
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const ALPACA_CLIENT_ID = process.env.EXPO_PUBLIC_ALPACA_CLIENT_ID;
export const UPSTOX_CLIENT_ID = process.env.EXPO_PUBLIC_UPSTOX_CLIENT_ID;
export const DATA_URL = 'https://raw.githubusercontent.com/aromal-a/Quant-BETA-convulsions-/main/docs/data/';
export const MIN_ORDER_USD = 2;
