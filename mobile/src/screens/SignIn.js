import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { supabase, authRedirect, handleAuthUrl, configured } from '../supabase';
import { C } from '../theme';
import { Button, Muted, Screen, T } from '../ui';

WebBrowser.maybeCompleteAuthSession();

function Field(props) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      placeholderTextColor={C.dim}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        height: 50, borderRadius: 12, backgroundColor: C.card, borderWidth: focus ? 1.5 : 1,
        borderColor: focus ? C.accent : C.line, paddingHorizontal: 14, fontSize: 16, color: C.text,
      }}
      {...props}
    />
  );
}

export default function SignIn() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const [apple, setApple] = useState(false);

  useEffect(() => { if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setApple); }, []);

  const run = (key, fn) => async () => {
    setBusy(key); setNote(null);
    try { await fn(); } catch (e) { if (e?.code !== 'ERR_REQUEST_CANCELED') setNote({ error: true, text: e.message || String(e) }); }
    finally { setBusy(null); }
  };

  const withEmail = run('email', async () => {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) throw new Error('Enter a valid email.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email: e, password, options: { emailRedirectTo: authRedirect() } });
      if (error) throw error;
      if (!data.session) setNote({ text: `Check ${e} and tap the link to confirm your account.` });
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: e, password });
      if (error) throw error;
    }
  });

  const withApple = run('apple', async () => {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!cred.identityToken) throw new Error('Apple did not return a token.');
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken });
    if (error) throw error;
    const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
    if (name) await supabase.auth.updateUser({ data: { full_name: name } });
  });

  const withGoogle = run('google', async () => {
    const redirectTo = authRedirect();
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
    if (error) throw error;
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type === 'success') await handleAuthUrl(res.url);
  });

  const forgot = run('forgot', async () => {
    const e = email.trim().toLowerCase();
    if (!e) throw new Error('Enter your email first.');
    const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo: authRedirect() });
    if (error) throw error;
    setNote({ text: `If ${e} has an account, a reset link is on its way.` });
  });

  if (!configured) {
    return (
      <Screen>
        <T style={{ fontSize: 22, fontWeight: '700', marginTop: 40 }}>Supabase isn't configured</T>
        <Muted>Fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env, then restart with npx expo start -c.</Muted>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen>
        <T style={{ fontSize: 20, fontWeight: '700', marginTop: 12 }}><T style={{ color: C.accent, fontSize: 20 }}>ø</T> Quant-beam</T>
        <View style={{ gap: 8, marginTop: 12 }}>
          <T style={{ fontSize: 32, fontWeight: '700', letterSpacing: -0.6 }}>{mode === 'signup' ? 'Create account' : 'Sign in'}</T>
          <Muted style={{ fontSize: 15, lineHeight: 21 }}>Your watchlist, paper trades and sessions sync across devices.</Muted>
        </View>

        <View style={{ gap: 10 }}>
          {apple && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={mode === 'signup' ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={14}
              style={{ height: 52 }}
              onPress={withApple}
            />
          )}
          <Button title="Continue with Google" variant="outline" onPress={withGoogle} loading={busy === 'google'} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
          <Muted style={{ fontSize: 12, color: C.dim }}>or with email</Muted>
          <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
        </View>

        <View style={{ gap: 10 }}>
          <Field placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
          <Field placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} textContentType={mode === 'signup' ? 'newPassword' : 'password'} />
          {mode === 'signin' && (
            <Pressable onPress={forgot} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
              <T style={{ fontSize: 13, color: C.accent }}>Forgot password?</T>
            </Pressable>
          )}
          <Button title={mode === 'signup' ? 'Create account' : 'Sign in'} onPress={withEmail} loading={busy === 'email'} />
        </View>

        {note && <T style={{ fontSize: 14, lineHeight: 20, color: note.error ? C.red : C.green }}>{note.text}</T>}

        <Pressable onPress={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setNote(null); }} style={{ alignItems: 'center', paddingVertical: 12 }}>
          <Muted>
            {mode === 'signup' ? 'Already have an account? ' : 'New here? '}
            <T style={{ fontWeight: '600', fontSize: 13 }}>{mode === 'signup' ? 'Sign in' : 'Create account'}</T>
          </Muted>
        </Pressable>
        <Muted style={{ fontSize: 12, textAlign: 'center', color: C.dim }}>Paper trading with pretend money. Not financial advice.</Muted>
      </Screen>
    </KeyboardAvoidingView>
  );
}

export function NewPassword({ onDone }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (pw.length < 8) return Alert.alert('Too short', 'Use at least 8 characters.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return Alert.alert('Could not update', error.message);
    onDone();
  };
  return (
    <Screen>
      <T style={{ fontSize: 30, fontWeight: '700', marginTop: 24 }}>Set a new password</T>
      <Field placeholder="New password" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <Button title="Save password" onPress={save} loading={busy} />
    </Screen>
  );
}
