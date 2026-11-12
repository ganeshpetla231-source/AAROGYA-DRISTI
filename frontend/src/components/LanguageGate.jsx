import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import i18n from '../i18n/index.js';
import './language-gate.css';

const languageOptions = [
  { code: 'en', nameKey: 'language.english' },
  { code: 'te', nameKey: 'language.telugu' },
  { code: 'hi', nameKey: 'language.hindi' }
];

export function LanguageGate() {
  const { changeLanguage } = useLanguage();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const title = ['en', 'te', 'hi'].map(language => i18n.getFixedT(language)('language.chooseTitle')).join(' · ');
  const description = ['en', 'te', 'hi'].map(language => i18n.getFixedT(language)('language.chooseDescription')).join(' · ');
  const label = i18n.getFixedT(i18n.resolvedLanguage || 'en')('language.select');

  async function selectLanguage(language) {
    setBusy(true);
    setError('');
    try {
      await changeLanguage(language);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="language-gate">
      <section className="language-gate-card" aria-labelledby="language-gate-title">
        <div className="language-gate-symbol" aria-hidden="true">✦</div>
        <p className="language-gate-brand">AAROGYA <span>DRISHTI</span></p>
        <h1 id="language-gate-title">{title}</h1>
        <p className="language-gate-description">{description}</p>
        <div className="language-gate-options" role="group" aria-label={label}>
          {languageOptions.map(option => (
            <button key={option.code} type="button" disabled={busy} onClick={() => selectLanguage(option.code)}>
              {i18n.getFixedT(option.code)(option.nameKey)}
            </button>
          ))}
        </div>
        {error && <p className="language-gate-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
