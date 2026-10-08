import { sha256 } from 'js-sha256';
import { BROKER_ENV } from '../config';
import { clearToken, getToken, setToken } from '../secureTokens';

const API = BROKER_ENV === 'production' ? 'https://api.binance.com' : 'https://testnet.binance.vision';
const PUBLIC = 'https://api.binance.com';
export const pair = (symbol) => symbol.replace(/-USD$/, 'USDT').replace('-', '');

async function signed(method, path, params = {}) {
  const c = await getToken('binance');
  if (!c) throw new Error('Connect Binance first');
  const q = new URLSearchParams({ ...params, timestamp: String(Date.now()), recvWindow: '10000' }).toString();
  const r = await fetch(`${API}${path}?${q}&signature=${sha256.hmac(c.secret, q)}`, { method, headers: { 'X-MBX-APIKEY': c.key } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.msg || `Binance error ${r.status}`);
  return j;
}

const info = {};
async function filters(p) {
  if (!info[p]) {
    const j = await (await fetch(`${API}/api/v3/exchangeInfo?symbol=${p}`)).json();
    const f = Object.fromEntries((j.symbols?.[0]?.filters ?? []).map((x) => [x.filterType, x]));
    info[p] = { minNotional: +(f.NOTIONAL?.minNotional ?? f.MIN_NOTIONAL?.minNotional ?? 5), step: +(f.LOT_SIZE?.stepSize ?? 0.00001) };
  }
  return info[p];
}
const roundDown = (v, step) => { const d = Math.max(0, Math.round(-Math.log10(step))); return (Math.floor(v / step) * step).toFixed(d); };

export default {
  id: 'binance',
  name: 'Binance',
  region: 'Crypto',
  note: 'Fractional · minimum set per coin (often $5)',
  currency: 'USD',
  fractional: true,
  usesApiKey: true,

  async connect({ key, secret }) {
    if (!key || !secret) throw new Error('Paste both the API key and secret.');
    await setToken('binance', { key, secret });
    try { await this.account(); } catch (e) { await clearToken('binance'); throw e; }
  },

  async account() {
    const a = await signed('GET', '/api/v3/account');
    const usdt = a.balances?.find((b) => b.asset === 'USDT');
    return { buyingPower: +(usdt?.free ?? 0), currency: 'USD', label: 'Binance · USDT' };
  },

  async minNotional(symbol) { return (await filters(pair(symbol))).minNotional; },

  async quote(symbol) {
    const j = await (await fetch(`${PUBLIC}/api/v3/ticker/price?symbol=${pair(symbol)}`)).json();
    return j.price ? +j.price : null;
  },

  async place({ symbol, side, qty, notional }) {
    const p = pair(symbol);
    const params = { symbol: p, side: side.toUpperCase(), type: 'MARKET', newOrderRespType: 'FULL' };
    if (notional) params.quoteOrderQty = notional.toFixed(2);
    else params.quantity = roundDown(qty, (await filters(p)).step);
    const o = await signed('POST', '/api/v3/order', params);
    return `${p}:${o.orderId}`;
  },

  async status(id) {
    const [p, orderId] = id.split(':');
    const o = await signed('GET', '/api/v3/order', { symbol: p, orderId });
    if (o.status === 'FILLED') return { state: 'filled', qty: +o.executedQty, price: +o.cummulativeQuoteQty / +o.executedQty };
    if (['CANCELED', 'REJECTED', 'EXPIRED', 'EXPIRED_IN_MATCH'].includes(o.status)) return { state: 'rejected', reason: o.status.toLowerCase() };
    return { state: 'pending', reason: o.status.toLowerCase() };
  },
};
