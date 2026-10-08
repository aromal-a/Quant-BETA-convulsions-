import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { BROKER_ENV, LIVE_ENABLED } from './config';
import { C } from './theme';
import { T } from './ui';

const Ctx = createContext({ mode: 'demo', setMode: () => {} });

export function ModeProvider({ children }) {
  const [mode, setModeState] = useState('demo');
  const [ack, setAck] = useState(false);
  useEffect(() => {
    SecureStore.getItemAsync('live.ack').then((v) => setAck(v === '1'));
    SecureStore.getItemAsync('mode').then((v) => { if (v === 'live' && LIVE_ENABLED) setModeState('live'); });
  }, []);

  const apply = (m) => { setModeState(m); SecureStore.setItemAsync('mode', m); };
  const setMode = (m) => {
    if (m === 'demo') return apply('demo');
    if (!LIVE_ENABLED) return Alert.alert('Live trading is off', 'This build only supports Demo.');
    if (ack) return apply('live');
    Alert.alert(
      'Switch to Live?',
      `Live places real orders with your own broker${BROKER_ENV === 'sandbox' ? ' (sandbox: their paper/test accounts, so no real money yet)' : ', using real money. You can lose money'}.\n\nQuant-beam never holds your funds. Signals describe past market behaviour and are not guarantees or advice.`,
      [
        { text: 'Stay in Demo', style: 'cancel' },
        { text: 'I understand', onPress: async () => { await SecureStore.setItemAsync('live.ack', '1'); setAck(true); apply('live'); } },
      ],
    );
  };
  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export const useMode = () => useContext(Ctx);

export function ModeSwitch() {
  const { mode, setMode } = useMode();
  const opts = [
    { key: 'demo', label: 'Demo', bg: C.accent },
    { key: 'live', label: BROKER_ENV === 'sandbox' ? 'Live · sandbox' : 'Live · real money', bg: C.orange },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: C.line }}>
      {opts.map((o) => {
        const on = mode === o.key;
        return (
          <Pressable key={o.key} onPress={() => setMode(o.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? o.bg : 'transparent' }}>
            <T style={{ fontWeight: '600', fontSize: 14, color: on ? C.bg : C.muted }}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}
