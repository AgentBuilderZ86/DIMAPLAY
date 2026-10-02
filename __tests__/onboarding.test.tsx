import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Onboarding from '@/app/onboarding';
import { useAuth } from '@/features/auth/store';
import * as api from '@/features/profile/api';
import { initI18n } from '@/i18n';
import fr from '@/i18n/fr';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/profile/api');

const mocked = jest.mocked(api);
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

beforeAll(() => initI18n('fr'));
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.setState({
    session: { user: { id: 'u1', user_metadata: { full_name: 'Mehdi Alaoui' } } } as never,
    refreshProfile: jest.fn(async () => {}),
  });
});

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Onboarding />
    </SafeAreaProvider>,
  );
}

it('blocks each step until its fields are valid, then saves profile and consents in order', async () => {
  await renderScreen();

  // Step 1: prefilled first name from Apple; clearing it blocks progress
  expect(screen.getByTestId('display-name').props.value).toBe('Mehdi');
  await fireEvent.changeText(screen.getByTestId('display-name'), '');
  await fireEvent.press(screen.getByTestId('next'));
  expect(screen.getByText(fr.fieldErrors.displayNameLength)).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId('display-name'), 'Mehdi');
  await fireEvent.press(screen.getByTestId('next'));

  // Step 2: sports
  await fireEvent.press(screen.getByTestId('next'));
  expect(screen.getByText(fr.fieldErrors.sportsRequired)).toBeTruthy();
  await fireEvent.press(screen.getByTestId('sport-foot'));
  await fireEvent.press(screen.getByTestId('next'));

  // Step 3: place
  await fireEvent.changeText(screen.getByTestId('city'), 'Casablanca');
  await fireEvent.changeText(screen.getByTestId('neighborhood'), 'Maârif');
  await fireEvent.press(screen.getByTestId('next'));

  // Step 4: birth year; a minor sees the privacy notice
  await fireEvent.changeText(screen.getByTestId('birth-year'), '2015');
  await fireEvent.press(screen.getByTestId('next'));
  expect(screen.getByText(fr.fieldErrors.birthYearInvalid)).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId('birth-year'), '2010');
  expect(screen.getByText(fr.onboarding.minorNotice)).toBeTruthy();
  await fireEvent.press(screen.getByTestId('next'));

  // Step 5: finish disabled until both consents are ticked
  expect(screen.getByTestId('finish').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByTestId('consent-terms'));
  await fireEvent.press(screen.getByTestId('consent-privacy'));
  await fireEvent.press(screen.getByTestId('finish'));

  await waitFor(() => expect(mocked.completeOnboarding).toHaveBeenCalled());
  expect(mocked.updateProfile).toHaveBeenCalledWith(
    'u1',
    expect.objectContaining({
      display_name: 'Mehdi',
      city: 'Casablanca',
      birth_year: 2010,
      sports: ['foot'],
    }),
  );
  expect(mocked.recordConsent).toHaveBeenNthCalledWith(1, 'u1', 'terms', true);
  expect(mocked.recordConsent).toHaveBeenNthCalledWith(2, 'u1', 'privacy', true);
  expect(useAuth.getState().refreshProfile).toHaveBeenCalled();
});
