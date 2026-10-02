import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Body, Button, Screen } from '@/components/ui';
import { useAuthBootstrap } from '@/features/auth/bootstrap';
import { useAuth } from '@/features/auth/store';
import { initI18n } from '@/i18n';
import { fontAssets } from '@/theme/fontAssets';

void SplashScreen.preventAutoHideAsync();
initI18n();

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { t } = useTranslation();
  const status = useAuth((s) => s.status);
  const profileError = useAuth((s) => s.profileError);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  useAuthBootstrap();

  const ready = fontsReady && (status !== 'loading' || profileError);
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  if (profileError) {
    return (
      <Screen>
        <Body>{t('common.errorGeneric')}</Body>
        <Button label={t('common.retry')} onPress={() => void refreshProfile()} />
      </Screen>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'needsOnboarding'}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'ready'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="matches" />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [loaded, error] = useFonts(fontAssets);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <RootNavigator fontsReady={loaded || !!error} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
