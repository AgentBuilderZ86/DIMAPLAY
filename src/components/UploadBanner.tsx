import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { uploadQueue, useUploadJobs } from '@/features/video/runner';
import { fonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

/** Shows the state of video uploads (progress, paused on network loss, failed with retry). */
export function UploadBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const jobs = useUploadJobs();
  if (jobs.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      {jobs.map((j) => {
        const percent = Math.min(100, Math.floor((j.sentBytes / Math.max(1, j.sizeBytes)) * 100));
        const label =
          j.state === 'uploading'
            ? t('upload.uploading', { percent })
            : j.state === 'paused'
              ? t('upload.paused')
              : j.state === 'failed'
                ? t('upload.failed')
                : j.state === 'done'
                  ? t('upload.done')
                  : t('upload.pending');
        return (
          <View
            key={j.videoId}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${t('upload.title')}. ${label}`}
            accessibilityValue={{ min: 0, max: 100, now: percent }}
            style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.line }]}
          >
            <Text style={[styles.title, { color: colors.text }]}>{t('upload.title')}</Text>
            <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
            <View style={[styles.track, { backgroundColor: colors.soft }]}>
              <View
                style={[styles.fill, { width: `${percent}%`, backgroundColor: colors.activeTab }]}
              />
            </View>
            {j.state === 'failed' ? (
              <Button
                label={t('upload.retry')}
                variant="ghost"
                onPress={() => void uploadQueue.retry(j.videoId).then(() => uploadQueue.run())}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  title: { fontFamily: fonts.bodyBold, fontSize: 15 },
  label: { fontFamily: fonts.body, fontSize: 13 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
