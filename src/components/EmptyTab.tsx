import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { fonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

export type TabKey = 'home' | 'play' | 'film' | 'ranking' | 'profile';

/** Styled placeholder shell for a tab until its milestone lands. */
export function EmptyTab({ tab }: { tab: TabKey }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View
        style={[styles.header, { backgroundColor: colors.header, paddingTop: insets.top + 14 }]}
      >
        <Text style={[styles.brand, { color: colors.onHeader }]} accessibilityRole="header">
          {t('appName')}
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          {t(`empty.${tab}.title`)}
        </Text>
        <Text style={[styles.text, { color: colors.muted }]}>{t(`empty.${tab}.body`)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 18, paddingBottom: 12 },
  brand: { fontFamily: fonts.displayBlack, fontSize: 28 },
  body: { padding: 16 },
  title: { fontFamily: fonts.display, fontSize: 30, marginTop: 6, marginBottom: 8 },
  text: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
});
