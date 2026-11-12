import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Accessibility, Cloud, CloudOff, Ear, Languages, Mic, RefreshCw, Trash2, Type, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { clearOfflineDeviceData, discardOfflineEntry, listOfflineQueue, retryOfflineEntry, syncOfflineQueue } from '../services/offlineStorage.js';
import { createResource, syncOfflineScreeningMetadata } from '../services/api.js';
import { LanguageSelector } from './LanguageSelector.jsx';
import './offline-accessibility.css';

const preferencesKey = 'aarogya-accessibility-v1';
const defaults = { fontScale: 'normal', highContrast: false, reduceMotion: false };
const languageLocales = { en: 'en-IN', te: 'te-IN', hi: 'hi-IN' };

function readPreferences() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(preferencesKey) || '{}') }; }
  catch { return defaults; }
}

export function OfflineAccessibility() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [preferences, setPreferences] = useState(readPreferences);
  const [reading, setReading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const syncLock = useRef(false);
  const userId = auth.user?.id;
  const canSync = Boolean(userId && ['asha', 'doctor', 'admin'].includes(auth.user?.role));
  const pendingCount = useMemo(() => entries.filter(item => ['pending', 'syncing', 'failed', 'conflict'].includes(item.status)).length, [entries]);

  const refreshQueue = useCallback(async () => {
    if (!userId) { setEntries([]); return; }
    try { setEntries(await listOfflineQueue(userId)); setError(''); }
    catch (failure) { setError(failure.message); }
  }, [userId]);

  const synchronize = useCallback(async () => {
    if (!online || !canSync || syncLock.current) return;
    syncLock.current = true;
    setWorking(true);
    try {
      await syncOfflineQueue(userId, {
        screeningMetadata: syncOfflineScreeningMetadata,
        patientRegistration: data => createResource('patients', data)
      });
      setError('');
    } catch (failure) { setError(failure.message); }
    finally { syncLock.current = false; setWorking(false); await refreshQueue(); }
  }, [online, canSync, userId, refreshQueue]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    const closeForOtherWidget = event => {
      if (event.detail !== 'offline') setOpen(false);
    };
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    window.addEventListener('aarogya:offline-queue-changed', refreshQueue);
    window.addEventListener('aarogya:floating-widget-open', closeForOtherWidget);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      window.removeEventListener('aarogya:offline-queue-changed', refreshQueue);
      window.removeEventListener('aarogya:floating-widget-open', closeForOtherWidget);
    };
  }, [refreshQueue]);

  useEffect(() => { refreshQueue(); }, [refreshQueue]);
  useEffect(() => { if (online && canSync) synchronize(); }, [online, canSync, synchronize]);
  useEffect(() => {
    document.documentElement.dataset.fontScale = preferences.fontScale;
    document.documentElement.dataset.highContrast = String(preferences.highContrast);
    document.documentElement.dataset.reduceMotion = String(preferences.reduceMotion);
    try { localStorage.setItem(preferencesKey, JSON.stringify(preferences)); }
    catch (failure) { setError(t('accessibility.preferenceSaveError')); }
  }, [preferences, t]);
  useEffect(() => {
    if (!open && !confirmClear) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') { setOpen(false); setConfirmClear(false); }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, confirmClear]);

  function updatePreference(key, value) { setPreferences(current => ({ ...current, [key]: value })); }
  function toggleSettings() {
    const next = !open;
    if (next) window.dispatchEvent(new CustomEvent('aarogya:floating-widget-open', { detail: 'offline' }));
    setOpen(next);
  }
  function readPageAloud() {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      setError(t('accessibility.speechUnavailable'));
      return;
    }
    if (reading) {
      window.speechSynthesis.cancel();
      setReading(false);
      return;
    }
    const main = document.querySelector('main');
    const selectors = '.education-detail h2,.education-detail h3,.education-detail p,.topic-detail h1,.topic-detail h2,.topic-detail p,.content-area h1,.content-area h2,.content-area .page-subtitle';
    const text = [...(main?.querySelectorAll(selectors) || [])].map(element => element.innerText.trim()).filter(Boolean).join('. ').slice(0, 6000);
    if (!text) { setError(t('accessibility.noReadableContent')); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = languageLocales[i18n.resolvedLanguage] || 'en-IN';
    utterance.onend = () => setReading(false);
    utterance.onerror = () => { setReading(false); setError(t('accessibility.speechUnavailable')); };
    setError('');
    setReading(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
  function openVoiceNavigation() {
    document.querySelector('.voice-dock-trigger')?.click();
    setOpen(false);
  }
  async function retry(id) {
    setWorking(true);
    setError('');
    try { await retryOfflineEntry(id, userId); await synchronize(); }
    catch (failure) { setError(failure.message); }
    finally { setWorking(false); await refreshQueue(); }
  }
  async function discard(id) {
    try { await discardOfflineEntry(id, userId); await refreshQueue(); }
    catch (failure) { setError(failure.message); }
  }
  async function clearAll() {
    setWorking(true);
    try { await clearOfflineDeviceData(); setConfirmClear(false); setEntries([]); setError(''); }
    catch (failure) { setError(failure.message); }
    finally { setWorking(false); }
  }

  return <div className="offline-accessibility">
    <button className={`offline-status-trigger ${online ? 'is-online' : 'is-offline'}`} type="button" onClick={toggleSettings} aria-expanded={open} aria-controls="offline-accessibility-panel" aria-label={`${online ? t('offline.online') : t('offline.offline')}, ${t('offline.pendingCount', { count: pendingCount })}. ${t('accessibility.openSettings')}`} title={t('accessibility.openSettings')}>
      {online ? <Cloud size={18}/> : <CloudOff size={18}/>}<span className="offline-status-indicator" aria-hidden="true"/><span>{online ? t('offline.online') : t('offline.offline')}</span>{pendingCount > 0 && <b>{pendingCount}</b>}<Accessibility size={18}/>
    </button>
    {open && <section id="offline-accessibility-panel" className="offline-accessibility-panel" aria-label={t('accessibility.panelTitle')} aria-describedby="offline-device-privacy">
      <header><div><h2>{t('accessibility.panelTitle')}</h2><p>{t('accessibility.panelHelp')}</p></div><button type="button" aria-label={t('common.close')} onClick={() => setOpen(false)}><X size={18}/></button></header>
      <div className="offline-connectivity" role="status"><span className={online ? 'is-online' : 'is-offline'}>{online ? <Cloud size={16}/> : <CloudOff size={16}/>} {online ? t('offline.online') : t('offline.offline')}</span><span>{t('offline.pendingCount', { count: pendingCount })}</span></div>
      <section className="accessibility-controls" aria-labelledby="accessibility-controls-title">
        <h3 id="accessibility-controls-title"><Accessibility size={16}/>{t('accessibility.settings')}</h3>
        <fieldset><legend><Type size={15}/>{t('accessibility.textSize')}</legend><div className="accessibility-size-options">{['normal', 'large', 'extra-large'].map(size => <button key={size} type="button" aria-pressed={preferences.fontScale === size} onClick={() => updatePreference('fontScale', size)}>{t(`accessibility.${size}`)}</button>)}</div></fieldset>
        <label className="accessibility-toggle"><input type="checkbox" checked={preferences.highContrast} onChange={event => updatePreference('highContrast', event.target.checked)}/><span>{t('accessibility.highContrast')}</span></label>
        <label className="accessibility-toggle"><input type="checkbox" checked={preferences.reduceMotion} onChange={event => updatePreference('reduceMotion', event.target.checked)}/><span>{t('accessibility.reduceMotion')}</span></label>
        <div className="accessibility-language"><Languages size={16}/><span>{t('language.select')}</span><LanguageSelector className="lang-toggle dash-lang"/></div>
        <button className="accessibility-action" type="button" onClick={readPageAloud}><Ear size={16}/>{reading ? t('accessibility.stopReading') : t('accessibility.readAloud')}</button>
        <button className="accessibility-action" type="button" onClick={openVoiceNavigation}><Mic size={16}/>{t('accessibility.voiceNavigation')}</button>
        <p className="accessibility-speech-status" role="status" aria-live="polite">{reading ? t('accessibility.reading') : ''}</p>
      </section>
      <section className="offline-queue" aria-labelledby="offline-queue-title">
        <header><div><h3 id="offline-queue-title">{t('offline.queueTitle')}</h3><p>{t('offline.queueHelp')}</p></div><button type="button" aria-label={t('offline.syncNow')} disabled={!online || !canSync || working} onClick={synchronize}><RefreshCw size={16}/></button></header>
        {!canSync && entries.length > 0 && <p className="accessibility-message">{t('offline.signInToSync')}</p>}
        {error && <p className="offline-error" role="alert">{error}</p>}
        {entries.length === 0 ? <p className="offline-empty">{t('offline.emptyQueue')}</p> : <ul>{entries.map(entry => <li key={entry.id}>
          <div><strong>{t(entry.type === 'patient-registration' ? 'offline.patientRegistration' : 'offline.screeningMetadata')}</strong><span className={`sync-state sync-state-${entry.status}`}><i aria-hidden="true"/>{t(`offline.states.${entry.status}`)}</span>{entry.message && <small>{entry.message}</small>}</div>
          {entry.status !== 'syncing' && <div className="offline-entry-actions">
            {entry.status === 'failed' && <button type="button" disabled={!online || working || !canSync} onClick={() => retry(entry.id)}>{t('offline.retry')}</button>}
            <button type="button" onClick={() => discard(entry.id)}>{t('offline.discard')}</button>
          </div>}
        </li>)}</ul>}
        {working && <p className="accessibility-speech-status" role="status" aria-live="polite">{t('offline.syncing')}</p>}
      </section>
      <p id="offline-device-privacy" className="offline-privacy">{t('offline.privacy')}</p>
      <button className="offline-clear-button" type="button" onClick={() => setConfirmClear(true)}><Trash2 size={15}/>{t('offline.clearDeviceData')}</button>
      {confirmClear && <div className="offline-confirm-backdrop"><section className="offline-confirm" role="alertdialog" aria-modal="true" aria-labelledby="offline-clear-title"><h3 id="offline-clear-title">{t('offline.confirmClearTitle')}</h3><p>{t('offline.confirmClearText')}</p><div><button type="button" onClick={() => setConfirmClear(false)}>{t('common.cancel')}</button><button type="button" disabled={working} onClick={clearAll}>{t('offline.clearDeviceData')}</button></div></section></div>}
    </section>}
  </div>;
}
