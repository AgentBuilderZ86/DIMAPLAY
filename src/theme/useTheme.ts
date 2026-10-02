import { useColorScheme } from 'react-native';

import { palettes, type Palette, type Scheme } from './tokens';

export function useTheme(): { scheme: Scheme; colors: Palette } {
  const scheme: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, colors: palettes[scheme] };
}
