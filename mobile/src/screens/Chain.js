import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { CHAINS, SEGMENT_ORDER, useChain, useLinks } from '../data';
import { pct, signedPct, tone } from '../format';
import { C } from '../theme';
import { Card, Chip, Label, Loading, Muted, Screen, T, Title } from '../ui';

export default function Chain({ nav }) {
  const { data, error, reload } = useChain();
  const [group, setGroup] = useState('oil');
  const links = useLinks();
  const companyChains = useMemo(() => Object.entries(links.data?.chains ?? {}).filter(([code]) => !SEGMENT_ORDER.includes(code)), [links.data]);
  const rows = useMemo(() => (data ? CHAINS[group].filter((c) => data.segments[c]).map((c) => ({ code: c, ...data.segments[c] })) : []), [data, group]);

  return (
    <Screen>
      <Title>Value chain</Title>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Chip label="Oil" active={group === 'oil'} onPress={() => setGroup('oil')} />
        <Chip label="Lithium" active={group === 'lithium'} onPress={() => setGroup('lithium')} />
        <Chip label={data ? `All ${data.companies.length}` : 'All'} active={group === 'all'} onPress={() => setGroup('all')} />
      </View>
      {!data ? <Loading error={error} onRetry={reload} /> : (
        <>
          <View style={{ flexDirection: 'row', paddingHorizontal: 4 }}>
            <Muted style={{ flex: 1, fontSize: 11 }}>Segment · well → wheel</Muted>
            <Muted style={{ width: 70, textAlign: 'right', fontSize: 11 }}>Op. margin</Muted>
            <Muted style={{ width: 62, textAlign: 'right', fontSize: 11 }}>Price 1y</Muted>
          </View>
          <View style={{ gap: 6 }}>
            {rows.map((s) => (
              <Card key={s.code} onPress={() => nav.push('Segment', { code: s.code })} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T style={{ fontSize: 14 }}>{s.name}</T>
                  {s.leaking?.length > 0 && <T style={{ fontSize: 11, color: C.orange }}>{s.leaking.length} leaking</T>}
                </View>
                <T style={{ width: 70, textAlign: 'right', fontSize: 14, fontVariant: ['tabular-nums'] }}>{pct(s.median_operating_margin)}</T>
                <T style={{ width: 62, textAlign: 'right', fontSize: 14, color: tone(s.median_return_1y), fontVariant: ['tabular-nums'] }}>{signedPct(s.median_return_1y)}</T>
              </Card>
            ))}
          </View>
          <Muted style={{ fontSize: 11, lineHeight: 16 }}>Segment medians, latest quarter. Describes now; it hasn't been back-tested.</Muted>
          {companyChains.length > 0 && (
            <View style={{ gap: 6, marginTop: 6 }}>
              <Label>Company chains</Label>
              {companyChains.map(([code, c]) => (
                <Card key={code} onPress={() => nav.push('Links', { code })} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T style={{ fontSize: 14 }}>{c.name}</T>
                    <T style={{ fontSize: 11, color: c.sell_links ? C.orange : C.muted }}>{c.link_count} links · {c.sell_links} under sell pressure</T>
                  </View>
                  <T style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>{c.perforation?.score == null ? '—' : c.perforation.score.toFixed(2)}</T>
                </Card>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
