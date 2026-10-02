import { useQueryClient } from '@tanstack/react-query';
import { useKeepAwake } from 'expo-keep-awake';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput,
  type Recorder,
} from 'react-native-vision-camera';

import { MomentPad } from '@/components/MomentPad';
import { Body, Button, ErrorText, Screen, Title } from '@/components/ui';
import { useAuth } from '@/features/auth/store';
import { registerForPush } from '@/features/notifications/push';
import type { Sport } from '@/features/profile/types';
import { markMoment, startRecording, stopRecording } from '@/features/video/api';
import { MAX_VIDEO_SECONDS, formatClock } from '@/features/video/moments';
import { uploadQueue } from '@/features/video/runner';
import { fonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

type Phase = 'ready' | 'recording' | 'saving' | 'error';

// 720p at 4 Mbit/s keeps a 60-minute match near 1.8 GB: cheap to upload and store.
const BITRATE = 4_000_000;

export default function CameraScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const userId = useAuth((s) => s.session?.user.id);
  const { matchId, sport } = useLocalSearchParams<{ matchId: string; sport: Sport }>();

  const camera = useCameraPermission();
  const mic = useMicrophonePermission();
  const device = useCameraDevice('back');
  const videoOutput = useVideoOutput({
    targetResolution: CommonResolutions.HD_16_9,
    targetBitRate: BITRATE,
    enableAudio: mic.hasPermission,
    fileType: 'mp4',
  });

  const [phase, setPhase] = useState<Phase>('ready');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const videoId = useRef<string | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const filePath = useRef<string | null>(null);
  const duration = useRef(0);

  useKeepAwake(phase === 'recording' ? 'recording' : undefined);

  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => {
      const s = recorder.current?.recordedDuration ?? 0;
      duration.current = s;
      setSeconds(s);
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  const begin = async () => {
    setError(null);
    try {
      videoId.current = await startRecording(matchId, 'camera');
    } catch {
      setError(t('film.startFailed'));
      return;
    }
    try {
      const r = await videoOutput.createRecorder({ maxDuration: MAX_VIDEO_SECONDS });
      recorder.current = r;
      await r.startRecording(
        (path) => {
          filePath.current = path;
          void finalize(path);
        },
        () => {
          setError(t('film.recordFailed'));
          void finalize(null);
        },
      );
      setPhase('recording');
    } catch {
      setError(t('film.startFailed'));
      // unlock the match for another phone
      if (videoId.current) await stopRecording(videoId.current, 0).catch(() => {});
    }
  };

  /** Runs once the file is fully written: close the recording server-side and queue the upload. */
  const finalize = async (path: string | null) => {
    const id = videoId.current;
    if (!id) return;
    videoId.current = null;
    setPhase('saving');
    try {
      const seconds = Math.max(1, duration.current);
      await stopRecording(id, seconds);
      if (!path) {
        setPhase('error');
        return;
      }
      const uri = `file://${path}`;
      const size = new File(uri).size;
      await uploadQueue.enqueue({ videoId: id, localUri: uri, sizeBytes: size });
      void uploadQueue.run();
      if (userId) void registerForPush(userId).catch(() => {});
      void qc.invalidateQueries({ queryKey: ['film'] });
      router.replace('/(tabs)/film');
    } catch {
      setError(t('film.recordFailed'));
      setPhase('error');
    }
  };

  const stop = async () => {
    if (!recorder.current?.isRecording) return;
    duration.current = recorder.current.recordedDuration;
    await recorder.current.stopRecording(); // onRecordingFinished -> finalize
  };

  if (!camera.hasPermission) {
    return (
      <Screen>
        <Title>{t('film.title')}</Title>
        <Body>
          {camera.canRequestPermission ? t('film.permissionNeeded') : t('film.cameraDenied')}
        </Body>
        {camera.canRequestPermission ? (
          <Button label={t('film.allow')} onPress={() => void camera.requestPermission()} />
        ) : (
          <Button label={t('film.openSettings')} onPress={() => void Linking.openSettings()} />
        )}
        <Button
          label={t('film.import')}
          variant="ghost"
          onPress={() =>
            router.replace({
              pathname: '/film/import',
              params: { matchId, sport, startsAt: new Date().toISOString() },
            })
          }
        />
        <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={[styles.viewfinder, { backgroundColor: '#000' }]}>
        {device ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive
            outputs={[videoOutput]}
          />
        ) : null}
        {phase === 'recording' ? (
          <View style={styles.rec} accessibilityLabel={t('film.recording')}>
            <Text style={styles.recText}>● {t('film.recording')}</Text>
          </View>
        ) : null}
      </View>
      <Text accessibilityRole="timer" style={[styles.clock, { color: colors.text }]}>
        {formatClock(seconds)}
      </Text>

      {phase === 'ready' ? (
        <>
          {!mic.hasPermission && mic.canRequestPermission ? (
            <Button
              label={t('film.allow')}
              variant="ghost"
              onPress={() => void mic.requestPermission()}
            />
          ) : null}
          {!mic.hasPermission && !mic.canRequestPermission ? (
            <Body muted>{t('film.micDenied')}</Body>
          ) : null}
          <Body muted>{t('film.tipMarks')}</Body>
          <Button
            testID="start-recording"
            label={t('film.start')}
            variant="accent"
            onPress={() => void begin()}
          />
          <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
        </>
      ) : null}

      {phase === 'recording' ? (
        <>
          <MomentPad
            matchId={matchId}
            sport={sport}
            onMark={async (type, subject) => void (await markMoment(matchId, type, subject))}
          />
          <Button
            testID="stop-recording"
            label={t('film.stop')}
            variant="danger"
            onPress={() => void stop()}
          />
        </>
      ) : null}

      {phase === 'saving' ? <Body muted>{t('common.loading')}</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {phase === 'error' ? <Button label={t('common.back')} onPress={() => router.back()} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewfinder: { aspectRatio: 16 / 10, borderRadius: 16, overflow: 'hidden' },
  rec: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#C0392B',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  recText: { color: '#FFFFFF', fontFamily: fonts.bodyBold, fontSize: 13 },
  clock: { fontFamily: fonts.displayBlack, fontSize: 64, textAlign: 'center', lineHeight: 68 },
});
