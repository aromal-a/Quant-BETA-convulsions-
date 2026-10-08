import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SEGMENT_ORDER, isLeak, opChange, opMargin, useChain } from '../data';
import { COUNTRY, alignmentLabel, pct, pt } from '../format';
import { C } from '../theme';
import { Back, Card, Chip, Label, Loading, Muted, Screen, T, Title } from '../ui';

const FILTERS = { All: () => true, US: (c) => c.country === 'US', India: (c) => c.country === 'IN', Leaking: isLeak };

export default function Segment({ nav, params }) {
  const { data, error, reload } = useChain();
  const [filter, setFilter] = useState('All');
  const seg = data?.segments?.[params.code];
  const list = useMemo(() => (data ? data.companies
    .filter((c) => c.segment === params.code && FILTERS[filter](c))
    .sort((a, b) => (opMargin(b) ?? -9) - (opMargin(a) ?? -9)) : []), [data, params.code, filter]);
  const index = SEGMENT_ORDER.indexOf(params.code) + 1;

  return (
    <Screen>
      <Back onPress={nav.back} />
      {!data ? <Loading error={error} onRetry={reload} /> : (
        <>
          <View style={{ gap: 4 }}>
            <Label>{`Segment ${index} of ${SEGMENT_ORDER.length}`}</Label>
            <Title>{seg?.name ?? params.code}</Title>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {Object.keys(FILTERS).map((f) => <Chip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />)}
          </View>
          <Card onPress={() => nav.push('Links', { code: params.code })} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
            <T style={{ fontSize: 14 }}>3D links · median candles · perforation</T><T style={{ color: C.accent, fontWeight: '600' }}>›</T>
          </Card>
          <View style={{ gap: 6 }}>
            {list.length === 0 && <Muted style={{ paddingVertical: 20, textAlign: 'center' }}>No companies match this filter.</Muted>}
            {list.map((c) => {
              const ch = opChange(c), al = alignmentLabel(c.alignment), leak = isLeak(c);
              return (
                <Card key={c.symbol} onPress={() => nav.push('Vendor', { symbol: c.symbol })} style={{ gap: 3, paddingVertical: 11, paddingHorizontal: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <T style={{ fontWeight: '600', flex: 1 }} numberOfLines={1}>{c.name}</T>
                    <T style={{ fontVariant: ['tabular-nums'] }}>{pct(opMargin(c))}</T>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Muted style={{ fontSize: 12 }}>{c.symbol} · {COUNTRY[c.country] ?? c.country}</Muted>
                    <T style={{ fontSize: 12, color: leak ? C.orange : al.color }}>{pt(ch)} · {leak ? 'leak' : al.text}</T>
                  </View>
                </Card>
              );
            })}
          </View>
          <Muted style={{ fontSize: 11 }}>Operating margin, latest quarter vs. a year earlier.</Muted>
        </>
      )}
    </Screen>
  );
}
