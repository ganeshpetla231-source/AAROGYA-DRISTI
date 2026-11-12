import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json';
import te from './locales/te/translation.json';
import hi from './locales/hi/translation.json';

export const supportedLanguages = ['en', 'te', 'hi'];
const languageStorageKey = 'aarogya-language';

export function getConfiguredInitialLanguage() {
  const configured = import.meta.env.VITE_INITIAL_LANGUAGE;
  return supportedLanguages.includes(configured) ? configured : null;
}

export function hasLanguagePreference() {
  try {
    const saved = window.localStorage.getItem(languageStorageKey);
    return supportedLanguages.includes(saved) || Boolean(getConfiguredInitialLanguage());
  } catch {
    return Boolean(getConfiguredInitialLanguage());
  }
}

function readInitialLanguage() {
  try {
    const saved = window.localStorage.getItem(languageStorageKey);
    if (supportedLanguages.includes(saved)) return saved;
  } catch {
    // The language gate still works when browser storage is unavailable.
  }
  return getConfiguredInitialLanguage() || 'en';
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      te: { translation: te },
      hi: { translation: hi }
    },
    lng: readInitialLanguage(),
    fallbackLng: 'en',
    supportedLngs: supportedLanguages,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    react: { useSuspense: false }
  }).catch(error => {
    console.error('Could not initialize translations; English fallback will be used.', error);
    i18n.changeLanguage('en');
  });
}

i18n.on('languageChanged', language => {
  const selectedLanguage = supportedLanguages.includes(language) ? language : 'en';
  document.documentElement.lang = selectedLanguage;
  try {
    window.localStorage.setItem(languageStorageKey, selectedLanguage);
  } catch (error) {
    console.warn('Could not persist the selected language in local storage.', error);
  }
});

document.documentElement.lang = supportedLanguages.includes(i18n.language) ? i18n.language : 'en';

export default i18n;
