import { useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

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
import { createMatch } from '@/features/matches/api';
import { FORMAT_FOR_SPORT, LEVELS, type MatchLevel } from '@/features/matches/types';
import { SPORTS, type Sport } from '@/features/profile/types';

export default function NewMatch() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const profile = useAuth((s) => s.profile);
  const [sport, setSport] = useState<Sport>(profile?.sports[0] ?? 'foot');
  const [startsAt, setStartsAt] = useState(() => new Date(Date.now() + 24 * 3600 * 1000));
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState(profile?.city ?? '');
  const [hood, setHood] = useState(profile?.neighborhood ?? '');
  const [level, setLevel] = useState<MatchLevel>('any');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (venue.trim().length < 2) return setError(t('match.venueRequired'));
    if (startsAt.getTime() <= Date.now()) return setError(t('match.pastDate'));
    setBusy(true);
    try {
      const id = await createMatch({
        sport,
        startsAt,
        venue,
        city,
        neighborhood: hood,
        level,
        imageConsent: consent,
      });
      await qc.invalidateQueries({ queryKey: ['matches'] });
      router.replace({ pathname: '/matches/[id]', params: { id } });
    } catch {
      setError(t('match.createFailed'));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{t('match.newTitle')}</Title>
      <Body muted>{t('match.sport')}</Body>
      <Row>
        {SPORTS.map((s) => (
          <Chip
            key={s}
            testID={`new-sport-${s}`}
            label={t(`sports.${s}`)}
            selected={sport === s}
            onPress={() => setSport(s)}
          />
        ))}
      </Row>
      <Body muted>{t(`match.formats.${FORMAT_FOR_SPORT[sport]}`)}</Body>

      <Body muted>{t('match.when')}</Body>
      <View style={{ alignItems: 'flex-start' }}>
        <DateTimePicker
          value={startsAt}
          mode="datetime"
          minimumDate={new Date()}
          onChange={(_e, d) => d && setStartsAt(d)}
        />
      </View>
      <Field testID="venue" label={t('match.venue')} value={venue} onChangeText={setVenue} />
      <Field testID="match-city" label={t('match.city')} value={city} onChangeText={setCity} />
      <Field label={t('match.neighborhood')} value={hood} onChangeText={setHood} />

      <Body muted>{t('match.level')}</Body>
      <Row>
        {LEVELS.map((l) => (
          <Chip
            key={l}
            label={t(`match.levels.${l}`)}
            selected={level === l}
            onPress={() => setLevel(l)}
          />
        ))}
      </Row>
      <CheckRow
        testID="new-image-consent"
        label={t('match.imageConsent')}
        checked={consent}
        onToggle={() => setConsent(!consent)}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        testID="publish-match"
        label={t('match.publish')}
        onPress={() => void submit()}
        loading={busy}
      />
      <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
