import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Hoog contrast en grote tikvlakken: de app wordt buiten en met werkhandschoenen gebruikt (FO §8.2). */
export const colors = {
  bg: '#F3F5F7',
  card: '#FFFFFF',
  text: '#14181D',
  muted: '#5B6570',
  border: '#D3D9E0',
  primary: '#0B4F9C',
  primaryText: '#FFFFFF',
  ok: '#15803D',
  okBg: '#DDF4E4',
  danger: '#C62828',
  dangerBg: '#FDE3E1',
  warn: '#D97706',
  warnBg: '#FFF4CC',
  info: '#1F6FEB',
  neutralBg: '#E7EBEF',
  bubbleMine: '#DCEBFF',
};

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.inner, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ok';
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
}) {
  const bg = {
    primary: colors.primary,
    secondary: colors.neutralBg,
    danger: colors.danger,
    ok: colors.ok,
  }[variant];
  const fg = variant === 'secondary' ? colors.text : colors.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, small && { fontSize: 15 }, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]} />
      {hint ? <Muted style={{ marginTop: 4 }}>{hint}</Muted> : null}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Chip({
  label,
  selected,
  onPress,
  color = colors.primary,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected ? { backgroundColor: color, borderColor: color } : { borderColor: colors.border }]}
    >
      <Text style={[styles.chipText, { color: selected ? '#fff' : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

export function Badge({ label, color, bg }: { label: string; color: string; bg?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg ?? color + '1F' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
      <Text style={[styles.h2, { textAlign: 'center' }]}>{title}</Text>
      {children ? <View style={{ marginTop: 6, alignItems: 'center' }}>{children}</View> : null}
    </Card>
  );
}

export function Banner({ text, tone = 'warn' }: { text: string; tone?: 'warn' | 'danger' | 'ok' | 'info' }) {
  const map = {
    warn: [colors.warn, colors.warnBg],
    danger: [colors.danger, colors.dangerBg],
    ok: [colors.ok, colors.okBg],
    info: [colors.primary, '#E3EEFB'],
  } as const;
  const [fg, bg] = map[tone];
  return (
    <View style={[styles.banner, { backgroundColor: bg, borderLeftColor: fg }]}>
      <Text style={{ color: colors.text, fontSize: 15 }}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 32, alignItems: 'center' }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 48, alignItems: 'center' },
  inner: { width: '100%', maxWidth: 900, alignSelf: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  h1: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 8 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 },
  muted: { fontSize: 14, color: colors.muted },
  label: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
    color: colors.text,
  },
  button: {
    minHeight: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginVertical: 5,
  },
  buttonSmall: { minHeight: 44, paddingHorizontal: 12, marginVertical: 3 },
  buttonText: { fontSize: 17, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', backgroundColor: '#fff' },
  chipText: { fontSize: 15, fontWeight: '600' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  banner: { borderLeftWidth: 5, borderRadius: 8, padding: 12, marginBottom: 12 },
});
