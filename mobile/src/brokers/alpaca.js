import { ALPACA_CLIENT_ID, BROKER_ENV } from '../config';
import { clearToken, getToken, setToken } from '../secureTokens';
import { enc, oauthConnect } from './oauth';

const API = BROKER_ENV === 'production' ? 'https://api.alpaca.markets' : 'https://paper-api.alpaca.markets';
const DATA = 'https://data.alpaca.markets';

async function call(base, path, opts = {}) {
  const t = await getToken('alpaca');
  if (!t) throw new Error('Connect Alpaca first');
  const r = await fetch(base + path, {
    ...opts,
    headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { await clearToken('alpaca'); throw new Error('Alpaca login expired. Reconnect in Brokers.'); }
  if (!r.ok) throw new Error(j.message || `Alpaca error ${r.status}`);
  return j;
}

export default {
  id: 'alpaca',
  name: 'Alpaca',
  region: 'US stocks & ETFs',
  note: 'Fractional shares, orders from $2',
  currency: 'USD',
  fractional: true,

  async connect() {
    if (!ALPACA_CLIENT_ID) throw new Error('EXPO_PUBLIC_ALPACA_CLIENT_ID is missing in mobile/.env');
    const tok = await oauthConnect('alpaca', (redirect, state) =>
      `https://app.alpaca.markets/oauth/authorize?response_type=code&client_id=${enc(ALPACA_CLIENT_ID)}` +
      `&redirect_uri=${enc(redirect)}&state=${enc(state)}&scope=${enc('account:write trading data')}` +
      `&env=${BROKER_ENV === 'production' ? 'live' : 'paper'}`);
    await setToken('alpaca', tok);
  },

  async account() {
    const a = await call(API, '/v2/account');
    return { buyingPower: +a.buying_power, currency: a.currency || 'USD', label: `Alpaca ••••${String(a.account_number ?? '').slice(-4)}` };
  },

  async minNotional() { return 1; },

  async quote(symbol) {
    const j = await call(DATA, `/v2/stocks/${enc(symbol)}/trades/latest?feed=iex`);
    return j.trade?.p ?? null;
  },

  async place({ symbol, side, qty, notional }) {
    const body = { symbol, side, type: 'market', time_in_force: 'day', ...(notional ? { notional: notional.toFixed(2) } : { qty: String(qty) }) };
    const o = await call(API, '/v2/orders', { method: 'POST', body: JSON.stringify(body) });
    return o.id;
  },

  async status(id) {
    const o = await call(API, `/v2/orders/${id}`);
    if (o.status === 'filled') return { state: 'filled', qty: +o.filled_qty, price: +o.filled_avg_price };
    if (['canceled', 'expired', 'rejected', 'suspended'].includes(o.status)) return { state: 'rejected', reason: o.status };
    return { state: 'pending', reason: o.status };
  },
};
