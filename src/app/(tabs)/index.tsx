import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ClipCard } from '@/components/ClipCard';
import { UploadBanner } from '@/components/UploadBanner';
import { Body, Button, ErrorText, Screen, Title } from '@/components/ui';
import { listClips } from '@/features/video/api';
import { fonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['clips'],
    queryFn: listClips,
    // clips are rendered by a background worker: keep checking while some are still being prepared
    refetchInterval: (q) =>
      q.state.data?.some((c) => c.status === 'queued' || c.status === 'processing')
        ? 15_000
        : false,
  });

  return (
    <Screen>
      <Title>{t('clips.title')}</Title>
      <UploadBanner />
      {isError ? (
        <>
          <ErrorText>{t('clips.loadFailed')}</ErrorText>
          <Button label={t('common.retry')} variant="ghost" onPress={() => void refetch()} />
        </>
      ) : null}
      {!isLoading && !isError && data?.length === 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.text }}>
            {t('clips.emptyTitle')}
          </Text>
          <Body muted>{t('clips.emptyBody')}</Body>
        </View>
      ) : null}
      {data?.map((c) => (
        <ClipCard key={c.id} clip={c} />
      ))}
    </Screen>
  );
}
