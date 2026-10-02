import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, Chip, ErrorText, Row, Screen, Title } from '@/components/ui';
import { useAuth } from '@/features/auth/store';
import { SPORTS, type Sport } from '@/features/profile/types';
import { fetchMyStanding, fetchRanking, SCOPES, type RankingScope } from '@/features/rankings/api';
import { formatElo } from '@/lib/format';
import { fonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

export default function RankingScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isMinor = useAuth((s) => s.profile?.is_minor ?? false);
  const [sport, setSport] = useState<Sport>('foot');
  const [scope, setScope] = useState<RankingScope>('neighborhood');

  const board = useQuery({
    queryKey: ['ranking', 'board', sport, scope],
    queryFn: () => fetchRanking(sport, scope),
  });
  const standing = useQuery({
    queryKey: ['ranking', 'me', sport],
    queryFn: () => fetchMyStanding(sport),
  });

  const myRank = standing.data
    ? {
        neighborhood: standing.data.rank_neighborhood,
        city: standing.data.rank_city,
        morocco: standing.data.rank_morocco,
      }[scope]
    : null;

  return (
    <Screen>
      <Title>{t('ranking.title')}</Title>
      <Row>
        {SPORTS.map((s) => (
          <Chip
            key={s}
            testID={`rank-sport-${s}`}
            label={t(`sports.${s}`)}
            selected={sport === s}
            onPress={() => setSport(s)}
          />
        ))}
      </Row>
      <Row>
        {SCOPES.map((s) => (
          <Chip
            key={s}
            testID={`rank-scope-${s}`}
            label={t(`ranking.scopes.${s}`)}
            selected={scope === s}
            onPress={() => setScope(s)}
          />
        ))}
      </Row>

      {standing.data ? (
        <View style={[styles.me, { backgroundColor: colors.accent }]}>
          <Text style={[styles.meElo, { color: colors.onAccent }]}>
            {formatElo(standing.data.elo)}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.meLabel, { color: colors.onAccent }]}>{t('ranking.me')}</Text>
            <Text style={[styles.meSub, { color: colors.onAccent }]}>
              {standing.data.calibrating ? `${t('ranking.calibrating')} · ` : ''}
              {t('ranking.matchesCount', { count: standing.data.matches_count })}
              {' · '}
              {myRank ? t('ranking.rank', { rank: myRank }) : t('ranking.noRank')}
            </Text>
          </View>
        </View>
      ) : null}
      {isMinor ? <Body muted>{t('ranking.minorNoRank')}</Body> : null}

      {board.isError ? (
        <>
          <ErrorText>{t('ranking.loadFailed')}</ErrorText>
          <Button label={t('common.retry')} variant="ghost" onPress={() => void board.refetch()} />
        </>
      ) : null}
      {board.data?.length === 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('ranking.emptyTitle')}</Text>
          <Body muted>{t('ranking.emptyBody')}</Body>
        </View>
      ) : null}
      {board.data?.map((r) => (
        <View
          key={r.user_id}
          accessible
          accessibilityLabel={`${r.pos}. ${r.display_name}, ${formatElo(r.elo)}`}
          style={[
            styles.row,
            { backgroundColor: r.is_me ? colors.soft : colors.surface, borderColor: colors.line },
          ]}
        >
          <Text style={[styles.pos, { color: colors.text }]}>{r.pos}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]}>{r.display_name}</Text>
            <Text style={[styles.sub, { color: colors.muted }]}>
              {r.neighborhood}, {r.city}
              {r.calibrating ? ` · ${t('ranking.calibrating')}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.pts, { color: colors.text }]}>{formatElo(r.elo)}</Text>
            {r.change7d ? (
              <Text
                accessibilityLabel={t('ranking.change', { count: r.change7d })}
                style={[styles.sub, { color: r.change7d > 0 ? colors.activeTab : colors.danger }]}
              >
                {r.change7d > 0 ? `▲ ${r.change7d}` : `▼ ${Math.abs(r.change7d)}`}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  me: { borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  meElo: { fontFamily: fonts.displayBlack, fontSize: 48 },
  meLabel: { fontFamily: fonts.bodyBold, fontSize: 16 },
  meSub: { fontFamily: fonts.body, fontSize: 13 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24 },
  row: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
  },
  pos: { fontFamily: fonts.display, fontSize: 24, width: 32, textAlign: 'center' },
  name: { fontFamily: fonts.bodyBold, fontSize: 16 },
  sub: { fontFamily: fonts.body, fontSize: 12.5 },
  pts: { fontFamily: fonts.display, fontSize: 24 },
});
