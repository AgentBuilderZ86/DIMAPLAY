import { secureStorage } from '@/lib/supabase';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __mem: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
jest.mock('react-native-url-polyfill/auto', () => ({}));

const mockMem: Map<string, string> = jest.requireMock('expo-secure-store').__mem;

beforeEach(() => mockMem.clear());

it('round-trips values larger than the SecureStore per-key limit', async () => {
  const big = 'x'.repeat(5000) + 'é' + 'y'.repeat(100);
  await secureStorage.setItem('sb-token', big);
  expect(mockMem.size).toBeGreaterThan(2);
  expect(await secureStorage.getItem('sb-token')).toBe(big);
});

it('replaces and removes values without leaving chunks behind', async () => {
  await secureStorage.setItem('k', 'a'.repeat(4000));
  await secureStorage.setItem('k', 'short');
  expect(await secureStorage.getItem('k')).toBe('short');
  await secureStorage.removeItem('k');
  expect(await secureStorage.getItem('k')).toBeNull();
  expect(mockMem.size).toBe(0);
});
