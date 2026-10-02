import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RankingScreen from '@/app/(tabs)/ranking';
import { useAuth } from '@/features/auth/store';
import * as api from '@/features/rankings/api';
import { initI18n } from '@/i18n';
import fr from '@/i18n/fr';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/rankings/api', () => ({
  ...jest.requireActual('@/features/rankings/api'),
  fetchRanking: jest.fn(),
  fetchMyStanding: jest.fn(),
}));

const mocked = jest.mocked(api);
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const row = (over: Partial<api.RankingRow>): api.RankingRow => ({
  pos: 1,
  user_id: 'u1',
  display_name: 'Hamza',
  handle: null,
  city: 'Casablanca',
  neighborhood: 'Maârif',
  elo: 1022,
  matches_count: 1,
  calibrating: true,
  change7d: 3,
  is_me: false,
  ...over,
});

async function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <RankingScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(() => initI18n('fr'));
beforeEach(() => {
  useAuth.setState({ profile: { is_minor: false } as never });
});

it('shows ranked players, calibration and the caller standing', async () => {
  mocked.fetchRanking.mockResolvedValue([
    row({}),
    row({ pos: 2, user_id: 'u2', display_name: 'Yassine', elo: 978, change7d: -2 }),
  ]);
  mocked.fetchMyStanding.mockResolvedValue({
    elo: 1022,
    matches_count: 1,
    calibrating: true,
    rank_neighborhood: 1,
    rank_city: 1,
    rank_morocco: 1,
  });
  await renderScreen();
  await waitFor(() => expect(screen.getByText('Hamza')).toBeTruthy());
  expect(screen.getByText('Yassine')).toBeTruthy();
  expect(screen.getAllByText(/en calibration/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Rang 1/)).toBeTruthy();
});

it('shows a useful empty state instead of a blank screen', async () => {
  mocked.fetchRanking.mockResolvedValue([]);
  mocked.fetchMyStanding.mockResolvedValue(null);
  await renderScreen();
  await waitFor(() => expect(screen.getByText(fr.ranking.emptyTitle)).toBeTruthy());
  expect(screen.getByText(fr.ranking.emptyBody)).toBeTruthy();
});

it('explains to minors why they are not in public rankings', async () => {
  useAuth.setState({ profile: { is_minor: true } as never });
  mocked.fetchRanking.mockResolvedValue([]);
  mocked.fetchMyStanding.mockResolvedValue(null);
  await renderScreen();
  await waitFor(() => expect(screen.getByText(fr.ranking.minorNoRank)).toBeTruthy());
});
