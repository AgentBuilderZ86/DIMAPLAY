import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { MomentPad } from '@/components/MomentPad';
import { Body, Button, Screen, Title } from '@/components/ui';
import type { Sport } from '@/features/profile/types';
import { markMoment } from '@/features/video/api';
import { formatClock } from '@/features/video/moments';
import { supabase } from '@/lib/supabase';

/** Other players mark highlights from their own phone while one phone films (Supabase Realtime). */
export default function MarkLive() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { matchId, sport } = useLocalSearchParams<{ matchId: string; sport: Sport }>();
  const [live, setLive] = useState(true);
  const [marks, setMarks] = useState<{ label: string; at: number }[]>([]);
  const [started] = useState(() => Date.now());

  useEffect(() => {
    const channel = supabase
      .channel(`recording-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'videos', filter: `match_id=eq.${matchId}` },
        (p) => {
          if ((p.new as { status?: string }).status !== 'recording') setLive(false);
        },
      )
      .subscribe();
    // Realtime can drop on bad pitch Wi-Fi: also re-check from time to time.
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from('videos')
        .select('id')
        .eq('match_id', matchId)
        .eq('status', 'recording')
        .limit(1);
      if (data && data.length === 0) setLive(false);
    }, 10_000);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [matchId]);

  if (!live) {
    return (
      <Screen>
        <Title>{t('film.stopped')}</Title>
        <Body muted>{t('film.stoppedBody')}</Body>
        <Button
          label={t('common.back')}
          onPress={() => {
            void qc.invalidateQueries({ queryKey: ['film'] });
            router.back();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('film.markLive')}</Title>
      <Body muted>{t('film.tipMarks')}</Body>
      <MomentPad
        matchId={matchId}
        sport={sport}
        onMark={async (type, subject) => {
          await markMoment(matchId, type, subject);
          setMarks((m) => [
            { label: t(`moments.${type}`), at: (Date.now() - started) / 1000 },
            ...m,
          ]);
        }}
      />
      <Body muted>{t('film.yourMarks')}</Body>
      {marks.length === 0 ? <Body muted>{t('film.noMarks')}</Body> : null}
      {marks.map((m, i) => (
        <View key={i}>
          <Body>
            {formatClock(m.at)} · {m.label}
          </Body>
        </View>
      ))}
      <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
