import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { UploadBanner } from '@/components/UploadBanner';
import { Body, Button, ErrorText, Screen, Title } from '@/components/ui';
import { listFilmableMatches } from '@/features/video/api';
import { formatWhen } from '@/lib/format';
import { fonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

export default function FilmScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['film', 'matches'],
    queryFn: listFilmableMatches,
  });

  return (
    <Screen>
      <Title>{t('film.title')}</Title>
      <Body muted>{t('film.tipTripod')}</Body>
      <UploadBanner />
      {isError ? (
        <>
          <ErrorText>{t('common.errorGeneric')}</ErrorText>
          <Button label={t('common.retry')} variant="ghost" onPress={() => void refetch()} />
        </>
      ) : null}
      {!isLoading && !isError && data?.length === 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('film.noMatches')}</Text>
          <Body muted>{t('film.noMatchesBody')}</Body>
          <Button
            label={t('play.title')}
            variant="accent"
            onPress={() => router.push('/(tabs)/play')}
          />
        </View>
      ) : null}
      {data && data.length > 0 ? <Body muted>{t('film.pickMatch')}</Body> : null}
      {data?.map((m) => (
        <View
          key={m.id}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <Text style={[styles.name, { color: colors.text }]}>{m.place}</Text>
          <Text style={[styles.meta, { color: colors.muted }]}>
            {t(`sports.${m.sport}`)} · {formatWhen(m.starts_at, i18n.language)}
          </Text>
          {m.recording_video_id && !m.filmer_is_me ? (
            <>
              <Body>{t('film.liveByOther')}</Body>
              <Button
                testID={`mark-${m.id}`}
                label={t('film.markLive')}
                onPress={() =>
                  router.push({ pathname: '/film/mark', params: { matchId: m.id, sport: m.sport } })
                }
              />
            </>
          ) : (
            <>
              <Button
                testID={`film-${m.id}`}
                label={t('film.record')}
                variant="accent"
                onPress={() =>
                  router.push({
                    pathname: '/film/camera',
                    params: { matchId: m.id, sport: m.sport },
                  })
                }
              />
              <Button
                label={t('film.import')}
                variant="ghost"
                onPress={() =>
                  router.push({
                    pathname: '/film/import',
                    params: { matchId: m.id, sport: m.sport, startsAt: m.starts_at },
                  })
                }
              />
            </>
          )}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyTitle: { fontFamily: fonts.display, fontSize: 24 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  name: { fontFamily: fonts.bodyBold, fontSize: 17 },
  meta: { fontFamily: fonts.body, fontSize: 13 },
});
