import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Body, Button, Chip, ErrorText, Row, Screen, Title } from '@/components/ui';
import { downloadClip, getClip, setClipVisibility, signedClipUrl } from '@/features/video/api';

export default function ClipPlayer() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clip = useQuery({ queryKey: ['clips', id], queryFn: () => getClip(id) });
  const url = useQuery({
    queryKey: ['clips', id, 'url'],
    queryFn: () => signedClipUrl(clip.data!.storage_path!),
    enabled: !!clip.data?.storage_path,
    staleTime: 30 * 60_000,
  });
  const player = useVideoPlayer(url.data ?? null, (p) => {
    p.loop = true;
    p.play();
  });

  const share = async () => {
    if (!url.data) return;
    setMessage(null);
    setBusy(true);
    try {
      const uri = await downloadClip(url.data, id);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'video/mp4',
          UTI: 'public.mpeg-4',
          dialogTitle: t('clips.share'),
        });
      } else {
        setMessage(t('clips.shareFailed'));
      }
    } catch {
      setMessage(t('clips.shareFailed'));
    } finally {
      setBusy(false);
    }
  };

  const setVisibility = async (v: 'match' | 'public') => {
    setMessage(null);
    try {
      await setClipVisibility(id, v);
      await qc.invalidateQueries({ queryKey: ['clips'] });
    } catch (e) {
      // 22023 = consent/minor rule refused the change
      setMessage(
        (e as { code?: string }).code === '22023'
          ? t('clips.publicBlocked')
          : t('clips.visibilityFailed'),
      );
    }
  };

  return (
    <Screen>
      <Title>{t('clips.share')}</Title>
      <View style={styles.player}>
        {url.data ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            nativeControls
            contentFit="cover"
          />
        ) : null}
      </View>
      {clip.isError || url.isError ? <ErrorText>{t('clips.playFailed')}</ErrorText> : null}
      <Button
        testID="share-clip"
        label={busy ? t('clips.sharing') : t('clips.share')}
        variant="accent"
        onPress={() => void share()}
        loading={busy}
        disabled={!url.data}
      />
      {clip.data ? (
        <>
          <Body muted>{t('clips.visibility')}</Body>
          <Row>
            <Chip
              label={t('clips.onlyMatch')}
              selected={clip.data.visibility === 'match'}
              onPress={() => void setVisibility('match')}
            />
            <Chip
              label={t('clips.publicClip')}
              selected={clip.data.visibility === 'public'}
              onPress={() => void setVisibility('public')}
            />
          </Row>
        </>
      ) : null}
      {message ? <ErrorText>{message}</ErrorText> : null}
      <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  player: {
    aspectRatio: 9 / 16,
    maxHeight: 520,
    alignSelf: 'center',
    width: '70%',
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
  },
});
