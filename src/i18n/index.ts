import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import tr from './locales/tr';

export const LANGUAGE_KEY = 'qurantrack-language';
const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(LANGUAGE_KEY);
export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, tr: { translation: tr } },
  lng: saved === 'tr' ? 'tr' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  localStorage.setItem(LANGUAGE_KEY, language);
});
if (typeof document !== 'undefined') document.documentElement.lang = i18n.language;
