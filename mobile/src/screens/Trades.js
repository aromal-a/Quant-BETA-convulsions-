import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useChain } from '../data';
import { useLivePrice } from '../live';
import { ModeSwitch, useMode } from '../mode';
import { clock, day, money, qtyText, signedPct, tone } from '../format';
import { analyse, endSession, groupOutcomes, listTrades, openSession, pendingCount, reconcilePending, subscribeTrades } from '../trades';
import { C } from '../theme';
import { Button, Card, Label, Loading, Muted, Row, Screen, T, Title } from '../ui';

const STATE_LABEL = { expanding: 'Margins expanding', contracting: 'Margins shrinking', leak: 'Margin leak', none: 'No chain data' };

function PositionRow({ p, last, nav, name }) {
  const lp = useLivePrice(p.symbol);
  const pnl = lp.price ? (lp.price - p.avg) * p.qty : null;
  return (
    <Row last={last}>
      <View style={{ flex: 1 }}>
        <T style={{ fontWeight: '600' }} onPress={() => nav.push('Vendor', { symbol: p.symbol })}>{name}</T>
        <Muted style={{ fontSize: 12 }}>{qtyText(+p.qty.toFixed(6))} × {money(p.avg, p.currency)}{lp.streaming ? ' · live' : ''}</Muted>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T style={{ fontVariant: ['tabular-nums'] }}>{lp.price ? money(lp.price * p.qty, p.currency) : '—'}</T>
        <T style={{ fontSize: 12, color: tone(pnl) }}>{pnl == null ? 'loading' : `${pnl >= 0 ? '+' : '−'}${money(Math.abs(pnl), p.currency)}`}</T>
      </View>
    </Row>
  );
}

function Outcomes({ rows, labelOf }) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Row style={{ paddingVertical: 8 }}>
        <Muted style={{ flex: 1, fontSize: 11 }}>Closed trades</Muted>
        <Muted style={{ width: 56, textAlign: 'right', fontSize: 11 }}>Win rate</Muted>
        <Muted style={{ width: 64, textAlign: 'right', fontSize: 11 }}>Avg return</Muted>
      </Row>
      {rows.map((r, i) => (
        <Row key={r.key} last={i === rows.length - 1}>
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 14 }} numberOfLines={1}>{labelOf(r.key)}</T>
            <Muted style={{ fontSize: 12 }}>{r.n} closed · {r.wins} won</Muted>
          </View>
          <T style={{ width: 56, textAlign: 'right', fontVariant: ['tabular-nums'], color: r.winRate >= 0.5 ? C.green : C.red }}>{Math.round(r.winRate * 100)}%</T>
          <T style={{ width: 64, textAlign: 'right', fontVariant: ['tabular-nums'], color: tone(r.avgRet) }}>{signedPct(r.avgRet, 1)}</T>
        </Row>
      ))}
    </Card>
  );
}

export default function Trades({ nav, userId }) {
  const { mode } = useMode();
  const [trades, setTrades] = useState(null);
  const [session, setSession] = useState(null);
  const [pending, setPending] = useState(0);
  const [err, setErr] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const { data: chain } = useChain();

  const load = useCallback(async () => {
    try {
      if (mode === 'live') { await reconcilePending().catch(() => {}); setPending(await pendingCount()); }
      const [t, s] = await Promise.all([listTrades(mode), openSession(mode)]);
      setTrades(t); setSession(s); setErr(null);
    } catch (e) { setErr(e.message); }
  }, [mode]);

  useEffect(() => { setTrades(null); load(); return subscribeTrades(userId, load); }, [userId, load]);

  const { positions, closed } = useMemo(() => analyse(trades || []), [trades]);
  const open = positions.filter((p) => p.qty > 1e-9);
  const bySeg = useMemo(() => groupOutcomes(closed, 'segment'), [closed]);
  const byState = useMemo(() => groupOutcomes(closed, 'state'), [closed]);
  const nameOf = (s) => chain?.companies?.find((c) => c.symbol === s)?.name ?? s;
  const segName = (k) => (k === 'none' ? 'Outside the chain' : chain?.segments?.[k]?.name ?? k);

  const end = () => Alert.alert('End session?', 'Your next trade will start a new session.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'End session', style: 'destructive', onPress: () => endSession(mode).then(load).catch((e) => Alert.alert('Error', e.message)) },
  ]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Title>Trades</Title>
      <ModeSwitch />
      {!trades ? <Loading error={err} onRetry={load} /> : (
        <>
          {pending > 0 && <Card style={{ borderColor: C.orange }}><T style={{ color: C.orange, fontSize: 14 }}>{pending} order{pending > 1 ? 's' : ''} waiting at your broker. Pull down to check.</T></Card>}

          <Card selected={!!session} style={{ gap: 10 }}>
            {session ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }} />
                  <T style={{ fontWeight: '600', flex: 1 }}>{mode === 'live' ? 'Live' : 'Demo'} session since {clock(session.started_at)}</T>
                </View>
                <Muted>{session.trade_count} trade{session.trade_count === 1 ? '' : 's'} · last at {clock(session.last_trade_at)} · closes after 30 min idle</Muted>
                <Button title="End session" variant="outline" onPress={end} />
              </>
            ) : (
              <>
                <T style={{ fontWeight: '600' }}>No open {mode} session</T>
                <Muted>Your next {mode} trade starts one.</Muted>
                <Button title="Browse the value chain" variant="outline" onPress={() => nav.switchTab('chain')} />
              </>
            )}
          </Card>

          <Label>Positions</Label>
          {open.length === 0 ? <Muted>No open positions.</Muted> : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {open.map((p, i) => <PositionRow key={p.symbol} p={p} last={i === open.length - 1} nav={nav} name={nameOf(p.symbol)} />)}
            </Card>
          )}

          <Label>Wins & losses by chain</Label>
          {closed.length === 0 ? (
            <Muted style={{ lineHeight: 19 }}>Sell a position to see which chain segments and margin trends win for you{mode === 'demo' ? ', then compare it with Live' : ''}.</Muted>
          ) : (
            <>
              <Outcomes rows={bySeg} labelOf={segName} />
              <Muted style={{ fontSize: 12 }}>By margin trend when you bought</Muted>
              <Outcomes rows={byState} labelOf={(k) => STATE_LABEL[k] ?? k} />
            </>
          )}

          <Label>History</Label>
          {trades.length === 0 ? <Muted>No {mode} trades yet.</Muted> : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {trades.slice(0, 50).map((t, i, arr) => (
                <Row key={t.id} last={i === arr.length - 1}>
                  <T style={{ width: 40, fontSize: 12, fontWeight: '700', color: t.side === 'buy' ? C.green : C.red }}>{t.side.toUpperCase()}</T>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontSize: 14 }}>{t.symbol}</T>
                    <Muted style={{ fontSize: 12 }}>{day(t.placed_at)} {clock(t.placed_at)}{t.broker_order_id ? ' · broker fill' : ''}</Muted>
                  </View>
                  <T style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>{qtyText(+(+t.qty).toFixed(6))} @ {money(+t.price, t.currency || 'USD')}</T>
                </Row>
              ))}
            </Card>
          )}
          <Muted style={{ fontSize: 12 }}>{mode === 'demo' ? 'Demo uses pretend money, so you can learn how the market reacts.' : 'Live shows fills reported by your broker. Your broker app is the record of truth.'}</Muted>
        </>
      )}
    </Screen>
  );
}
