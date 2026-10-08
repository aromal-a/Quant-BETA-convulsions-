import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { supabase, handleAuthUrl } from './src/supabase';
import { onSignedIn } from './src/trades';
import { C } from './src/theme';
import { T } from './src/ui';
import SignIn, { NewPassword } from './src/screens/SignIn';
import Markets from './src/screens/Markets';
import Chain from './src/screens/Chain';
import Segment from './src/screens/Segment';
import Vendor from './src/screens/Vendor';
import Links from './src/screens/Links';
import Trades from './src/screens/Trades';
import Account from './src/screens/Account';
import Brokers from './src/screens/Brokers';
import { ModeProvider } from './src/mode';

const TABS = [
  { key: 'markets', label: 'Markets', root: 'Markets', round: false },
  { key: 'chain', label: 'Chain', root: 'Chain', round: false },
  { key: 'trades', label: 'Trades', root: 'Trades', round: false },
  { key: 'account', label: 'Account', root: 'Account', round: true },
];
const SCREENS = { Markets, Chain, Segment, Vendor, Links, Trades, Account, Brokers };
const freshStacks = () => Object.fromEntries(TABS.map((t) => [t.key, [{ name: t.root, params: {} }]]));

function TabBar({ tab, onPress }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) }}>
      {TABS.map((t) => {
        const on = t.key === tab;
        return (
          <Pressable key={t.key} onPress={() => onPress(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, alignItems: 'center', gap: 5, minHeight: 44 }}>
            <View style={{ width: 22, height: 22, borderRadius: t.round ? 11 : 6, backgroundColor: on ? C.accent : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: C.muted }} />
            <T style={{ fontSize: 11, color: on ? C.accent : C.muted }}>{t.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

function Main({ session }) {
  const [tab, setTab] = useState('markets');
  const [stacks, setStacks] = useState(freshStacks);

  const nav = useCallback((tabKey) => ({
    push: (name, params = {}) => setStacks((s) => ({ ...s, [tabKey]: [...s[tabKey], { name, params }] })),
    back: () => setStacks((s) => (s[tabKey].length > 1 ? { ...s, [tabKey]: s[tabKey].slice(0, -1) } : s)),
    switchTab: setTab,
  }), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stacks[tab].length > 1) { nav(tab).back(); return true; }
      if (tab !== 'markets') { setTab('markets'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [stacks, tab, nav]);

  const pressTab = (key) => {
    if (key === tab) setStacks((s) => ({ ...s, [key]: s[key].slice(0, 1) }));
    setTab(key);
  };

  return (
    <View style={{ flex: 1 }}>
      {TABS.map((t) => {
        const stack = stacks[t.key];
        const route = stack[stack.length - 1];
        const Screen = SCREENS[route.name];
        return (
          <View key={t.key} style={{ flex: 1, display: t.key === tab ? 'flex' : 'none' }}>
            <Screen key={`${route.name}-${stack.length}`} nav={nav(t.key)} params={route.params} session={session} userId={session.user.id} />
          </View>
        );
      })}
      <TabBar tab={tab} onPress={pressTab} />
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_IN' && s) setTimeout(() => onSignedIn(s.user).catch(() => {}), 0);
    });
    const onUrl = (url) => handleAuthUrl(url).catch(() => {});
    const linkSub = Linking.addEventListener('url', ({ url }) => onUrl(url));
    Linking.getInitialURL().then(onUrl);
    return () => { sub.subscription.unsubscribe(); linkSub.remove(); };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: C.bg }}>
        {session === undefined ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : !session ? <SignIn />
          : recovery ? <NewPassword onDone={() => setRecovery(false)} />
          : <ModeProvider key={session.user.id}><Main session={session} /></ModeProvider>}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
