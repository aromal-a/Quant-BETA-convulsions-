import React from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { C } from './theme';

export const T = ({ style, ...p }) => <Text style={[{ color: C.text, fontSize: 15 }, style]} {...p} />;
export const Muted = ({ style, ...p }) => <T style={[{ color: C.muted, fontSize: 13 }, style]} {...p} />;
export const Label = ({ children }) => (
  <T style={{ fontSize: 12, fontWeight: '600', color: C.muted, letterSpacing: 0.5 }}>{String(children).toUpperCase()}</T>
);
export const Title = ({ children, style }) => (
  <T style={[{ fontSize: 26, fontWeight: '700', letterSpacing: -0.4 }, style]}>{children}</T>
);

export function Screen({ children, refreshing = false, onRefresh }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 14, paddingBottom: 32 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress, selected }) {
  const base = {
    borderRadius: 14,
    backgroundColor: selected ? C.accentSoft : C.card,
    borderWidth: selected ? 1.5 : 1,
    borderColor: selected ? C.accent : C.line,
    padding: 14,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, style, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  );
}

export function Row({ children, style, last }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
      !last && { borderBottomWidth: 1, borderBottomColor: C.line }, style]}>
      {children}
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, style }) {
  const v = {
    primary: { bg: C.accent, fg: C.bg, border: C.accent },
    light: { bg: C.text, fg: C.bg, border: C.text },
    outline: { bg: C.card, fg: C.text, border: C.line },
    danger: { bg: 'transparent', fg: C.red, border: C.red },
    buy: { bg: C.green, fg: C.bg, border: C.green },
    sell: { bg: C.red, fg: C.bg, border: C.red },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [{
        height: 52, borderRadius: 14, backgroundColor: v.bg, borderWidth: 1, borderColor: v.border,
        alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <T style={{ color: v.fg, fontWeight: '600', fontSize: 16 }}>{title}</T>}
    </Pressable>
  );
}

export function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1,
        borderColor: active ? C.accent : C.line, backgroundColor: active ? C.accentSoft : C.card,
      }}
    >
      <T style={{ fontSize: 14 }}>{label}</T>
    </Pressable>
  );
}

export function Back({ onPress }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel="Back"
      style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
      <T style={{ fontSize: 22, color: C.muted, marginTop: -2 }}>‹</T>
    </Pressable>
  );
}

export function LiveBadge({ marketTime, crypto, streaming, source }) {
  const live = streaming || crypto || (marketTime && Date.now() - marketTime < 20 * 60 * 1000);
  return (
    <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99, backgroundColor: live ? 'rgba(81,207,102,0.12)' : C.card }}>
      <T style={{ fontSize: 12, fontWeight: '600', color: live ? C.green : C.muted }}>{live ? `● LIVE${streaming && source ? ` · ${source}` : ''}` : '● CLOSED · LAST PRICE'}</T>
    </View>
  );
}

export function Loading({ error, onRetry }) {
  return (
    <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
      {error ? (
        <>
          <Muted style={{ textAlign: 'center' }}>{error}</Muted>
          {onRetry && <Button title="Try again" variant="outline" onPress={onRetry} style={{ width: 160 }} />}
        </>
      ) : <ActivityIndicator color={C.accent} />}
    </View>
  );
}
