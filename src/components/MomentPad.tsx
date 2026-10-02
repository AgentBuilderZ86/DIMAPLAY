import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, Chip, ErrorText, Row } from '@/components/ui';
import { useAuth } from '@/features/auth/store';
import { fetchMatch } from '@/features/matches/api';
import { MOMENTS_BY_SPORT, type MomentType } from '@/features/video/moments';
import type { Sport } from '@/theme/tokens';
import { fonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

/** Buttons that mark a highlight, with the player concerned (defaults to the person tapping). */
export function MomentPad({
  matchId,
  sport,
  onMark,
}: {
  matchId: string;
  sport: Sport;
  /** Receives the moment type and the chosen subject (undefined = myself). Throw to show an error. */
  onMark: (type: MomentType, subjectId: string | undefined) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const me = useAuth((s) => s.session?.user.id);
  const [subject, setSubject] = useState<string | undefined>(undefined);
  const [flash, setFlash] = useState<MomentType | null>(null);
  const [failed, setFailed] = useState(false);
  const { data } = useQuery({
    queryKey: ['matches', 'detail', matchId],
    queryFn: () => fetchMatch(matchId),
  });
  const players = (data?.participants ?? []).filter((p) => p.user_id !== me);

  const press = async (type: MomentType) => {
    setFailed(false);
    try {
      await onMark(type, subject);
      setFlash(type);
      setTimeout(() => setFlash((f) => (f === type ? null : f)), 1500);
    } catch {
      setFailed(true);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      {players.length > 0 ? (
        <>
          <Text style={{ color: colors.muted, fontFamily: fonts.bodySemi }}>
            {t('film.markFor')}
          </Text>
          <Row>
            <Chip
              label={t('film.me')}
              selected={subject === undefined}
              onPress={() => setSubject(undefined)}
            />
            {players.map((p) => (
              <Chip
                key={p.user_id}
                label={p.display_name ?? '?'}
                selected={subject === p.user_id}
                onPress={() => setSubject(p.user_id)}
              />
            ))}
          </Row>
        </>
      ) : null}
      <Row>
        {MOMENTS_BY_SPORT[sport].map((m) => (
          <View key={m} style={{ flexGrow: 1, minWidth: 100 }}>
            <Button
              testID={`moment-${m}`}
              label={flash === m ? `✓ ${t('film.marked')}` : t(`moments.${m}`)}
              variant={flash === m ? 'accent' : 'primary'}
              onPress={() => void press(m)}
            />
          </View>
        ))}
      </Row>
      {failed ? <ErrorText>{t('common.errorGeneric')}</ErrorText> : null}
    </View>
  );
}
