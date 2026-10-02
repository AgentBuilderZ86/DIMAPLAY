import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { EmptyTab } from '@/components/EmptyTab';
import { initI18n } from '@/i18n';
import fr from '@/i18n/fr';

beforeAll(() => {
  initI18n('fr');
});

it('renders the French title and body for a tab', async () => {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <EmptyTab tab="ranking" />
    </SafeAreaProvider>,
  );
  expect(screen.getByText(fr.empty.ranking.title)).toBeTruthy();
  expect(screen.getByText(fr.empty.ranking.body)).toBeTruthy();
});
