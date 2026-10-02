import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

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
import * as api from '@/features/matches/api';
import { useMatch } from '@/features/matches/hooks';
import { parseScore, resultPhase } from '@/features/matches/logic';
import type { TeamSide } from '@/features/matches/types';
import { formatElo, formatWhen } from '@/lib/format';
import { fonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

export default function MatchDetail() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const me = useAuth((s) => s.session?.user.id);
  const { data, isLoading, isError, refetch } = useMatch(id);
  const [consent, setConsent] = useState(false);
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isError) {
    return (
      <Screen>
        <ErrorText>{t('common.errorGeneric')}</ErrorText>
        <Button label={t('common.retry')} onPress={() => void refetch()} />
        <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (isLoading || !data) {
    return (
      <Screen>
        <Body muted>{t('common.loading')}</Body>
      </Screen>
    );
  }

  const { match, participants, result, joinedCount } = data;
  const mine = participants.find((p) => p.user_id === me) ?? null;
  const isCreator = match.creator_id === me;
  const open = match.status === 'open';
  const notStarted = new Date(match.starts_at) > new Date();
  const full = joinedCount >= match.capacity;
  const phase = mine ? resultPhase(match, participants, result, mine.team) : 'none';
  const half = match.capacity / 2;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      await qc.invalidateQueries({ queryKey: ['matches'] });
      await qc.invalidateQueries({ queryKey: ['ranking'] });
    } catch {
      setError(t('match.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const sendScore = () => {
    const a = parseScore(scoreA);
    const b = parseScore(scoreB);
    if (a === null || b === null) return setError(t('match.scoreInvalid'));
    if (match.sport !== 'foot' && a === b) return setError(t('match.drawNotAllowed'));
    void run(() => api.submitResult(match.id, a, b));
  };

  const teamOf = (side: TeamSide | null) => participants.filter((p) => p.team === side);

  return (
    <Screen>
      <Title>{match.clubs?.name ?? match.venue ?? ''}</Title>
      <Body muted>
        {t(`sports.${match.sport}`)} · {formatWhen(match.starts_at, i18n.language)}
      </Body>
      <Body muted>
        {match.neighborhood ? `${match.neighborhood}, ` : ''}
        {match.city} · {t(`match.levels.${match.level}`)}
      </Body>
      {match.status === 'cancelled' ? <ErrorText>{t('match.cancelled')}</ErrorText> : null}

      <Text style={[styles.h, { color: colors.text }]}>
        {t('match.players')} ({joinedCount}/{match.capacity})
      </Text>
      {(['A', 'B', null] as (TeamSide | null)[]).map((side) =>
        teamOf(side).length === 0 ? null : (
          <View key={side ?? 'none'} style={styles.group}>
            <Body muted>{side ? t('match.team', { team: side }) : t('match.noTeam')}</Body>
            {teamOf(side).map((p) => (
              <View key={p.user_id} style={styles.player}>
                <Text style={[styles.name, { color: colors.text }]}>
                  {p.display_name}
                  {p.is_creator ? ` · ${t('match.creator')}` : ''}
                </Text>
                <Text style={[styles.elo, { color: colors.muted }]}>{formatElo(p.elo)}</Text>
                {isCreator && open && !result ? (
                  <Row>
                    {(['A', 'B'] as TeamSide[]).map((s) => (
                      <Chip
                        key={s}
                        label={s}
                        selected={p.team === s}
                        onPress={() => void run(() => api.assignTeam(match.id, p.user_id, s))}
                      />
                    ))}
                  </Row>
                ) : null}
              </View>
            ))}
          </View>
        ),
      )}

      {isCreator && open && full && !result ? (
        <>
          <Button
            testID="balance"
            label={t('match.balance')}
            variant="ghost"
            onPress={() => void run(() => api.autoBalanceTeams(match.id))}
            loading={busy}
          />
          <Body muted>{t('match.balanceHint')}</Body>
        </>
      ) : null}

      {!mine && open && notStarted ? (
        full ? (
          <ErrorText>{t('match.full')}</ErrorText>
        ) : (
          <>
            <CheckRow
              label={t('match.imageConsent')}
              checked={consent}
              onToggle={() => setConsent(!consent)}
            />
            <Button
              testID="join"
              label={t('match.join')}
              onPress={() => void run(() => api.joinMatch(match.id, consent))}
              loading={busy}
            />
          </>
        )
      ) : null}

      {mine && !isCreator && open && notStarted ? (
        <Button
          label={t('match.leave')}
          variant="ghost"
          onPress={() => void run(() => api.leaveMatch(match.id))}
          loading={busy}
        />
      ) : null}

      {phase === 'notStarted' && open ? <Body muted>{t('match.notStarted')}</Body> : null}
      {phase === 'needsTeams' ? <Body muted>{t('match.needsTeams', { half })}</Body> : null}

      {phase === 'canSubmit' ? (
        <>
          <Text style={[styles.h, { color: colors.text }]}>{t('match.scoreTitle')}</Text>
          <Field
            testID="score-a"
            label={t('match.scoreA')}
            keyboardType="number-pad"
            maxLength={2}
            value={scoreA}
            onChangeText={setScoreA}
          />
          <Field
            testID="score-b"
            label={t('match.scoreB')}
            keyboardType="number-pad"
            maxLength={2}
            value={scoreB}
            onChangeText={setScoreB}
          />
          <Button
            testID="submit-score"
            label={t('match.submitScore')}
            onPress={sendScore}
            loading={busy}
          />
        </>
      ) : null}

      {result && phase !== 'canSubmit' ? (
        <Text style={[styles.score, { color: colors.text }]}>
          {result.score_a} – {result.score_b}
        </Text>
      ) : null}
      {phase === 'waitingOtherTeam' ? <Body muted>{t('match.waitingOther')}</Body> : null}
      {phase === 'canRespond' ? (
        <>
          <Body>{t('match.respondTitle')}</Body>
          <Button
            testID="confirm-score"
            label={t('match.confirm')}
            onPress={() => void run(() => api.confirmResult(match.id))}
            loading={busy}
          />
          <Button
            testID="contest-score"
            label={t('match.contest')}
            variant="danger"
            onPress={() => void run(() => api.contestResult(match.id))}
            loading={busy}
          />
        </>
      ) : null}
      {phase === 'contested' ? <Body>{t('match.contested')}</Body> : null}
      {phase === 'final' ? <Body>{t('match.final')}</Body> : null}

      {isCreator && open && !result ? (
        <Button
          label={t('match.cancel')}
          variant="danger"
          onPress={() => void run(() => api.cancelMatch(match.id))}
          loading={busy}
        />
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { fontFamily: fonts.display, fontSize: 24, marginTop: 8 },
  group: { gap: 6 },
  player: { gap: 6, minHeight: 44, justifyContent: 'center' },
  name: { fontFamily: fonts.bodySemi, fontSize: 16 },
  elo: { fontFamily: fonts.body, fontSize: 13 },
  score: { fontFamily: fonts.displayBlack, fontSize: 56, textAlign: 'center' },
});
