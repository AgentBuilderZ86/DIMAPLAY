import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Body,
  Button,
  CheckRow,
  Chip,
  ErrorText,
  Field,
  Row,
  Screen,
  Title,
} from '@/components/ui';
import { useAuth } from '@/features/auth/store';
import { completeOnboarding, recordConsent, updateProfile } from '@/features/profile/api';
import { SPORTS, type ProfileDraft, type Sport } from '@/features/profile/types';
import {
  normalizeHandle,
  validateProfileDraft,
  type FieldError,
} from '@/features/profile/validation';
import { isMinorBirthYear } from '@/lib/age';

const CITIES = ['Casablanca', 'Rabat', 'Marrakech', 'Tanger', 'Fès', 'Agadir'];
const STEPS = 5;

export default function Onboarding() {
  const { t } = useTranslation();
  const session = useAuth((s) => s.session);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const meta = session?.user.user_metadata as { full_name?: string } | undefined;

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft>({
    display_name: meta?.full_name?.split(' ')[0] ?? '',
    handle: '',
    sports: [],
    city: '',
    neighborhood: '',
    birth_year: undefined,
  });
  const [birthText, setBirthText] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const patch = (p: ProfileDraft) => setDraft((d) => ({ ...d, ...p }));
  const toggleSport = (s: Sport) =>
    patch({
      sports: draft.sports?.includes(s)
        ? draft.sports.filter((x) => x !== s)
        : [...(draft.sports ?? []), s],
    });

  const STEP_FIELDS: FieldError[][] = [
    ['displayNameLength', 'handleFormat'],
    ['sportsRequired'],
    ['cityRequired', 'neighborhoodRequired'],
    ['birthYearInvalid'],
    [],
  ];

  const clean = (): ProfileDraft => ({
    ...draft,
    display_name: draft.display_name?.trim(),
    handle: draft.handle ? normalizeHandle(draft.handle) : undefined,
    city: draft.city?.trim(),
    neighborhood: draft.neighborhood?.trim(),
  });

  const next = () => {
    const found = validateProfileDraft(clean()).filter((e) => STEP_FIELDS[step]!.includes(e));
    setErrors(found);
    if (found.length === 0) setStep(step + 1);
  };

  const finish = async () => {
    if (!session) return;
    setFailed(false);
    setBusy(true);
    try {
      const final = clean();
      await updateProfile(session.user.id, {
        ...final,
        handle: final.handle || undefined,
        language: 'fr',
      });
      await recordConsent(session.user.id, 'terms', true);
      await recordConsent(session.user.id, 'privacy', true);
      await completeOnboarding();
      await refreshProfile(); // flips the navigator to the main tabs
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  const err = (e: FieldError) => (errors.includes(e) ? t(`fieldErrors.${e}`) : undefined);
  const isMinor = draft.birth_year != null && isMinorBirthYear(draft.birth_year);

  return (
    <Screen>
      <Body muted>{t('onboarding.stepOf', { current: step + 1, total: STEPS })}</Body>

      {step === 0 && (
        <>
          <Title>{t('onboarding.nameTitle')}</Title>
          <Field
            testID="display-name"
            label={t('onboarding.displayName')}
            value={draft.display_name ?? ''}
            onChangeText={(v) => patch({ display_name: v })}
            error={err('displayNameLength')}
            autoComplete="given-name"
          />
          <Field
            testID="handle"
            label={t('onboarding.handle')}
            value={draft.handle ?? ''}
            onChangeText={(v) => patch({ handle: v })}
            autoCapitalize="none"
            autoCorrect={false}
            error={err('handleFormat')}
          />
          <Body muted>{t('onboarding.handleHint')}</Body>
        </>
      )}

      {step === 1 && (
        <>
          <Title>{t('onboarding.sportsTitle')}</Title>
          <Body muted>{t('onboarding.sportsHint')}</Body>
          <Row>
            {SPORTS.map((s) => (
              <Chip
                key={s}
                testID={`sport-${s}`}
                label={t(`sports.${s}`)}
                selected={!!draft.sports?.includes(s)}
                onPress={() => toggleSport(s)}
              />
            ))}
          </Row>
          {err('sportsRequired') ? <ErrorText>{err('sportsRequired')}</ErrorText> : null}
        </>
      )}

      {step === 2 && (
        <>
          <Title>{t('onboarding.placeTitle')}</Title>
          <Row>
            {CITIES.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={draft.city === c}
                onPress={() => patch({ city: c })}
              />
            ))}
          </Row>
          <Field
            testID="city"
            label={t('onboarding.city')}
            value={draft.city ?? ''}
            onChangeText={(v) => patch({ city: v })}
            error={err('cityRequired')}
          />
          <Field
            testID="neighborhood"
            label={t('onboarding.neighborhood')}
            value={draft.neighborhood ?? ''}
            onChangeText={(v) => patch({ neighborhood: v })}
            error={err('neighborhoodRequired')}
          />
          <Body muted>{t('onboarding.placeHint')}</Body>
        </>
      )}

      {step === 3 && (
        <>
          <Title>{t('onboarding.ageTitle')}</Title>
          <Field
            testID="birth-year"
            label={t('onboarding.birthYear')}
            keyboardType="number-pad"
            maxLength={4}
            value={birthText}
            onChangeText={(v) => {
              setBirthText(v);
              patch({ birth_year: /^\d{4}$/.test(v) ? Number(v) : undefined });
            }}
            error={err('birthYearInvalid')}
          />
          <Body muted>{t('onboarding.ageHint')}</Body>
          {isMinor ? <Body>{t('onboarding.minorNotice')}</Body> : null}
        </>
      )}

      {step === 4 && (
        <>
          <Title>{t('onboarding.consentTitle')}</Title>
          <CheckRow
            testID="consent-terms"
            label={t('onboarding.consentTerms')}
            checked={terms}
            onToggle={() => setTerms(!terms)}
          />
          <CheckRow
            testID="consent-privacy"
            label={t('onboarding.consentPrivacy')}
            checked={privacy}
            onToggle={() => setPrivacy(!privacy)}
          />
          <Body muted>{t('onboarding.consentHint')}</Body>
          {failed ? <ErrorText>{t('onboarding.finishFailed')}</ErrorText> : null}
        </>
      )}

      {step < STEPS - 1 ? (
        <Button testID="next" label={t('common.continue')} onPress={next} />
      ) : (
        <Button
          testID="finish"
          label={t('onboarding.finish')}
          onPress={() => void finish()}
          loading={busy}
          disabled={!terms || !privacy}
        />
      )}
      {step > 0 ? (
        <Button label={t('common.back')} variant="ghost" onPress={() => setStep(step - 1)} />
      ) : null}
    </Screen>
  );
}
