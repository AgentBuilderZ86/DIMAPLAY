import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { I18nManager } from 'react-native';
import { initReactI18next } from 'react-i18next';

import ar from './ar';
import en from './en';
import fr from './fr';

export const SUPPORTED_LANGUAGES = ['fr', 'ar', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const i18n = createInstance();

export function resolveLanguage(code: string | null | undefined): Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code ?? '')
    ? (code as Language)
    : 'fr';
}

export function isRtl(lang: Language): boolean {
  return lang === 'ar';
}

/** Applies layout direction. A native restart is required for the change to fully take effect. */
export function applyDirection(lang: Language): void {
  const rtl = isRtl(lang);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }
}

export function initI18n(preferred?: string | null): Language {
  const lang = resolveLanguage(preferred ?? getLocales()[0]?.languageCode);
  void i18n.use(initReactI18next).init({
    lng: lang,
    fallbackLng: 'fr',
    resources: { fr: { translation: fr }, ar: { translation: ar }, en: { translation: en } },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  applyDirection(lang);
  return lang;
}

export default i18n;
