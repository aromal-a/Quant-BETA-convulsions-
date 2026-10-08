import { useEffect, useState } from 'react';
import { getToken } from '../secureTokens';
import alpaca from './alpaca';
import upstox from './upstox';
import binance from './binance';

export const BROKERS = { alpaca, upstox, binance };

// Which broker can execute a symbol live.
export function brokerFor(symbol) {
  if (!symbol || symbol.startsWith('^')) return null;
  if (/-USD$/.test(symbol)) return binance;
  if (/\.(NS|BO)$/.test(symbol)) return upstox;
  if (!symbol.includes('.')) return alpaca;
  return null;
}

let status = {};
const listeners = new Set();
export async function refreshConnections() {
  const out = {};
  for (const id of Object.keys(BROKERS)) {
    const t = await getToken(id);
    out[id] = !!t && !(t.expires_at && Date.now() > t.expires_at);
  }
  status = out;
  listeners.forEach((f) => f(out));
  return out;
}
export function useConnections() {
  const [s, setS] = useState(status);
  useEffect(() => {
    listeners.add(setS);
    refreshConnections();
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}
