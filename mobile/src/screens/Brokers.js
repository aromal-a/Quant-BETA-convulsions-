import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { BROKERS, refreshConnections, useConnections } from '../brokers';
import { BROKER_ENV } from '../config';
import { money } from '../format';
import { disconnectBroker } from '../trades';
import { C } from '../theme';
import { Back, Button, Card, Muted, Screen, T, Title } from '../ui';

const input = { height: 46, borderRadius: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, color: C.text, fontSize: 14 };

export default function Brokers({ nav }) {
  const conns = useConnections();
  const [accts, setAccts] = useState({});
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [binOpen, setBinOpen] = useState(false);
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');

  useEffect(() => {
    Object.entries(BROKERS).forEach(([id, b]) => {
      if (!conns[id]) return setAccts((s) => ({ ...s, [id]: null }));
      b.account().then((a) => setAccts((s) => ({ ...s, [id]: a }))).catch((e) => setAccts((s) => ({ ...s, [id]: { error: e.message } })));
    });
  }, [conns.alpaca, conns.upstox, conns.binance]);

  const connect = async (id) => {
    setBusy(id); setErr(null);
    try {
      if (id === 'binance') { await BROKERS.binance.connect({ key: key.trim(), secret: secret.trim() }); setKey(''); setSecret(''); setBinOpen(false); }
      else await BROKERS[id].connect();
      await refreshConnections();
    } catch (e) { setErr({ id, text: e.message }); } finally { setBusy(null); }
  };

  return (
    <Screen>
      <Back onPress={nav.back} />
      <Title>Brokers</Title>
      <Muted style={{ lineHeight: 19 }}>Quant-beam never holds your money. Funds stay with your broker, and logins stay on this phone.</Muted>

      {BROKER_ENV === 'sandbox' && (
        <Card style={{ borderColor: C.orange, gap: 4 }}>
          <T style={{ fontWeight: '600', color: C.orange }}>Sandbox</T>
          <Muted style={{ lineHeight: 18 }}>Alpaca connects to its paper account and Binance to its testnet, so no real money moves. Upstox has no sandbox: you can connect it to see your funds and live prices, but its orders only run in production builds.</Muted>
        </Card>
      )}

      {Object.values(BROKERS).map((b) => {
        const on = !!conns[b.id];
        const a = accts[b.id];
        return (
          <Card key={b.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? C.green : C.line }} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600', fontSize: 16 }}>{b.name}</T>
                <Muted style={{ fontSize: 12 }}>{b.region} · {b.note}</Muted>
              </View>
            </View>
            {on && a && (
              <T style={{ fontSize: 13, color: a.error ? C.red : C.muted }}>
                {a.error ? a.error : `${a.label} · buying power ${money(a.buyingPower, a.currency)}`}
              </T>
            )}
            {b.usesApiKey && !on && binOpen && (
              <View style={{ gap: 8 }}>
                <TextInput style={input} placeholder="API key" placeholderTextColor={C.dim} value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} />
                <TextInput style={input} placeholder="Secret key" placeholderTextColor={C.dim} value={secret} onChangeText={setSecret} autoCapitalize="none" autoCorrect={false} secureTextEntry />
                <Muted style={{ fontSize: 12, lineHeight: 17 }}>
                  {BROKER_ENV === 'sandbox' ? 'Use a testnet key from testnet.binance.vision. ' : ''}Allow Spot trading only. Keep withdrawals OFF. The key stays in this phone's secure storage.
                </Muted>
              </View>
            )}
            {err?.id === b.id && <T style={{ fontSize: 13, color: C.red }}>{err.text}</T>}
            {on ? (
              <Button title="Disconnect" variant="outline" onPress={() => disconnectBroker(b.id)} />
            ) : b.usesApiKey && !binOpen ? (
              <Button title={`Connect ${b.name}`} onPress={() => setBinOpen(true)} />
            ) : (
              <Button title={b.usesApiKey ? 'Save & verify key' : `Connect ${b.name}`} onPress={() => connect(b.id)} loading={busy === b.id} />
            )}
          </Card>
        );
      })}
      <Muted style={{ fontSize: 12, lineHeight: 17 }}>Add money in your broker's own app. Quant-beam reads your buying power and can only place trades. It can never withdraw.</Muted>
    </Screen>
  );
}
