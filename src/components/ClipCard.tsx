import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ClipRow } from '@/features/video/api';
import { formatWhen } from '@/lib/format';
import { fonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

export function ClipCard({ clip }: { clip: ClipRow }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const sport = clip.match?.sport ?? 'foot';
  const ready = clip.status === 'ready';
  const title = clip.moment
    ? t('clips.atMoment', { moment: t(`moments.${clip.moment.type}`), sport: t(`sports.${sport}`) })
    : t(`sports.${sport}`);
  const status = ready ? null : clip.status === 'failed' ? t('clips.failed') : t('clips.preparing');

  return (
    <Pressable
      testID={`clip-${clip.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${title}${status ? `, ${status}` : ''}`}
      disabled={!ready}
      onPress={() => router.push({ pathname: '/clips/[id]', params: { id: clip.id } })}
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.line, opacity: ready ? 1 : 0.7 },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: colors.sport[sport] }]}>
        <Text style={styles.play}>{ready ? '▶' : '…'}</Text>
        <Text style={styles.dur}>{Math.round((clip.end_ms - clip.start_ms) / 1000)} s</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.meta, { color: colors.muted }]}>
          {clip.match?.venue ? `${clip.match.venue} · ` : ''}
          {formatWhen(clip.created_at, i18n.language)}
        </Text>
        {status ? <Text style={[styles.meta, { color: colors.muted }]}>{status}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    minHeight: 64,
  },
  thumb: {
    width: 54,
    aspectRatio: 9 / 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: { color: '#FFFFFF', fontSize: 18, fontFamily: fonts.bodyBold },
  dur: {
    position: 'absolute',
    bottom: 3,
    right: 4,
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: fonts.bodyBold,
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 16 },
  meta: { fontFamily: fonts.body, fontSize: 12.5 },
});
