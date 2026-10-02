import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TabIcon } from '@/components/TabIcon';
import type { TabKey } from '@/components/EmptyTab';
import { fonts } from '@/theme/fonts';
import { brand } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const SCREENS: { name: string; tab: TabKey }[] = [
  { name: 'index', tab: 'home' },
  { name: 'play', tab: 'play' },
  { name: 'film', tab: 'film' },
  { name: 'ranking', tab: 'ranking' },
  { name: 'profile', tab: 'profile' },
];

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.activeTab,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          minHeight: 60,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 11.5 },
      }}
    >
      {SCREENS.map(({ name, tab }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: t(`tabs.${tab}`),
            tabBarIcon: ({ color }) =>
              tab === 'film' ? (
                <View style={styles.film}>
                  <TabIcon tab={tab} color={brand.ink} size={26} />
                </View>
              ) : (
                <TabIcon tab={tab} color={color} />
              ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  film: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: brand.flood,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    shadowColor: brand.turf,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
