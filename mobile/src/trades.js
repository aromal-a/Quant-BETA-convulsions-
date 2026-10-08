import { Platform } from 'react-native';
import { supabase } from './supabase';
import { BROKER_ENV } from './config';
import { BROKERS, brokerFor, refreshConnections } from './brokers';
import { clearToken, getJSON, setJSON } from './secureTokens';
import { isLeak, opChange, opMargin } from './data';

async function uid() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('Not signed in');
  return id;
}

const logged = new Set();
export async function onSignedIn(user) {
  if (logged.has(user.id)) return;
  logged.add(user.id);
  const provider = ['apple', 'google', 'email'].includes(user.app_metadata?.provider) ? user.app_metadata.provider : 'email';
  const isNew = Date.now() - new Date(user.created_at).getTime() < 2 * 60 * 1000;
  await supabase.from('sign_in_events').insert({ user_id: user.id, provider, platform: Platform.OS, is_new_user: isNew });
  await ensureLink('paper');
}

let links = {};
export async function ensureLink(broker, label) {
  if (links[broker]) return links[broker];
  const user_id = await uid();
  const mode = broker === 'paper' || BROKER_ENV !== 'production' ? 'paper' : 'live';
  const { data, error } = await supabase
    .from('broker_links')
    .upsert({ user_id, broker, mode, label: label ?? (broker === 'paper' ? 'Demo wallet' : broker), revoked_at: null }, { onConflict: 'user_id,broker' })
    .select()
    .single();
  if (error) throw error;
  links[broker] = data;
  return data;
}

export const marginState = (c) => (!c ? null : isLeak(c) ? 'leak' : (opChange(c) ?? 0) >= 0 ? 'expanding' : 'contracting');
const snapshot = (c) => (c ? { segment: c.segment, op_margin: opMargin(c), margin_change: opChange(c), margin_state: marginState(c) } : {});

async function record({ link, symbol, side, qty, price, currency, snap, orderId = null }) {
  const { data, error } = await supabase
    .from('trades')
    .insert({ user_id: link.user_id, broker_link_id: link.id, symbol, side, qty, price, currency, broker_order_id: orderId, ...snap })
    .select('id, session_id, placed_at, mode')
    .single();
  if (error) throw error;
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PENDING = 'orders.pending';

// Demo fills instantly at the shown price. Live sends a market order to the user's broker and records only the actual fill.
export async function placeOrder({ mode, symbol, side, qty, notional, price, currency, company }) {
  const snap = snapshot(company);
  if (mode === 'demo') {
    const q = qty ?? notional / price;
    const link = await ensureLink('paper');
    await record({ link, symbol, side, qty: +q.toFixed(8), price, currency, snap });
    return { state: 'filled', qty: q, price };
  }

  const b = brokerFor(symbol);
  if (!b) throw new Error(`${symbol} can't be traded live yet. Use Demo.`);
  const link = await ensureLink(b.id, b.name);
  const orderId = await b.place({ symbol, side, qty, notional });

  for (let i = 0; i < 8; i++) {
    const s = await b.status(orderId);
    if (s.state === 'filled') {
      await record({ link, symbol, side, qty: s.qty, price: s.price, currency: b.currency, snap, orderId });
      return { state: 'filled', qty: s.qty, price: s.price };
    }
    if (s.state === 'rejected') return { state: 'rejected', reason: s.reason };
    await sleep(1500);
  }
  const pending = await getJSON(PENDING, []);
  await setJSON(PENDING, [...pending, { broker: b.id, orderId, symbol, side, currency: b.currency, snap }]);
  return { state: 'pending', orderId };
}

// Orders that weren't filled immediately (e.g. market closed) get recorded once the broker fills them.
export async function reconcilePending() {
  const pending = await getJSON(PENDING, []);
  if (!pending.length) return 0;
  const keep = [];
  let filled = 0;
  for (const p of pending) {
    try {
      const b = BROKERS[p.broker];
      const s = await b.status(p.orderId);
      if (s.state === 'filled') {
        const link = await ensureLink(b.id, b.name);
        await record({ link, symbol: p.symbol, side: p.side, qty: s.qty, price: s.price, currency: p.currency, snap: p.snap, orderId: p.orderId });
        filled++;
      } else if (s.state === 'pending') keep.push(p);
    } catch { keep.push(p); }
  }
  await setJSON(PENDING, keep);
  return filled;
}
export const pendingCount = async () => (await getJSON(PENDING, [])).length;

export async function listTrades(mode, symbol) {
  let q = supabase.from('trades').select('*').eq('mode', mode).order('placed_at', { ascending: false }).limit(1000);
  if (symbol) q = q.eq('symbol', symbol);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function openSession(mode) {
  const { data, error } = await supabase.from('trading_sessions').select('*').eq('mode', mode).is('ended_at', null).maybeSingle();
  if (error) throw error;
  return data;
}

export async function endSession(mode) {
  const { error } = await supabase.from('trading_sessions').update({ ended_at: new Date().toISOString() }).eq('mode', mode).is('ended_at', null);
  if (error) throw error;
}

// Average-cost positions plus every closed (sold) lot, tagged with the chain segment and margin trend at entry.
export function analyse(trades) {
  const by = {};
  const closed = [];
  [...trades].sort((a, b) => new Date(a.placed_at) - new Date(b.placed_at)).forEach((t) => {
    const p = (by[t.symbol] ||= { symbol: t.symbol, currency: t.currency || 'USD', qty: 0, cost: 0, realized: 0, entry: null });
    const q = +t.qty, px = +t.price;
    if (t.side === 'buy') {
      p.cost += q * px; p.qty += q;
      p.entry = { segment: t.segment, state: t.margin_state };
    } else {
      const avg = p.qty ? p.cost / p.qty : px;
      const pnl = (px - avg) * q;
      p.realized += pnl; p.cost -= avg * q; p.qty -= q;
      closed.push({ symbol: t.symbol, segment: t.segment ?? p.entry?.segment ?? null, state: p.entry?.state ?? t.margin_state ?? null, ret: avg ? px / avg - 1 : 0, pnl, currency: p.currency });
    }
  });
  const positions = Object.values(by).map((p) => ({ ...p, avg: p.qty > 1e-9 ? p.cost / p.qty : 0 }));
  return { positions, closed };
}
export const positionsFrom = (trades) => analyse(trades).positions;

export function groupOutcomes(closed, key) {
  const g = {};
  closed.forEach((c) => {
    const k = c[key] ?? 'none';
    const r = (g[k] ||= { key: k, n: 0, wins: 0, sumRet: 0 });
    r.n++; r.sumRet += c.ret; if (c.pnl > 0) r.wins++;
  });
  return Object.values(g).map((r) => ({ ...r, winRate: r.wins / r.n, avgRet: r.sumRet / r.n })).sort((a, b) => b.n - a.n);
}

export function subscribeTrades(userId, onChange) {
  const ch = supabase
    .channel(`trades-${userId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades', filter: `user_id=eq.${userId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trading_sessions', filter: `user_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export async function getWatchlist() {
  const { data, error } = await supabase.from('watchlist').select('symbol');
  if (error) throw error;
  return data.map((r) => r.symbol);
}
export async function setWatched(symbol, on) {
  const user_id = await uid();
  const { error } = on
    ? await supabase.from('watchlist').upsert({ user_id, symbol })
    : await supabase.from('watchlist').delete().eq('symbol', symbol);
  if (error) throw error;
}

export async function getProfile() {
  const { data, error } = await supabase.from('activation_funnel').select('*').maybeSingle();
  if (error) throw error;
  return data;
}

export async function disconnectBroker(id) {
  await clearToken(id);
  delete links[id];
  await supabase.from('broker_links').update({ revoked_at: new Date().toISOString() }).eq('broker', id);
  await refreshConnections();
}

async function clearDevice() {
  links = {};
  for (const id of Object.keys(BROKERS)) await clearToken(id);
  await setJSON(PENDING, []);
  await refreshConnections();
}

export async function deleteAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  await clearDevice();
  await supabase.auth.signOut({ scope: 'local' });
}

export async function signOut() {
  await clearDevice();
  await supabase.auth.signOut();
}
