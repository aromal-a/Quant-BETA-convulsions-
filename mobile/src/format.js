import { C } from './theme';

// oil_chain.json stores ratios (0.134); tolerate values already in percent.
const asPct = (v) => (v == null || !isFinite(v) ? null : Math.abs(v) <= 1.5 ? v * 100 : v);
const sign = (v) => (v >= 0 ? '+' : '−');

export const pct = (v, d = 1) => { const p = asPct(v); return p == null ? '—' : `${p < 0 ? '−' : ''}${Math.abs(p).toFixed(d)}%`; };
export const signedPct = (v, d = 0) => { const p = asPct(v); return p == null ? '—' : `${sign(p)}${Math.abs(p).toFixed(d)}%`; };
export const pt = (v) => { const p = asPct(v); return p == null ? '—' : `${sign(p)}${Math.abs(p).toFixed(1)} pt`; };
export const tone = (v) => (v == null ? C.muted : v >= 0 ? C.green : C.red);

export function money(v, currency = 'USD') {
  if (v == null || !isFinite(v)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

export const qtyText = (q) => (Number.isInteger(+q) ? String(+q) : (+q).toFixed(4).replace(/0+$/, ''));
export const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const day = (iso) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });

export const COUNTRY = { US: 'US', IN: 'India', GB: 'UK', JP: 'Japan', CN: 'China', KR: 'Korea', CL: 'Chile', CA: 'Canada' };

export function alignmentLabel(a) {
  if (!a) return { text: '—', color: C.muted };
  if (a.startsWith('aligned: strong')) return { text: 'aligned strong', color: C.green };
  if (a.startsWith('aligned: weak')) return { text: 'aligned weak', color: C.red };
  if (a.startsWith('diverging')) return { text: a.replace('diverging: ', ''), color: C.orange };
  return { text: a, color: C.muted };
}
