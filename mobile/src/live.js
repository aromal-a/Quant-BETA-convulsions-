import { useEffect, useState } from 'react';
import { useQuote } from './data';
import { brokerFor, useConnections } from './brokers';
import { pair } from './brokers/binance';

// Live price: Binance trade stream for crypto, connected broker every 2 s for stocks,
// Yahoo every 15 s as the fallback (also supplies previous close, currency, intraday line).
export function useLivePrice(symbol) {
  const { q, error } = useQuote(symbol, 15000);
  const conns = useConnections();
  const broker = brokerFor(symbol);
  const brokerOn = !!broker && !!conns[broker.id];
  const [tick, setTick] = useState(null);
  const [trail, setTrail] = useState([]);

  useEffect(() => {
    setTick(null); setTrail([]);
    if (!symbol) return;
    const push = (price, source) => {
      if (!price || !isFinite(price)) return;
      setTick({ price, at: Date.now(), source });
      setTrail((t) => [...t.slice(-299), price]);
    };

    if (/-USD$/.test(symbol)) {
      let ws, timer, dead = false, last = 0;
      const open = () => {
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair(symbol).toLowerCase()}@trade`);
        ws.onmessage = (e) => {
          const now = Date.now();
          if (now - last < 500) return;
          last = now;
          push(+JSON.parse(e.data).p, 'Binance stream');
        };
        ws.onclose = () => { if (!dead) timer = setTimeout(open, 3000); };
      };
      open();
      return () => { dead = true; clearTimeout(timer); ws && ws.close(); };
    }

    if (!brokerOn) return;
    let live = true;
    const poll = () => broker.quote(symbol).then((p) => live && push(p, broker.name)).catch(() => {});
    poll();
    const id = setInterval(poll, 2000);
    return () => { live = false; clearInterval(id); };
  }, [symbol, brokerOn]);

  const streaming = !!tick && Date.now() - tick.at < 15000;
  return {
    price: tick?.price ?? q?.price ?? null,
    prev: q?.prev ?? null,
    currency: q?.currency ?? (broker?.currency || 'USD'),
    marketTime: q?.marketTime,
    closes: [...(q?.closes ?? []), ...trail],
    source: tick ? tick.source : q ? 'Yahoo · 15 s' : null,
    streaming,
    error,
  };
}
