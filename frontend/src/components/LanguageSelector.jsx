import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { supportedLanguages } from '../i18n/index.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const languageNameKeys = { en: 'english', te: 'telugu', hi: 'hindi' };

export function LanguageSelector({ className = '' }) {
  const { t } = useTranslation();
  const { selectedLanguage, changeLanguage } = useLanguage();
  const { user, updateLanguage } = useAuth();
  const [saveError, setSaveError] = useState('');

  async function selectLanguage(event) {
    const selected = event.target.value;
    setSaveError('');
    try {
      await changeLanguage(selected);
      if (user) await updateLanguage(selected);
    } catch (error) {
      console.error('Could not save the selected language to the account.', error);
      setSaveError(t('language.saveFailed'));
    }
  }

  return (
    <label className={`language-selector ${className}`}>
      <span className="sr-only">{t('language.select')}</span>
      <select
        aria-label={t('language.select')}
        value={selectedLanguage}
        onChange={selectLanguage}
      >
        {supportedLanguages.map(code => (
          <option key={code} value={code}>{t(`language.${languageNameKeys[code]}`)}</option>
        ))}
      </select>
      {saveError && <span className="language-save-error" role="alert">{saveError}</span>}
    </label>
  );
}
