import { useEffect, useState } from 'react';

const DATA = 'https://raw.githubusercontent.com/aromal-a/Quant-BETA-convulsions-/main/docs/data/';

export const SEGMENT_ORDER = ['producers', 'rigs', 'pipelines', 'integrated', 'refiners', 'lithium', 'batteries', 'cars', 'transport'];
export const CHAINS = {
  oil: ['producers', 'rigs', 'pipelines', 'integrated', 'refiners', 'cars', 'transport'],
  lithium: ['lithium', 'batteries', 'cars', 'transport'],
  all: SEGMENT_ORDER,
};
// Mirrors TRADABLE_SEGMENTS in quant_beam/oilchain.py
export const BOT_SEGMENTS = ['producers', 'rigs', 'integrated', 'refiners', 'transport'];

export const opMargin = (c) => c?.margins?.margins?.operating ?? null;
export const opChange = (c) => c?.margins?.change?.operating ?? null;
export const isLeak = (c) => !!c?.margins?.leak;

let chainCache = null;
export async function loadChain(force = false) {
  if (chainCache && !force) return chainCache;
  const r = await fetch(DATA + 'oil_chain.json');
  if (!r.ok) throw new Error(`Chain data unavailable (${r.status})`);
  chainCache = await r.json();
  return chainCache;
}

export function useChain() {
  const [state, setState] = useState({ data: chainCache, error: null });
  const reload = (force) =>
    loadChain(force).then((data) => setState({ data, error: null })).catch((e) => setState({ data: null, error: e.message }));
  useEffect(() => { reload(false); }, []);
  return { ...state, reload: () => reload(true) };
}

let linksCache = null;
export async function loadLinks(force = false) {
  if (linksCache && !force) return linksCache;
  const r = await fetch(DATA + 'chain_links.json');
  if (!r.ok) throw new Error(r.status === 404 ? 'Chain links not published yet. Run "python -m quant_beam links" and push docs/data/chain_links.json.' : `Chain links unavailable (${r.status})`);
  linksCache = await r.json();
  return linksCache;
}

export function useLinks() {
  const [state, setState] = useState({ data: linksCache, error: null });
  const reload = (force) =>
    loadLinks(force).then((data) => setState({ data, error: null })).catch((e) => setState({ data: null, error: e.message }));
  useEffect(() => { reload(false); }, []);
  return { ...state, reload: () => reload(true) };
}

export async function fetchQuote(symbol) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`);
  if (!r.ok) throw new Error(`Price feed ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(j?.chart?.error?.description || 'No price');
  const m = res.meta;
  return {
    symbol,
    price: m.regularMarketPrice,
    prev: m.chartPreviousClose ?? m.previousClose,
    currency: m.currency || 'USD',
    marketTime: (m.regularMarketTime || 0) * 1000,
    closes: (res.indicators?.quote?.[0]?.close || []).filter((v) => v != null),
    fetchedAt: Date.now(),
  };
}

export function useQuote(symbol, every = 15000) {
  const [q, setQ] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!symbol) return;
    let live = true;
    setQ(null);
    const tick = () => fetchQuote(symbol)
      .then((v) => { if (live) { setQ(v); setError(null); } })
      .catch((e) => live && setError(e.message));
    tick();
    const id = setInterval(tick, every);
    return () => { live = false; clearInterval(id); };
  }, [symbol, every]);
  return { q, error };
}

export function useQuotes(symbols, every = 30000) {
  const key = [...new Set(symbols)].sort().join(',');
  const [quotes, setQuotes] = useState({});
  useEffect(() => {
    if (!key) return;
    let live = true;
    const tick = async () => {
      const results = await Promise.allSettled(key.split(',').map(fetchQuote));
      if (!live) return;
      setQuotes((prev) => {
        const next = { ...prev };
        results.forEach((r) => { if (r.status === 'fulfilled') next[r.value.symbol] = r.value; });
        return next;
      });
    };
    tick();
    const id = setInterval(tick, every);
    return () => { live = false; clearInterval(id); };
  }, [key, every]);
  return quotes;
}
