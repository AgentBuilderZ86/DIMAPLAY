import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Body, Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { sendPhoneOtp, verifyPhoneOtp } from '@/features/auth/otp';

export default function Verify() {
  const { t } = useTranslation();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onVerify = async () => {
    setError(null);
    setBusy(true);
    try {
      await verifyPhoneOtp(phone, code.trim());
      // The auth listener flips the navigator; nothing else to do here.
    } catch {
      setError(t('auth.codeInvalid'));
      setBusy(false);
    }
  };

  const onResend = async () => {
    setError(null);
    try {
      await sendPhoneOtp(phone);
    } catch {
      setError(t('auth.otpFailed'));
    }
  };

  return (
    <Screen>
      <Title>{t('auth.verifyTitle')}</Title>
      <Body muted>{t('auth.verifySubtitle', { phone })}</Body>
      <Field
        testID="code-input"
        label={t('auth.codeLabel')}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        value={code}
        onChangeText={setCode}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        testID="verify-code"
        label={t('auth.verify')}
        onPress={() => void onVerify()}
        loading={busy}
        disabled={code.trim().length !== 6}
      />
      <Button label={t('auth.resend')} variant="ghost" onPress={() => void onResend()} />
    </Screen>
  );
}
