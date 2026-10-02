import ar from '@/i18n/ar';
import en from '@/i18n/en';
import fr from '@/i18n/fr';
import { isRtl, resolveLanguage } from '@/i18n';

function keys(o: object, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

it('has identical keys in FR, EN and AR', () => {
  const base = keys(fr).sort();
  expect(keys(en).sort()).toEqual(base);
  expect(keys(ar).sort()).toEqual(base);
});

it('has no empty translations', () => {
  for (const dict of [fr, en, ar]) {
    for (const k of keys(dict)) {
      const value = k.split('.').reduce((acc: any, part) => acc[part], dict);
      expect(String(value).trim()).not.toBe('');
    }
  }
});

it('resolves languages with a French default and RTL only for Arabic', () => {
  expect(resolveLanguage('en')).toBe('en');
  expect(resolveLanguage('ar')).toBe('ar');
  expect(resolveLanguage('de')).toBe('fr');
  expect(resolveLanguage(null)).toBe('fr');
  expect(isRtl('ar')).toBe(true);
  expect(isRtl('fr')).toBe(false);
});
