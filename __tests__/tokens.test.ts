import { brand, dark, light, type Palette } from '@/theme/tokens';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([
  ['light', light],
  ['dark', dark],
] as [string, Palette][])('%s palette meets WCAG AA (4.5:1)', (_name, p) => {
  it.each([
    ['text on bg', p.text, p.bg],
    ['text on surface', p.text, p.surface],
    ['muted on bg', p.muted, p.bg],
    ['muted on surface', p.muted, p.surface],
    ['onHeader on header', p.onHeader, p.header],
    ['onPrimary on primary', p.onPrimary, p.primary],
    ['onAccent on accent', p.onAccent, p.accent],
    ['activeTab on surface', p.activeTab, p.surface],
    ['danger on bg', p.danger, p.bg],
    ['onDanger on danger', p.onDanger, p.danger],
  ])('%s', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

it('keeps the brand tokens from the design charter', () => {
  expect(brand).toEqual({
    turf: '#0F4D32',
    turf2: '#17683F',
    chalk: '#F5F7F2',
    court: '#2747C9',
    clay: '#A84A2B',
    flood: '#F2D13D',
    ink: '#14201A',
  });
});
