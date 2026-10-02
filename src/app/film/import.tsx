import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MomentPad } from '@/components/MomentPad';
import { Body, Button, ErrorText, Row, Screen, Title } from '@/components/ui';
import { useAuth } from '@/features/auth/store';
import { registerForPush } from '@/features/notifications/push';
import type { Sport } from '@/features/profile/types';
import { addMomentAt, setVideoDuration, startRecording } from '@/features/video/api';
import { MAX_VIDEO_SECONDS, formatClock } from '@/features/video/moments';
import { uploadQueue } from '@/features/video/runner';

interface Picked {
  uri: string;
  seconds: number;
  sizeBytes: number;
}

/** Import a match video from the photo library, mark moments while watching it, then send it. */
export default function ImportVideo() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const userId = useAuth((s) => s.session?.user.id);
  const { matchId, sport, startsAt } = useLocalSearchParams<{
    matchId: string;
    sport: Sport;
    startsAt: string;
  }>();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [shiftMin, setShiftMin] = useState(0);
  const [marks, setMarks] = useState<{ label: string; at: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const player = useVideoPlayer(picked?.uri ?? null, (p) => {
    p.loop = false;
  });

  const pick = async () => {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const seconds = (a.duration ?? 0) / 1000;
    if (seconds <= 0) return setError(t('film.importFailed'));
    if (seconds > MAX_VIDEO_SECONDS) return setError(t('film.tooLong'));
    setBusy(true);
    try {
      const start = new Date(new Date(startsAt).getTime() + shiftMin * 60_000);
      const id = await startRecording(matchId, 'import', start);
      await setVideoDuration(id, seconds);
      setVideoId(id);
      setPicked({ uri: a.uri, seconds, sizeBytes: a.fileSize ?? 0 });
    } catch {
      setError(t('film.importFailed'));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!picked || !videoId) return;
    setBusy(true);
    try {
      await uploadQueue.enqueue({ videoId, localUri: picked.uri, sizeBytes: picked.sizeBytes });
      void uploadQueue.run();
      if (userId) void registerForPush(userId).catch(() => {});
      void qc.invalidateQueries({ queryKey: ['film'] });
      router.replace('/(tabs)/film');
    } catch {
      setError(t('film.importFailed'));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{t('film.importTitle')}</Title>
      {!picked ? (
        <>
          <Body muted>{t('film.importHint')}</Body>
          <Body>{t('film.shift', { minutes: shiftMin })}</Body>
          <Row>
            <Button
              label={t('film.shiftMinus')}
              variant="ghost"
              onPress={() => setShiftMin((m) => m - 1)}
            />
            <Button
              label={t('film.shiftPlus')}
              variant="ghost"
              onPress={() => setShiftMin((m) => m + 1)}
            />
          </Row>
          <Button
            testID="pick-video"
            label={t('film.pickVideo')}
            onPress={() => void pick()}
            loading={busy}
          />
        </>
      ) : (
        <>
          <View style={styles.player}>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              nativeControls
              contentFit="contain"
            />
          </View>
          <MomentPad
            matchId={matchId}
            sport={sport}
            onMark={async (type, subject) => {
              const at = player.currentTime;
              await addMomentAt(videoId!, type, at * 1000, subject);
              setMarks((m) => [{ label: t(`moments.${type}`), at }, ...m]);
            }}
          />
          <Body muted>{t('film.yourMarks')}</Body>
          {marks.length === 0 ? <Body muted>{t('film.noMarks')}</Body> : null}
          {marks.map((m, i) => (
            <Body key={i}>
              {formatClock(m.at)} · {m.label}
            </Body>
          ))}
          <Button
            testID="send-video"
            label={t('film.send')}
            variant="accent"
            onPress={() => void send()}
            loading={busy}
          />
        </>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  player: { aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
});
