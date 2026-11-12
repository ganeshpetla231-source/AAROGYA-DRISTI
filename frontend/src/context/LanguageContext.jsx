import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.jsx';
import i18n, { hasLanguagePreference, supportedLanguages } from '../i18n/index.js';

const LanguageContext = createContext(null);
const languageStorageKey = 'aarogya-language';

export function LanguageProvider({ children }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [hasSavedPreference, setHasSavedPreference] = useState(hasLanguagePreference);
  const hasPreference = hasSavedPreference || (!loading && supportedLanguages.includes(user?.language));
  const selectedLanguage = supportedLanguages.includes(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';

  const changeLanguage = useCallback(async language => {
    if (!supportedLanguages.includes(language)) throw new Error(t('language.invalid'));
    await i18n.changeLanguage(language);
    setHasSavedPreference(true);
    try {
      window.localStorage.setItem(languageStorageKey, language);
    } catch {
      throw new Error(t('language.localStorageFailed'));
    }
    return language;
  }, [t]);

  const value = useMemo(() => ({
    selectedLanguage,
    hasPreference,
    changeLanguage,
    t
  }), [selectedLanguage, hasPreference, changeLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}
