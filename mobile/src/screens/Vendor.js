import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { Sparkline } from '../Beam';
import { BOT_SEGMENTS, CHAINS, isLeak, opChange, opMargin, useChain } from '../data';
import { useLivePrice } from '../live';
import { brokerFor, useConnections } from '../brokers';
import { BROKER_ENV, MIN_ORDER_USD } from '../config';
import { ModeSwitch, useMode } from '../mode';
import { COUNTRY, alignmentLabel, money, pct, pt, qtyText, signedPct, tone } from '../format';
import { getWatchlist, listTrades, placeOrder, positionsFrom, setWatched } from '../trades';
import { C } from '../theme';
import { Back, Button, Card, Label, LiveBadge, Muted, Row, Screen, T } from '../ui';

const stepBtn = { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' };

export default function Vendor({ nav, params }) {
  const { symbol } = params;
  const { data } = useChain();
  const c = data?.companies?.find((x) => x.symbol === symbol);
  const lp = useLivePrice(symbol);
  const { mode } = useMode();
  const conns = useConnections();
  const broker = mode === 'live' ? brokerFor(symbol) : null;
  const connected = !!broker && !!conns[broker.id];
  const fractional = mode === 'demo' || !!broker?.fractional;

  const [side, setSide] = useState(params.side === 'sell' ? 'sell' : 'buy');
  const [unit, setUnit] = useState('amount');
  const [value, setValue] = useState('10');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [holding, setHolding] = useState(null);
  const [watched, setWatchedState] = useState(false);
  const [acct, setAcct] = useState(null);
  const [minN, setMinN] = useState(null);

  useEffect(() => { if (!fractional) { setUnit('shares'); setValue('1'); } }, [fractional]);

  const refresh = useCallback(async () => {
    const [trades, wl] = await Promise.all([listTrades(mode, symbol), getWatchlist()]);
    setHolding(positionsFrom(trades)[0] ?? null);
    setWatchedState(wl.includes(symbol));
    if (connected) {
      broker.account().then(setAcct).catch((e) => setAcct({ error: e.message }));
      broker.minNotional?.(symbol).then(setMinN).catch(() => {});
    } else { setAcct(null); setMinN(null); }
  }, [symbol, mode, connected]);
  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const price = lp.price;
  const cur = lp.currency || 'USD';
  const n = parseFloat(value);
  const valid = isFinite(n) && n > 0;
  const qty = valid && price ? (unit === 'amount' ? n / price : n) : null;
  const notional = qty != null ? qty * price : null;
  const held = holding?.qty ?? 0;
  const minUsd = Math.max(MIN_ORDER_USD, minN ?? 0);
  const chg = price && lp.prev ? price / lp.prev - 1 : null;
  const needsConnect = mode === 'live' && !!broker && !connected;

  const problem = (() => {
    if (mode === 'live' && !broker) return `${symbol} can't be traded live yet. Switch to Demo.`;
    if (needsConnect) return null;
    if (!price) return 'Waiting for a price…';
    if (!valid) return 'Enter an amount.';
    if (!fractional && !Number.isInteger(n)) return 'Whole shares only on this broker.';
    if (cur === 'USD' && notional < minUsd) return `Minimum order is ${money(minUsd)}.`;
    if (side === 'buy' && acct?.buyingPower != null && notional > acct.buyingPower)
      return `Not enough buying power (${money(acct.buyingPower, acct.currency)}). Add funds in ${broker.name}.`;
    if (side === 'sell' && mode === 'demo' && qty > held + 1e-9) return `You hold ${qtyText(held)} in Demo.`;
    return null;
  })();

  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await placeOrder({
        mode, symbol, side, price, currency: cur, company: c,
        qty: unit === 'shares' ? qty : undefined,
        notional: unit === 'amount' ? notional : undefined,
      });
      if (r.state === 'filled') setMsg({ text: `Filled · ${side} ${qtyText(r.qty)} at ${money(r.price, cur)}` });
      else if (r.state === 'pending') setMsg({ text: 'Sent to your broker. Waiting for a fill (the market may be closed). It appears in Trades once filled.' });
      else setMsg({ error: true, text: `Rejected by broker: ${r.reason}` });
      await refresh();
    } catch (e) { setMsg({ error: true, text: e.message }); } finally { setBusy(false); }
  };

  const place = () => {
    if (needsConnect) return nav.push('Brokers');
    if (problem) return;
    const real = mode === 'live';
    const where = real ? `${broker.name}${BROKER_ENV === 'sandbox' ? ' · paper/test account' : ' · REAL MONEY'}` : 'Demo wallet · pretend money';
    Alert.alert(
      `${real ? 'Live' : 'Demo'} ${side} · ${symbol}`,
      `${qtyText(qty)} × ~${money(price, cur)} = ${money(notional, cur)}\n${where}${real ? '\nMarket order: fills at the next available price.' : ''}`,
      [{ text: 'Cancel', style: 'cancel' }, { text: side === 'buy' ? 'Buy' : 'Sell', style: side === 'sell' ? 'destructive' : 'default', onPress: submit }],
    );
  };

  const step = unit === 'amount' ? 5 : 1;
  const bump = (d) => setValue(String(Math.max(unit === 'amount' ? 2 : 1, +((valid ? n : 0) + d).toFixed(4))));

  const toggleWatch = async () => {
    const next = !watched;
    setWatchedState(next);
    try { await setWatched(symbol, next); } catch (e) { setWatchedState(!next); Alert.alert('Watchlist', e.message); }
  };

  const chainPos = useMemo(() => {
    if (!c || !data) return null;
    const order = ['lithium', 'batteries'].includes(c.segment) ? CHAINS.lithium : CHAINS.oil;
    const i = order.indexOf(c.segment);
    const name = (k) => data.segments[k]?.name.split(' (')[0];
    return { prev: i > 0 ? name(order[i - 1]) : null, here: name(c.segment), next: i < order.length - 1 ? name(order[i + 1]) : null };
  }, [c, data]);

  const al = alignmentLabel(c?.alignment);
  const inBot = c && BOT_SEGMENTS.includes(c.segment) && c.country === 'US';
  const live = mode === 'live';

  return (
    <Screen>
      <Back onPress={nav.back} />
      <View>
        <Muted>{symbol}{c ? ` · ${c.segment_name} · ${COUNTRY[c.country] ?? c.country}` : ''}</Muted>
        <T style={{ fontSize: 26, fontWeight: '700', letterSpacing: -0.4, marginTop: 2 }}>{c?.name ?? params.name ?? symbol}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <T style={{ fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{price ? money(price, cur) : '—'}</T>
        {chg != null && <T style={{ color: tone(chg), fontSize: 14 }}>{signedPct(chg, 2)}</T>}
        {lp.source && <LiveBadge marketTime={lp.marketTime} streaming={lp.streaming} source={lp.source} />}
      </View>
      {lp.error && !price && <T style={{ color: C.red, fontSize: 13 }}>Price feed: {lp.error}</T>}

      <Card style={{ padding: 12 }}>
        {lp.closes.length > 1 ? <Sparkline values={lp.closes} height={120} /> : (
          <View style={{ height: 120, justifyContent: 'center' }}><Muted style={{ textAlign: 'center' }}>{price ? 'No intraday ticks yet' : 'Loading price…'}</Muted></View>
        )}
      </Card>

      {c && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Card style={{ flex: 1, gap: 2 }}>
            <Muted style={{ fontSize: 12 }}>Operating margin</Muted>
            <T style={{ fontSize: 20, fontWeight: '700' }}>{pct(opMargin(c))}</T>
            <T style={{ fontSize: 12, color: isLeak(c) ? C.orange : tone(opChange(c)) }}>{pt(opChange(c))} vs a year ago</T>
          </Card>
          <Card style={{ flex: 1, gap: 2 }}>
            <Muted style={{ fontSize: 12 }}>Price vs margins</Muted>
            <T style={{ fontSize: 20, fontWeight: '700', color: al.color }}>{al.text.split(' ')[0]}</T>
            <Muted style={{ fontSize: 12 }}>{al.text}</Muted>
          </Card>
        </View>
      )}

      <Label>Trade</Label>
      <ModeSwitch />
      <Card style={{ gap: 12, borderColor: live ? C.orange : C.line }}>
        <View style={{ flexDirection: 'row', backgroundColor: C.bg, borderRadius: 10, padding: 3 }}>
          {['buy', 'sell'].map((s) => (
            <Pressable key={s} onPress={() => setSide(s)} style={{ flex: 1, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: side === s ? (s === 'buy' ? C.green : C.red) : 'transparent' }}>
              <T style={{ fontWeight: '600', color: side === s ? C.bg : C.muted }}>{s === 'buy' ? 'Buy' : 'Sell'}</T>
            </Pressable>
          ))}
        </View>

        {fractional && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[['amount', `Amount (${cur})`], ['shares', 'Shares']].map(([k, l]) => (
              <Pressable key={k} onPress={() => { setUnit(k); setValue(k === 'amount' ? '10' : '1'); }}
                style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: unit === k ? C.accent : C.line, backgroundColor: unit === k ? C.accentSoft : 'transparent' }}>
                <T style={{ fontSize: 13 }}>{l}</T>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Muted style={{ flex: 1 }}>{unit === 'amount' ? 'Amount' : 'Quantity'}</Muted>
          <Pressable onPress={() => bump(-step)} style={stepBtn}><T style={{ fontSize: 20 }}>−</T></Pressable>
          <TextInput value={value} onChangeText={setValue} keyboardType="decimal-pad" selectTextOnFocus
            style={{ width: 90, height: 44, borderRadius: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, color: C.text, textAlign: 'center', fontSize: 17, fontVariant: ['tabular-nums'] }} />
          <Pressable onPress={() => bump(step)} style={stepBtn}><T style={{ fontSize: 20 }}>+</T></Pressable>
        </View>

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Muted>{unit === 'amount' ? 'Est. shares' : 'Est. total'}</Muted>
            <T style={{ fontVariant: ['tabular-nums'] }}>{qty == null ? '—' : unit === 'amount' ? qtyText(+qty.toFixed(6)) : money(notional, cur)}</T>
          </View>
          {live && connected && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Muted>Buying power · {broker.name}</Muted>
              <T style={{ fontVariant: ['tabular-nums'], color: acct?.error ? C.red : C.text }}>{acct?.error ? 'error' : acct ? money(acct.buyingPower, acct.currency) : '…'}</T>
            </View>
          )}
          {cur === 'USD' && <Muted style={{ fontSize: 12 }}>Minimum {money(minUsd)} per order</Muted>}
        </View>

        <Button
          title={needsConnect ? `Connect ${broker.name} to trade live` : `${live ? 'Place live' : 'Place demo'} ${side}`}
          variant={needsConnect ? 'primary' : side}
          onPress={place}
          disabled={!needsConnect && !!problem}
          loading={busy}
        />
        {problem && !msg && <T style={{ fontSize: 13, color: C.muted }}>{problem}</T>}
        {msg && <T style={{ fontSize: 13, lineHeight: 18, color: msg.error ? C.red : C.green }}>{msg.text}</T>}
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row>
          <T style={{ flex: 1, fontSize: 14 }}>You hold · {live ? 'Live' : 'Demo'}</T>
          <Muted>{held > 1e-9 ? `${qtyText(+held.toFixed(6))} @ ${money(holding.avg, holding.currency)}` : 'None'}</Muted>
        </Row>
        {chainPos && (
          <Row>
            <T style={{ fontSize: 14 }}>Chain</T>
            <Muted style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
              {chainPos.prev ? `${chainPos.prev} → ` : ''}<T style={{ fontSize: 13 }}>{chainPos.here}</T>{chainPos.next ? ` → ${chainPos.next}` : ''}
            </Muted>
          </Row>
        )}
        <Row last>
          <T style={{ flex: 1, fontSize: 14 }}>In paper bot universe</T>
          <Muted>{inBot ? 'Yes · USD wallet' : 'No'}</Muted>
        </Row>
      </Card>

      <Button title={watched ? 'On your watchlist ✓' : 'Add to watchlist'} variant="outline" onPress={toggleWatch} />
    </Screen>
  );
}
