import React, { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import Constants from 'expo-constants';
import { BROKERS, useConnections } from '../brokers';
import { BROKER_ENV } from '../config';
import { day } from '../format';
import { deleteAccount, getProfile, signOut } from '../trades';
import { C } from '../theme';
import { Button, Card, Label, Muted, Row, Screen, T, Title } from '../ui';

const PRIVACY = Constants.expoConfig?.extra?.privacyPolicyUrl;

export default function Account({ session, nav }) {
  const user = session.user;
  const conns = useConnections();
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getProfile().then(setProfile).catch(() => {}); }, []);

  const name = profile?.display_name || user.user_metadata?.full_name || user.email;
  const provider = user.app_metadata?.provider ?? 'email';
  const connected = Object.values(BROKERS).filter((b) => conns[b.id]);

  const confirmDelete = () => Alert.alert(
    'Delete account?',
    'This permanently deletes your Quant-beam account, trades, sessions and watchlist, and removes broker logins from this phone. Money held at your broker is not affected.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setBusy(true);
          try { await deleteAccount(); } catch (e) { Alert.alert('Could not delete', e.message); } finally { setBusy(false); }
        },
      },
    ],
  );

  return (
    <Screen>
      <Title>Account</Title>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ fontWeight: '700', color: C.accent, fontSize: 18 }}>{(name || '?')[0].toUpperCase()}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '600', fontSize: 16 }} numberOfLines={1}>{name}</T>
          <Muted numberOfLines={1}>{user.email} · {provider}</Muted>
        </View>
      </Card>

      <Label>Money</Label>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent }} />
          <T style={{ flex: 1, fontSize: 14 }}>Demo wallet</T>
          <Muted>pretend money</Muted>
        </Row>
        <Row last>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: connected.length ? C.green : C.line }} />
          <T style={{ flex: 1, fontSize: 14 }}>Live brokers{BROKER_ENV === 'sandbox' ? ' · sandbox' : ''}</T>
          <Muted>{connected.length ? connected.map((b) => b.name).join(', ') : 'None connected'}</Muted>
        </Row>
      </Card>
      <Button title="Manage brokers" variant="outline" onPress={() => nav.push('Brokers')} />

      <Label>Activity</Label>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row><T style={{ flex: 1, fontSize: 14 }}>Member since</T><Muted>{profile ? day(profile.signed_up_at) : '—'}</Muted></Row>
        <Row><T style={{ flex: 1, fontSize: 14 }}>First trade</T><Muted>{profile?.first_trade_at ? day(profile.first_trade_at) : 'Not yet'}</Muted></Row>
        <Row last><T style={{ flex: 1, fontSize: 14 }}>Trading sessions</T><Muted>{profile?.sessions ?? 0}</Muted></Row>
      </Card>

      <View style={{ gap: 10, marginTop: 6 }}>
        {PRIVACY && <Button title="Privacy policy" variant="outline" onPress={() => Linking.openURL(PRIVACY)} />}
        <Button title="Sign out" variant="outline" onPress={signOut} />
        <Button title="Delete account" variant="danger" onPress={confirmDelete} loading={busy} />
      </View>
      <Muted style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>
        Quant-beam {Constants.expoConfig?.version} · Not financial advice.
      </Muted>
    </Screen>
  );
}
