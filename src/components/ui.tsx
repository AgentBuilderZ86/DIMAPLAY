import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts } from '@/theme/fonts';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const style = [styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top + 16 }];
  if (!scroll) return <View style={style}>{children}</View>;
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[
        styles.screenContent,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.body, { color: muted ? colors.muted : colors.text }]}>{children}</Text>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="alert" style={[styles.body, { color: colors.danger }]}>
      {children}
    </Text>
  );
}

type Variant = 'primary' | 'accent' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const bg = {
    primary: colors.primary,
    accent: colors.accent,
    ghost: colors.soft,
    danger: colors.danger,
  }[variant];
  const fg = {
    primary: colors.onPrimary,
    accent: colors.onAccent,
    ghost: colors.text,
    danger: colors.onDanger,
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={[styles.button, { backgroundColor: bg, opacity: off ? 0.5 : 1 }]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  ...input
}: { label: string; error?: string } & TextInputProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...input}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.line,
          },
        ]}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.text : colors.surface,
          borderColor: selected ? colors.text : colors.line,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.bg : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function CheckRow({
  label,
  checked,
  onToggle,
  testID,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={styles.checkRow}
    >
      <View
        style={[
          styles.box,
          { borderColor: colors.text, backgroundColor: checked ? colors.primary : 'transparent' },
        ]}
      >
        {checked ? (
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.bodyBold }}>✓</Text>
        ) : null}
      </View>
      <Text style={[styles.body, { color: colors.text, flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  screenContent: { paddingHorizontal: 20, gap: 14 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  button: {
    minHeight: MIN_TOUCH_TARGET + 6,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 16 },
  field: { gap: 6 },
  label: { fontFamily: fonts.bodySemi, fontSize: 14 },
  input: {
    minHeight: MIN_TOUCH_TARGET + 4,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: MIN_TOUCH_TARGET },
  box: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
