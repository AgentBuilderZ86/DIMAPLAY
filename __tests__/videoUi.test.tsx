import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from '@/app/(tabs)/index';
import { MomentPad } from '@/components/MomentPad';
import { UploadBanner } from '@/components/UploadBanner';
import * as api from '@/features/video/api';
import type { UploadJob } from '@/features/video/uploadQueue';
import { initI18n } from '@/i18n';
import fr from '@/i18n/fr';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/video/api');
jest.mock('@/features/matches/api', () => ({
  fetchMatch: jest.fn(async () => ({
    participants: [
      { user_id: 'me', display_name: 'Mehdi' },
      { user_id: 'u2', display_name: 'Hamza' },
    ],
  })),
}));
const mockJobs: { current: UploadJob[] } = { current: [] };
jest.mock('@/features/video/runner', () => ({
  uploadQueue: { retry: jest.fn(async () => {}), run: jest.fn(async () => {}) },
  useUploadJobs: () => mockJobs.current,
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
async function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const mocked = jest.mocked(api);

beforeAll(() => initI18n('fr'));

describe('clip feed', () => {
  const clip = (over: Partial<api.ClipRow>): api.ClipRow => ({
    id: 'c1',
    status: 'ready',
    visibility: 'match',
    storage_path: 'm1/c1.mp4',
    match_id: 'm1',
    start_ms: 0,
    end_ms: 12000,
    created_at: '2026-10-05T20:00:00Z',
    moment: { type: 'goal', subject_user_id: 'me' },
    match: { sport: 'foot', starts_at: '2026-10-05T19:00:00Z', venue: 'Five Oasis' },
    ...over,
  });

  it('lists ready clips and flags the ones still being prepared', async () => {
    mockJobs.current = [];
    mocked.listClips.mockResolvedValue([
      clip({}),
      clip({
        id: 'c2',
        status: 'processing',
        storage_path: null,
        moment: { type: 'save', subject_user_id: null },
      }),
    ]);
    await renderWithProviders(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('But · Foot à 5')).toBeTruthy());
    expect(screen.getByText('Arrêt · Foot à 5')).toBeTruthy();
    expect(screen.getByText(fr.clips.preparing)).toBeTruthy();
    expect(screen.getByTestId('clip-c2').props.accessibilityState?.disabled).toBe(true);
  });

  it('shows a helpful empty state', async () => {
    mockJobs.current = [];
    mocked.listClips.mockResolvedValue([]);
    await renderWithProviders(<HomeScreen />);
    await waitFor(() => expect(screen.getByText(fr.clips.emptyTitle)).toBeTruthy());
    expect(screen.getByText(fr.clips.emptyBody)).toBeTruthy();
  });
});

describe('upload banner', () => {
  const job = (state: UploadJob['state'], sent = 500): UploadJob => ({
    videoId: 'v1',
    localUri: 'file:///v.mp4',
    sizeBytes: 1000,
    state,
    sentBytes: sent,
    updatedAt: 1,
  });

  it('shows progress, then the paused message that promises an automatic resume', async () => {
    mockJobs.current = [job('uploading')];
    await renderWithProviders(<UploadBanner />);
    expect(screen.getByText('Envoi en cours : 50 %')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 50,
    });
  });

  it('offers a retry on failure and renders nothing without jobs', async () => {
    mockJobs.current = [job('failed')];
    await renderWithProviders(<UploadBanner />);
    expect(screen.getByText(fr.upload.failed)).toBeTruthy();
    expect(screen.getByText(fr.upload.retry)).toBeTruthy();
  });

  it('is silent when there is nothing to upload', async () => {
    mockJobs.current = [];
    await renderWithProviders(<UploadBanner />);
    expect(screen.queryByText(fr.upload.title)).toBeNull();
  });
});

describe('moment pad', () => {
  it('offers the moves of the sport and marks for the chosen player', async () => {
    const onMark = jest.fn(async () => {});
    await renderWithProviders(<MomentPad matchId="m1" sport="padel" onMark={onMark} />);
    expect(screen.getByText('Smash')).toBeTruthy();
    expect(screen.getByText('Bandeja')).toBeTruthy();
    expect(screen.queryByText('But')).toBeNull();

    await fireEvent.press(screen.getByTestId('moment-smash'));
    expect(onMark).toHaveBeenLastCalledWith('smash', undefined);

    await waitFor(() => expect(screen.getByText('Hamza')).toBeTruthy());
    await fireEvent.press(screen.getByText('Hamza'));
    await fireEvent.press(screen.getByTestId('moment-bandeja'));
    expect(onMark).toHaveBeenLastCalledWith('bandeja', 'u2');
  });

  it('shows an error when the mark could not be saved', async () => {
    const onMark = jest.fn(async () => {
      throw new Error('offline');
    });
    await renderWithProviders(<MomentPad matchId="m1" sport="foot" onMark={onMark} />);
    await fireEvent.press(screen.getByTestId('moment-goal'));
    await waitFor(() => expect(screen.getByText(fr.common.errorGeneric)).toBeTruthy());
  });
});
