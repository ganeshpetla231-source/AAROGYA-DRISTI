import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './symptoms-checker.css';

const symptomKeys = ['ulcer', 'patch', 'lump', 'bleeding', 'swallowing'];

export function SymptomsChecker() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState([]);
  function toggle(option) {
    setSelected(current => current.includes(option) ? current.filter(item => item !== option) : [...current, option]);
  }
  return <section className="panel symptoms-checker">
    <div className="panel-heading"><div><h2>{t('symptomsChecker.title')}</h2><p>{t('symptomsChecker.intro')}</p></div></div>
    <fieldset>
      <legend>{t('symptomsChecker.title')}</legend>
      {symptomKeys.map(option => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)}/><span>{t(`symptomsChecker.options.${option}`)}</span></label>)}
    </fieldset>
    {selected.length > 0 && <div className="symptoms-guidance" role="status"><p>{t('symptomsChecker.result')}</p><strong>{t('symptomsChecker.urgent')}</strong></div>}
    {selected.length > 0 && <button type="button" className="symptoms-clear" onClick={() => setSelected([])}>{t('symptomsChecker.clear')}</button>}
    <p className="symptoms-disclaimer">{t('symptomsChecker.note')}</p>
  </section>;
}
