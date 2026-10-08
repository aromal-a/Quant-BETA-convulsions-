import { BROKER_ENV, DATA_URL, UPSTOX_CLIENT_ID } from '../config';
import { clearToken, getToken, setToken } from '../secureTokens';
import { enc, oauthConnect } from './oauth';

const API = 'https://api.upstox.com/v2';
const HFT = 'https://api-hft.upstox.com/v2';

let map = null;
async function instrumentKey(symbol) {
  if (!map) {
    const r = await fetch(DATA_URL + 'upstox_instruments.json');
    map = r.ok ? await r.json() : {};
  }
  const k = map[symbol];
  if (!k) throw new Error(`${symbol} isn't mapped for Upstox yet (run scripts/build_upstox_map.py).`);
  return k;
}

async function call(base, path, opts = {}) {
  const t = await getToken('upstox');
  if (!t) throw new Error('Connect Upstox first');
  if (t.expires_at && Date.now() > t.expires_at) {
    await clearToken('upstox');
    throw new Error('Upstox logs out daily at 3:30 AM IST. Reconnect in Brokers.');
  }
  const r = await fetch(base + path, {
    ...opts,
    headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { await clearToken('upstox'); throw new Error('Upstox login expired. Reconnect in Brokers.'); }
  if (!r.ok || j.status === 'error') throw new Error(j.errors?.[0]?.message || `Upstox error ${r.status}`);
  return j.data;
}

export default {
  id: 'upstox',
  name: 'Upstox',
  region: 'NSE / BSE stocks',
  note: 'Whole shares · reconnect daily',
  currency: 'INR',
  fractional: false,

  async connect() {
    if (!UPSTOX_CLIENT_ID) throw new Error('EXPO_PUBLIC_UPSTOX_CLIENT_ID is missing in mobile/.env');
    const tok = await oauthConnect('upstox', (redirect, state) =>
      `${API}/login/authorization/dialog?response_type=code&client_id=${enc(UPSTOX_CLIENT_ID)}&redirect_uri=${enc(redirect)}&state=${enc(state)}`);
    await setToken('upstox', tok);
  },

  async account() {
    const d = await call(API, '/user/get-funds-and-margin?segment=SEC');
    return { buyingPower: +(d?.equity?.available_margin ?? 0), currency: 'INR', label: 'Upstox' };
  },

  async quote(symbol) {
    const d = await call(API, `/market-quote/ltp?instrument_key=${enc(await instrumentKey(symbol))}`);
    return Object.values(d || {})[0]?.last_price ?? null;
  },

  async place({ symbol, side, qty }) {
    if (BROKER_ENV !== 'production') throw new Error("Upstox has no paper account here. Use Demo, or set EXPO_PUBLIC_BROKER_ENV=production.");
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Upstox trades whole shares only.');
    const d = await call(HFT, '/order/place', {
      method: 'POST',
      body: JSON.stringify({
        instrument_token: await instrumentKey(symbol), quantity: qty, transaction_type: side.toUpperCase(),
        order_type: 'MARKET', product: 'D', validity: 'DAY', price: 0, trigger_price: 0, disclosed_quantity: 0, is_amo: false, tag: 'quantbeam',
      }),
    });
    return d.order_id;
  },

  async status(id) {
    const d = await call(API, `/order/details?order_id=${enc(id)}`);
    if (d.status === 'complete') return { state: 'filled', qty: +d.filled_quantity, price: +d.average_price };
    if (['rejected', 'cancelled'].includes(d.status)) return { state: 'rejected', reason: d.status_message || d.status };
    return { state: 'pending', reason: d.status };
  },
};
