import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EmptyTab } from '@/components/EmptyTab';
import { Body, Button, Screen, Title } from '@/components/ui';
import { useAuth } from '@/features/auth/store';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const profile = useAuth((s) => s.profile);
  if (!profile) return <EmptyTab tab="profile" />;

  return (
    <Screen>
      <Title>{t('profile.hello', { name: profile.display_name })}</Title>
      <Body muted>
        {t('profile.quarter', { neighborhood: profile.neighborhood, city: profile.city })}
      </Body>
      <Body>{profile.sports.map((s) => t(`sports.${s}`)).join(' · ')}</Body>
      <Button
        testID="open-settings"
        label={t('profile.settings')}
        variant="ghost"
        onPress={() => router.push('/settings')}
      />
    </Screen>
  );
}
