import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_ANON_KEY in .env');
export const makeClient = (storage) =>
  createClient(url, key, { auth: { persistSession: !!storage, storage, autoRefreshToken: false } });
export const supabase = makeClient();
export async function linkBroker(broker, maskedLabel, mode = 'paper') {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('broker_links')
    .upsert({ user_id: user.id, broker, mode, label: maskedLabel, revoked_at: null }, { onConflict: 'user_id,broker' })
    .select().single();
  if (error) throw error;
  return data;
}
export async function placeTrade({ brokerLinkId, symbol, side, qty, price, brokerOrderId = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('trades')
    .insert({ user_id: user.id, broker_link_id: brokerLinkId, symbol, side, qty, price, broker_order_id: brokerOrderId })
    .select('id, session_id, placed_at').single();
  if (error) throw error;
  return data;
}
export async function endSession() {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('trading_sessions').update({ ended_at: new Date().toISOString() })
    .eq('user_id', user.id).is('ended_at', null);
}
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  await supabase.from('sign_in_events').insert({ user_id: data.user.id, provider: 'email', platform: 'web', is_new_user: true });
  return data.user;
}
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await supabase.from('sign_in_events').insert({ user_id: data.user.id, provider: 'email', platform: 'web', is_new_user: false });
  return data.user;
}
export async function myFunnel() {
  const { data, error } = await supabase.from('activation_funnel').select('*').single();
  if (error) throw error;
  return data;
}
