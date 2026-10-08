import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { useLinks } from '../data';
import { COUNTRY } from '../format';
import { C } from '../theme';
import { Back, Button, Card, Chip, Label, Loading, Muted, Screen, T, Title } from '../ui';

// Reads docs/data/chain_links.json, written by `python -m quant_beam links` (quant_beam/chainlinks.py).
const VIEWS = ['3D links', 'Median candles', 'Perforation'];
const SHOWN = 60; // candles drawn; a phone cannot fit more legibly
const times = (v) => (v == null || !isFinite(v) ? '—' : `${v.toFixed(1)}×`);
const place = (c) => COUNTRY[c] ?? (c === 'LATAM' ? 'Latin America' : c ?? '');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function ChainLinks3D({ links, onPress }) {
  const sway = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]));
      loop.start();
    }).catch(() => {});
    return () => loop?.stop();
  }, [sway]);
  const face = sway.interpolate({ inputRange: [0, 1], outputRange: ['-38deg', '-12deg'] });
  const edge = sway.interpolate({ inputRange: [0, 1], outputRange: ['52deg', '78deg'] });

  return (
    <Card style={{ paddingTop: 18 }}>
      {links.map((l, i) => {
        const width = Math.max(56, Math.min(118, 60 + 22 * (l.relative_volume ?? 1)));
        const color = l.sell_pressure ? C.orange : i % 2 ? '#7c6cf0' : C.accent;
        return (
          <Pressable key={l.symbol} onPress={() => onPress(l)} accessibilityRole="button"
            accessibilityLabel={`${l.name}, ${times(l.relative_volume)} usual volume${l.sell_pressure ? ', sell blocks' : ''}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 92, marginTop: i ? -22 : 0 }}>
            <View style={{ width: 124, alignItems: 'center' }}>
              <Animated.View style={{
                width, height: 92, borderRadius: 46, borderWidth: 9, borderColor: color,
                borderStyle: l.sell_pressure ? 'dashed' : 'solid',
                transform: [{ perspective: 520 }, { rotateY: i % 2 ? edge : face }],
              }} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <T style={{ fontWeight: '600' }} numberOfLines={1}>{l.name}</T>
              <T style={{ fontSize: 12, color: l.sell_pressure ? C.orange : C.muted }} numberOfLines={1}>
                {l.symbol} · {place(l.country)} · {times(l.relative_volume)}{l.sell_pressure ? ' · sell blocks' : ''}
              </T>
            </View>
          </Pressable>
        );
      })}
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 12, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, borderTopWidth: 3, borderColor: C.accent }} /><Muted style={{ fontSize: 11 }}>holding</Muted></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, borderTopWidth: 3, borderColor: C.orange, borderStyle: 'dashed' }} /><Muted style={{ fontSize: 11 }}>perforated</Muted></View>
        <Muted style={{ fontSize: 11 }}>link width = volume</Muted>
      </View>
    </Card>
  );
}

function Candles({ candles, hitDates, window }) {
  const [w, setW] = useState(0);
  const H = 300, padR = 36, top = 8, priceH = 204, volTop = 232, volH = 60;
  const shapes = useMemo(() => {
    if (!w || candles.length < 2) return null;
    const closes = candles.map((c) => c.c);
    const meds = closes.map((_, i) => median(closes.slice(Math.max(0, i - window + 1), i + 1)));
    const from = Math.max(0, candles.length - SHOWN);
    const bars = candles.slice(from), med = meds.slice(from);
    const hi = Math.max(...bars.map((b) => b.h)), lo = Math.min(...bars.map((b) => b.l));
    const span = hi - lo || 1, step = (w - padR) / bars.length, bw = Math.max(2, step * 0.62);
    const x = (i) => i * step + step / 2, y = (p) => top + ((hi - p) / span) * priceH;
    const vmax = Math.max(...bars.map((b) => b.volume ?? 0)) || 1;
    return {
      grid: [0, 1, 2, 3].map((k) => { const p = lo + (span * k) / 3; return { y: y(p), text: p.toFixed(1) }; }),
      bars: bars.map((b, i) => ({
        key: b.date, x: x(i), bw, up: b.c >= b.o, yh: y(b.h), yl: y(b.l), yt: y(Math.max(b.o, b.c)),
        bh: Math.max(1.5, Math.abs(y(b.o) - y(b.c))), vh: ((b.volume ?? 0) / vmax) * volH, sell: b.sell_links > 0,
        hit: hitDates.has(b.date) ? y(med[i]) : null,
      })),
      med: med.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(m).toFixed(1)}`).join(' '),
    };
  }, [w, candles, hitDates, window]);

  return (
    <Card style={{ padding: 12, gap: 8 }}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}
        accessibilityLabel="Candlestick chart of the chain's median price, with median volume bars below">
        {shapes && (
          <Svg width={w} height={H}>
            {shapes.grid.map((g) => <Line key={g.text} x1={0} x2={w - padR} y1={g.y} y2={g.y} stroke={C.line} strokeWidth={1} />)}
            {shapes.bars.map((b) => (
              <React.Fragment key={b.key}>
                <Line x1={b.x} x2={b.x} y1={b.yh} y2={b.yl} stroke={b.up ? C.green : C.red} strokeWidth={1.2} />
                <Rect x={b.x - b.bw / 2} y={b.yt} width={b.bw} height={b.bh} fill={b.up ? C.green : C.card} stroke={b.up ? C.green : C.red} strokeWidth={1} />
                <Rect x={b.x - b.bw / 2} y={volTop + volH - b.vh} width={b.bw} height={b.vh} fill={b.sell ? C.orange : '#4a4f78'} />
              </React.Fragment>
            ))}
            <Path d={shapes.med} stroke={C.text} strokeWidth={1.5} strokeDasharray="5 4" fill="none" />
            {shapes.bars.filter((b) => b.hit != null).map((b) => (
              <Path key={`hit-${b.key}`} d={`M${b.x} ${b.hit - 5} L${b.x + 5} ${b.hit} L${b.x} ${b.hit + 5} L${b.x - 5} ${b.hit} Z`} fill={C.accent} />
            ))}
            <Line x1={0} x2={w - padR} y1={volTop - 6} y2={volTop - 6} stroke={C.line} strokeWidth={1} />
          </Svg>
        )}
        {shapes && shapes.grid.map((g) => (
          <Muted key={`t-${g.text}`} style={{ position: 'absolute', right: 0, top: g.y - 7, fontSize: 10, width: padR - 5, textAlign: 'right' }}>{g.text}</Muted>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
        <Muted style={{ fontSize: 11 }}><T style={{ color: C.green, fontSize: 11 }}>■</T> up</Muted>
        <Muted style={{ fontSize: 11 }}><T style={{ color: C.red, fontSize: 11 }}>□</T> down</Muted>
        <Muted style={{ fontSize: 11 }}>- - {window}-bar median</Muted>
        <Muted style={{ fontSize: 11 }}><T style={{ color: C.orange, fontSize: 11 }}>■</T> sell-block volume</Muted>
        <Muted style={{ fontSize: 11 }}><T style={{ color: C.accent, fontSize: 11 }}>◆</T> median hit</Muted>
      </View>
    </Card>
  );
}

function MedianHit({ hit, links, nav }) {
  const [call, setCall] = useState(null);
  const p = hit.pending;
  if (!p) {
    const last = hit.hits[hit.hits.length - 1];
    return <Muted style={{ fontSize: 12, lineHeight: 17 }}>No median hit on the latest bar.{last ? ` Last hit: ${last.date}, ${last.direction.replace('_', ' ')}.` : ''} The up/down question appears here when the newest candle crosses the median.</Muted>;
  }
  const up = p.p_up == null ? null : Math.round(p.p_up * 100);
  return (
    <Card selected style={{ gap: 10 }}>
      <Label>{`Median hit · ${p.date}`}</Label>
      <T style={{ fontSize: 17, fontWeight: '700' }}>Price touched the chain median, {p.direction.replace('_', ' ')}</T>
      {up == null
        ? <Muted style={{ lineHeight: 18 }}>Only {p.count} past hits like this: too few to quote a rate.</Muted>
        : <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T style={{ fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{up}% up</T>
            <Muted style={{ fontSize: 15 }}>{100 - up}% down</Muted>
          </View>
          <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
            <View style={{ flex: up, backgroundColor: C.accent }} /><View style={{ flex: 100 - up, backgroundColor: '#3a3f63' }} />
          </View>
          <Muted style={{ fontSize: 12, lineHeight: 17 }}>After {p.count} past hits {p.direction.replace('_', ' ')}, price was higher {p.horizon} bars later in {p.up} of them. A count of the past, not a forecast.</Muted>
        </>}
      <T style={{ fontWeight: '600' }}>Your call for the next {p.horizon} bars?</T>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Up · Buy" variant={call === 'buy' ? 'buy' : 'outline'} onPress={() => setCall('buy')} style={{ flex: 1 }} />
        <Button title="Down · Sell" variant={call === 'sell' ? 'sell' : 'outline'} onPress={() => setCall('sell')} style={{ flex: 1 }} />
      </View>
      {call && (
        <View style={{ gap: 6 }}>
          <Muted style={{ fontSize: 12 }}>Pick the link to trade. Nothing is sent until you confirm on the next screen.</Muted>
          {links.map((l) => (
            <Card key={l.symbol} onPress={() => nav.push('Vendor', { symbol: l.symbol, name: l.name, side: call })}
              style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 }}>
              <T style={{ fontSize: 14 }}>{l.name}</T><Muted>{l.symbol} ›</Muted>
            </Card>
          ))}
          <Button title="Skip this hit" variant="outline" onPress={() => setCall(null)} style={{ height: 44 }} />
        </View>
      )}
    </Card>
  );
}

function Part({ title, value, text, note, color = C.orange }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T style={{ fontSize: 14 }}>{title}</T><T style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>{text}</T></View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: C.line, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round((value ?? 0) * 100)}%`, height: 8, backgroundColor: color }} />
      </View>
      <Muted style={{ fontSize: 11 }}>{note}</Muted>
    </View>
  );
}

function Perforation({ chain, weights }) {
  const parts = chain.perforation.parts;
  const leakKnown = chain.links.filter((l) => l.leaking != null);
  const w = (k) => `weight ${Math.round(weights[k] * 100)}%`;
  return (
    <>
      <Card style={{ gap: 14 }}>
        <Part title="Sell volume breaking through" value={parts.sell_volume} text={`${chain.sell_links} of ${chain.link_count} links`}
          note={`Recent down candles on heavy volume · ${w('sell_volume')}`} />
        <Part title="Margin leaks" value={parts.margin_leaks}
          text={leakKnown.length ? `${leakKnown.filter((l) => l.leaking).length} of ${leakKnown.length} links` : 'unknown'}
          note={`Operating margin below a year earlier · ${w('margin_leaks')}`} />
        <Part title="Markets joined" value={parts.markets_joined} color={C.accent}
          text={parts.markets_joined == null ? 'unknown' : parts.markets_joined.toFixed(2)}
          note={`How closely the links' prices move as one · ${w('markets_joined')}`} />
      </Card>
      <View style={{ gap: 6 }}>
        {chain.links.map((l) => {
          const state = [l.sell_pressure && 'sell blocks', l.leaking && 'leak'].filter(Boolean).join(' + ') || 'holding';
          const bad = state !== 'holding';
          return (
            <Card key={l.symbol} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderStyle: bad ? 'dashed' : 'solid', borderColor: bad ? C.orange : C.line }}>
              <T style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>{l.name}</T>
              <T style={{ width: 56, textAlign: 'right', fontSize: 14, fontVariant: ['tabular-nums'] }}>{times(l.relative_volume)}</T>
              <T style={{ width: 96, textAlign: 'right', fontSize: 13, color: bad ? C.orange : C.green }}>{state}</T>
            </Card>
          );
        })}
      </View>
      <Muted style={{ fontSize: 11, lineHeight: 16 }}>Describes now; it hasn't been back-tested, and it is not a recommendation.</Muted>
    </>
  );
}

export default function Links({ nav, params }) {
  const { data, error, reload } = useLinks();
  const [view, setView] = useState(VIEWS[0]);
  const chain = data?.chains?.[params.code];
  const hitDates = useMemo(() => new Set((chain?.median_hit?.hits ?? []).map((h) => h.date)), [chain]);
  const score = chain?.perforation?.score;

  return (
    <Screen onRefresh={reload}>
      <Back onPress={nav.back} />
      {!data ? <Loading error={error} onRetry={reload} /> : !chain ? (
        <Muted style={{ paddingVertical: 20, textAlign: 'center' }}>No link data for this chain yet.</Muted>
      ) : (
        <>
          <View style={{ gap: 4 }}>
            <Label>{`Chain · ${chain.link_count} links`}</Label>
            <Title>{chain.name}</Title>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {VIEWS.map((v) => <Chip key={v} label={v} active={view === v} onPress={() => setView(v)} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Card style={{ flex: 1, gap: 4, padding: 12 }}><Muted style={{ fontSize: 11 }}>Median volume</Muted><T style={{ fontSize: 20, fontWeight: '700' }}>{times(chain.median_volume)}</T></Card>
            <Card style={{ flex: 1, gap: 4, padding: 12 }}><Muted style={{ fontSize: 11 }}>Sell-volume check</Muted><T style={{ fontSize: 20, fontWeight: '700', color: chain.sell_links ? C.orange : C.text }}>{chain.sell_links} of {chain.link_count}</T></Card>
            <Card style={{ flex: 1, gap: 4, padding: 12 }}><Muted style={{ fontSize: 11 }}>Perforation</Muted><T style={{ fontSize: 20, fontWeight: '700', color: score >= 0.25 ? C.orange : C.text }}>{score == null ? '—' : score.toFixed(2)}</T></Card>
          </View>
          {view === '3D links' && (
            <>
              <ChainLinks3D links={chain.links} onPress={(l) => nav.push('Vendor', { symbol: l.symbol, name: l.name })} />
              <Muted style={{ fontSize: 11, lineHeight: 16 }}>Each link trades separately. Volume is the latest bar against that link's own 60-bar median, so exchanges can be compared.</Muted>
            </>
          )}
          {view === 'Median candles' && (
            <>
              <Candles candles={chain.candles} hitDates={hitDates} window={chain.median_hit.window} />
              <MedianHit hit={chain.median_hit} links={chain.links} nav={nav} />
              <Muted style={{ fontSize: 11, lineHeight: 16 }}>Each candle is the median open, high, low and close across the links, every link rebased to 100.</Muted>
            </>
          )}
          {view === 'Perforation' && (
            <>
              <T style={{ color: C.orange, fontSize: 15 }}>{chain.perforation.label}</T>
              <Perforation chain={chain} weights={data.weights} />
            </>
          )}
          <Muted style={{ fontSize: 11 }}>Data as of {String(data.generated_at).slice(0, 10)}.</Muted>
        </>
      )}
    </Screen>
  );
}
