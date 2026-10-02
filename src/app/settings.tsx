import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking } from 'react-native';

import { Body, Button, ErrorText, Screen, Title } from '@/components/ui';
import { useAuth } from '@/features/auth/store';
import { deleteAccount } from '@/features/profile/api';
import { config } from '@/lib/config';
import { supabase } from '@/lib/supabase';

export default function Settings() {
  const { t } = useTranslation();
  const reset = useAuth((s) => s.reset);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const confirmDelete = () => {
    Alert.alert(t('settings.deleteTitle'), t('settings.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteConfirm'),
        style: 'destructive',
        onPress: () => void doDelete(),
      },
    ]);
  };

  const doDelete = async () => {
    setError(false);
    setBusy(true);
    try {
      await deleteAccount();
      reset();
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{t('settings.title')}</Title>
      <Button
        testID="close-settings"
        label={t('common.back')}
        variant="ghost"
        onPress={() => router.back()}
      />

      {config.privacyUrl || config.termsUrl || config.supportEmail ? (
        <Body muted>{t('settings.legal')}</Body>
      ) : null}
      {config.privacyUrl ? (
        <Button
          label={t('settings.privacyPolicy')}
          variant="ghost"
          onPress={() => void Linking.openURL(config.privacyUrl)}
        />
      ) : null}
      {config.termsUrl ? (
        <Button
          label={t('settings.terms')}
          variant="ghost"
          onPress={() => void Linking.openURL(config.termsUrl)}
        />
      ) : null}
      {config.supportEmail ? (
        <>
          <Body muted>{t('settings.contactHint')}</Body>
          <Button
            label={t('settings.contact')}
            variant="ghost"
            onPress={() => void Linking.openURL(`mailto:${config.supportEmail}`)}
          />
        </>
      ) : null}

      <Body muted>{t('settings.account')}</Body>
      <Button testID="sign-out" label={t('settings.signOut')} onPress={() => void signOut()} />
      <Button
        testID="delete-account"
        label={t('settings.deleteAccount')}
        variant="danger"
        onPress={confirmDelete}
        loading={busy}
      />
      {error ? <ErrorText>{t('settings.deleteFailed')}</ErrorText> : null}
    </Screen>
  );
}
