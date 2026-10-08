import React, { useState } from 'react';
import { View } from 'react-native';
import Beam from '../Beam';
import { useChain } from '../data';
import { useLivePrice } from '../live';
import { clock, day, money, signedPct, tone } from '../format';
import { C } from '../theme';
import { Button, Card, Chip, Label, LiveBadge, Muted, Row, Screen, T } from '../ui';

const INDICES = [
  { symbol: '^NSEI', name: 'NIFTY 50' },
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: 'BTC-USD', name: 'Bitcoin', tradable: true },
];

function Stage({ name, status, color, dot }) {
  return (
    <>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <T style={{ flex: 1, fontSize: 14 }}>{name}</T>
      <T style={{ fontSize: 12, color }}>{status}</T>
    </>
  );
}

export default function Markets({ nav }) {
  const [sel, setSel] = useState(0);
  const m = INDICES[sel];
  const lp = useLivePrice(m.symbol);
  const chain = useChain();
  const chg = lp.price && lp.prev ? lp.price / lp.prev - 1 : null;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {INDICES.map((x, i) => <Chip key={x.symbol} label={x.name} active={i === sel} onPress={() => setSel(i)} />)}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Muted>{m.name} · {m.symbol}</Muted>
          <T style={{ fontSize: 34, fontWeight: '700', letterSpacing: -0.6, fontVariant: ['tabular-nums'] }}>{lp.price ? money(lp.price, lp.currency) : '—'}</T>
          {chg != null && <T style={{ fontSize: 14, color: tone(chg) }}>{signedPct(chg, 2)} today</T>}
        </View>
        {lp.source && <LiveBadge marketTime={lp.marketTime} streaming={lp.streaming} source={lp.source} />}
      </View>

      <Card style={{ padding: 12, gap: 6 }}>
        <Beam height={200} seed={sel} />
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: C.accent }} /><Muted style={{ fontSize: 11 }}>|ψ(z,t)|²</Muted></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: C.normal }} /><Muted style={{ fontSize: 11 }}>normal</Muted></View>
        </View>
      </Card>

      {m.tradable && <Button title={`Trade ${m.name}`} onPress={() => nav.push('Vendor', { symbol: m.symbol, name: m.name })} />}

      <Label>Market pipeline</Label>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row>
          <Stage name={`price · ${lp.source ?? 'connecting'}`}
            dot={lp.error && !lp.price ? C.red : lp.streaming ? C.green : lp.price ? C.orange : C.line}
            color={lp.error && !lp.price ? C.red : C.muted}
            status={lp.error && !lp.price ? 'error' : lp.streaming ? 'streaming' : lp.price ? 'polling' : 'loading'} />
        </Row>
        <Row>
          <Stage name="value chain · oil_chain.json"
            dot={chain.error ? C.red : chain.data ? C.green : C.line}
            color={chain.error ? C.red : C.muted}
            status={chain.error ? 'unavailable' : chain.data ? `${chain.data.companies.length} cos · ${day(chain.data.generated_at)}` : 'loading'} />
        </Row>
        <Row last>
          <Stage name="quantum · 16 states" dot={C.accent} color={C.accent} status="simulated" />
        </Row>
      </Card>
      <Muted style={{ fontSize: 12, lineHeight: 17 }}>Prices stream live for crypto and for stocks once a broker is connected; otherwise they refresh every 15 s. The beam is simulated until the quantum feed is connected. It describes the past, not a prediction.</Muted>
    </Screen>
  );
}
