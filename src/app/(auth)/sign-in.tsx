import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { Body, Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { signInWithApple } from '@/features/auth/apple';
import { sendPhoneOtp } from '@/features/auth/otp';
import { normalizeMoroccanPhone } from '@/lib/phone';
import { useTheme } from '@/theme/useTheme';

export default function SignIn() {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const onApple = async () => {
    setError(null);
    try {
      await signInWithApple();
    } catch {
      setError(t('auth.appleFailed'));
    }
  };

  const onSend = async () => {
    setError(null);
    const e164 = normalizeMoroccanPhone(phone);
    if (!e164) {
      setError(t('auth.phoneInvalid'));
      return;
    }
    setBusy(true);
    try {
      await sendPhoneOtp(e164);
      router.push({ pathname: '/verify', params: { phone: e164 } });
    } catch {
      setError(t('auth.otpFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{t('auth.title')}</Title>
      <Body muted>{t('auth.subtitle')}</Body>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          testID="apple-sign-in"
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={
            scheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={12}
          style={styles.apple}
          onPress={() => void onApple()}
        />
      ) : null}
      <View style={styles.sep}>
        <Body muted>{t('auth.orPhone')}</Body>
      </View>
      <Field
        testID="phone-input"
        label={t('auth.phoneLabel')}
        placeholder={t('auth.phonePlaceholder')}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        value={phone}
        onChangeText={setPhone}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        testID="send-code"
        label={t('auth.sendCode')}
        onPress={() => void onSend()}
        loading={busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  apple: { height: 52, width: '100%' },
  sep: { alignItems: 'center' },
});
