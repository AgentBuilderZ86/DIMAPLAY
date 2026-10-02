/** Brand tokens. Components must use these (via useTheme), never raw hex values. */
export const brand = {
  turf: '#0F4D32',
  turf2: '#17683F',
  chalk: '#F5F7F2',
  court: '#2747C9',
  clay: '#A84A2B',
  flood: '#F2D13D',
  ink: '#14201A',
} as const;

export type Sport = 'foot' | 'padel' | 'tennis';

export interface Palette {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  soft: string;
  header: string;
  onHeader: string;
  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  activeTab: string;
  danger: string;
  onDanger: string;
  sport: Record<Sport, string>;
}

export const light: Palette = {
  bg: brand.chalk,
  surface: '#FFFFFF',
  text: brand.ink,
  muted: '#5B6B62',
  line: '#DCE3DB',
  soft: '#EAF0E8',
  header: brand.turf,
  onHeader: '#FFFFFF',
  primary: brand.turf,
  onPrimary: '#FFFFFF',
  accent: brand.flood,
  onAccent: brand.ink,
  activeTab: brand.turf2,
  danger: '#B3261E',
  onDanger: '#FFFFFF',
  sport: { foot: brand.turf2, padel: brand.court, tennis: brand.clay },
};

export const dark: Palette = {
  ...light,
  bg: '#0E1913',
  surface: '#15241B',
  text: '#EEF3EC',
  muted: '#9DB0A4',
  line: '#23382B',
  soft: '#1B2D22',
  activeTab: brand.flood,
  danger: '#FF8A80',
  onDanger: brand.ink,
  sport: { foot: '#1F7A4A', padel: '#5B78E8', tennis: '#D0714E' },
};

export const palettes = { light, dark } as const;
export type Scheme = keyof typeof palettes;

export const MIN_TOUCH_TARGET = 44;
