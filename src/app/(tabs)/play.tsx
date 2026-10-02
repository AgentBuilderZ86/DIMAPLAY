import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Chip, ErrorText, Row, Screen, Title } from '@/components/ui';
import { useAuth } from '@/features/auth/store';
import { useOpenMatches } from '@/features/matches/hooks';
import { SPORTS, type Sport } from '@/features/profile/types';
import { formatWhen } from '@/lib/format';
import { fonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

export default function PlayScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const city = useAuth((s) => s.profile?.city ?? null);
  const [sport, setSport] = useState<Sport | null>(null);
  const { data, isLoading, isError, refetch } = useOpenMatches(sport, city);

  return (
    <Screen>
      <Title>{t('play.title')}</Title>
      <Button
        testID="create-match"
        label={t('play.create')}
        variant="accent"
        onPress={() => router.push('/matches/new')}
      />
      <Row>
        <Chip
          label={t('play.allSports')}
          selected={sport === null}
          onPress={() => setSport(null)}
        />
        {SPORTS.map((s) => (
          <Chip
            key={s}
            label={t(`sports.${s}`)}
            selected={sport === s}
            onPress={() => setSport(s)}
          />
        ))}
      </Row>
      <Body muted>{t('play.open')}</Body>
      {isError ? (
        <>
          <ErrorText>{t('play.loadFailed')}</ErrorText>
          <Button label={t('common.retry')} variant="ghost" onPress={() => void refetch()} />
        </>
      ) : null}
      {!isLoading && !isError && data?.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('play.emptyTitle')}</Text>
          <Body muted>{t('play.emptyBody')}</Body>
        </View>
      ) : null}
      {data?.map((m) => (
        <Pressable
          key={m.id}
          testID={`match-${m.id}`}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/matches/[id]', params: { id: m.id } })}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <View style={[styles.tag, { backgroundColor: colors.sport[m.sport] }]}>
            <Text style={styles.tagText}>{t(`sports.${m.sport}`)}</Text>
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{m.club_name ?? m.venue}</Text>
          <Text style={[styles.cardMeta, { color: colors.muted }]}>
            {formatWhen(m.starts_at, i18n.language)} · {m.neighborhood ? `${m.neighborhood}, ` : ''}
            {m.city}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.muted }]}>
            {t('play.spots', { joined: m.joined_count, capacity: m.capacity })} ·{' '}
            {t(`match.levels.${m.level}`)}
            {m.joined ? ` · ${t('play.joined')}` : ''}
          </Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { gap: 6, paddingVertical: 12 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 4, minHeight: 44 },
  tag: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { color: '#FFFFFF', fontFamily: fonts.bodyBold, fontSize: 12 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 17 },
  cardMeta: { fontFamily: fonts.body, fontSize: 13 },
});
