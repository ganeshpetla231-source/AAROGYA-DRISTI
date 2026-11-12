import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getVoiceTranscripts, reviewTranscript, saveManualTranscript, synthesizeSpeech, transcribeVoice, translateTranscript } from '../services/api.js';

const languages = [
  { code: 'auto', name: 'Detect automatically', speech: 'te-IN' },
  { code: 'te-IN', name: 'తెలుగు · Telugu' }, { code: 'en-IN', name: 'English' },
  { code: 'hi-IN', name: 'हिन्दी · Hindi' }, { code: 'ta-IN', name: 'தமிழ் · Tamil' }, { code: 'kn-IN', name: 'ಕನ್ನಡ · Kannada' }
];
const names = Object.fromEntries(languages.filter(x => x.code !== 'auto').map(x => [x.code, x.name]));
function encodeWav(chunks, sampleRate) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (!length) return new Blob([], { type: 'audio/wav' });
  const samples = new Float32Array(length);
  let writeAt = 0;
  for (const chunk of chunks) { samples.set(chunk, writeAt); writeAt += chunk.length; }
  const ratio = sampleRate / 16000;
  const outputLength = Math.floor(samples.length / ratio);
  const bytes = new ArrayBuffer(44 + outputLength * 2);
  const view = new DataView(bytes);
  const write = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + outputLength * 2, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, outputLength * 2, true);
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio, left = Math.floor(position), fraction = position - left;
    const right = Math.min(left + 1, samples.length - 1);
    const sample = Math.max(-1, Math.min(1, samples[left] * (1 - fraction) + samples[right] * fraction));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

export function VoiceAssistant({ role, patients }) {
  const { t } = useTranslation();
  const [patientId, setPatientId] = useState(''), [language, setLanguage] = useState(role === 'patient' ? 'te-IN' : 'auto');
  const [recording, setRecording] = useState(false), [working, setWorking] = useState(false), [liveText, setLiveText] = useState('');
  const [manualText, setManualText] = useState(''), [manualLanguage, setManualLanguage] = useState('te-IN');
  const [transcript, setTranscript] = useState(null), [error, setError] = useState(''), [message, setMessage] = useState('');
  const recorder = useRef(null), streamRef = useRef(null), audioContextRef = useRef(null), sourceRef = useRef(null), processorRef = useRef(null), silenceGainRef = useRef(null), timerRef = useRef(null);
  useEffect(() => { if (role === 'patient' && patients.length) setPatientId(patients[0]._id); }, [role, patients]);
  function releaseCapture() {
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
    }
    sourceRef.current?.disconnect();
    silenceGainRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    silenceGainRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') void audioContextRef.current.close();
    audioContextRef.current = null;
  }
  useEffect(() => () => { clearTimeout(timerRef.current); releaseCapture(); }, []);

  async function begin() {
    setError(''); setMessage(''); setLiveText('');
    if (!patientId) { setError(t('voice.choosePatientError')); return; }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) { setError(t('voice.recordUnsupported')); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const context = new AudioContextClass();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silenceGain = context.createGain();
      const chunks = [];
      silenceGain.gain.value = 0;
      processor.onaudioprocess = event => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      source.connect(processor);
      processor.connect(silenceGain);
      silenceGain.connect(context.destination);
      audioContextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
      silenceGainRef.current = silenceGain;
      recorder.current = { chunks, sampleRate: context.sampleRate };
      setRecording(true);
      timerRef.current = setTimeout(() => stop(), 60000);
    } catch (failure) { releaseCapture(); setError(failure.name === 'NotAllowedError' ? t('voice.microphoneDenied') : t('voice.microphoneFailed')); }
  }
  async function submitRecording(capture) {
    const blob = encodeWav(capture.chunks, capture.sampleRate);
    if (!blob.size) { setError(t('voice.noAudio')); return; }
    setWorking(true);
    try {
      const form = new FormData();
      form.append('patientId', patientId);
      form.append('language', language);
      form.append('audio', blob, 'voice.wav');
      const saved = await transcribeVoice(form);
      setTranscript(saved);
      setMessage(t('voice.transcriptSaved'));
      setLiveText(saved.originalTranscript);
    } catch (failure) { setError(t('voice.retryTranscript', { error: failure.message })); }
    finally { setWorking(false); }
  }
  function stop() {
    clearTimeout(timerRef.current);
    const capture = recorder.current;
    if (!capture) return;
    recorder.current = null;
    setRecording(false);
    releaseCapture();
    void submitRecording(capture);
  }
  async function saveManual(event) {
    event.preventDefault(); setError(''); setMessage(''); setWorking(true);
    try { const saved = await saveManualTranscript({ patientId, language: manualLanguage, text: manualText }); setTranscript(saved); setMessage(saved.translationPending ? t('voice.translationPending') : t('voice.manualSaved')); }
    catch (failure) { setError(failure.message); }
    finally { setWorking(false); }
  }
  return <div className="voice-assistant-layout"><section className="panel voice-panel"><div className="panel-heading"><div><span className="demo-label">{t('voice.multilingualNotes')}</span><h2>{t('voice.title')}</h2><p>{t('voice.intro')}</p></div><span className="db-pill">{t('voice.languagesCount')}</span></div><p className="voice-notice">{t('voice.notice')}</p>{role !== 'patient' && <label className="voice-label">{t('voice.patient')}<select value={patientId} onChange={e => setPatientId(e.target.value)}><option value="">{t('voice.choosePatient')}</option>{patients.map(p => <option key={p._id} value={p._id}>{p.name} · {p.patientId}</option>)}</select></label>}
    {role === 'patient' && <button type="button" className="date-chip" onClick={() => {
      window.dispatchEvent(new CustomEvent('aarogya:floating-widget-open', { detail: 'voice' }));
      window.dispatchEvent(new CustomEvent('aarogya:voice-assistant-open'));
    }}>{t('voice.openGeminiAssistant')} ↗</button>}
    <div className="voice-record-panel"><label className="voice-label">{t('voice.spokenLanguage')}<select value={language} onChange={e => setLanguage(e.target.value)}>{languages.map(item => <option key={item.code} value={item.code}>{item.code === 'auto' ? t('voice.detectAutomatically') : item.name}</option>)}</select></label><button className={`voice-mic ${recording ? 'is-recording' : ''}`} disabled={working} onClick={recording ? stop : begin} aria-label={recording ? t('voice.stopRecording') : t('voice.startRecording')}><span>{recording ? '■' : '🎙'}</span><b>{recording ? t('voice.stopRecording') : t('voice.startRecording')}</b></button><p className="voice-hint">{recording ? t('voice.recordingHint') : t('voice.permissionHint')}</p></div>
    <div className="voice-transcript-live" aria-live="polite"><div><b>{t('voice.preview')}</b><span>{recording ? t('voice.recording') : t('voice.previewLabel')}</span></div><p>{liveText || (recording ? t('voice.recordingSecure') : t('voice.transcriptPlaceholder'))}</p></div>
    {working && <div className="loading-state"><span className="spinner"/>{t('voice.transcribing')}</div>}{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="api-success" role="status">{message}</p>}
    <details className="manual-transcript" open={!recording && !transcript}><summary>{t('voice.manualEntry')}</summary><form onSubmit={saveManual}><label className="voice-label">{t('voice.textLanguage')}<select value={manualLanguage} onChange={e => setManualLanguage(e.target.value)}>{languages.filter(x => x.code !== 'auto').map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><textarea value={manualText} onChange={e => setManualText(e.target.value)} required maxLength={10000} placeholder={t('voice.reportedPlaceholder')}/><button className="date-chip" disabled={working || !patientId}>{t('voice.saveManual')}</button></form></details>
    {transcript && <VoiceTranscriptCard transcript={transcript} onChange={setTranscript}/>}
  </section></div>;
}

function VoiceTranscriptCard({ transcript, onChange }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function requestTranslation(direction) { setBusy(true); setError(''); try { const updated = await translateTranscript(transcript._id, direction); onChange(updated); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <article className="voice-saved-transcript"><div className="voice-saved-head"><b>{transcript.source === 'voice' ? t('voice.voiceSaved') : t('voice.manualTranscriptSaved')}</b><span>{names[transcript.detectedLanguage] || transcript.detectedLanguage}</span></div><small>{t('voice.detectionConfidence')} · {transcript.detectionConfidence ? `${Math.round(transcript.detectionConfidence * 100)}%` : t('voice.notSupplied')}{transcript.speechConfidence ? ` · ${t('voice.speechRecognition')} ${Math.round(transcript.speechConfidence * 100)}%` : ''}</small><div className="voice-language-pair"><section><b>{t('voice.originalTranscript')}</b><p lang={transcript.detectedLanguage}>{transcript.originalTranscript}</p><SpeakButton text={transcript.originalTranscript} language={transcript.detectedLanguage}/></section><section><b>{t('voice.englishTranslation')}</b><p>{transcript.englishTranslation || t('voice.translationUnavailable')}</p><SpeakButton text={transcript.englishTranslation} language="en-IN"/></section></div><div className="voice-actions"><button className="date-chip" disabled={busy} onClick={() => requestTranslation('to-english')}>{t('voice.translateEnglish')}</button><button className="date-chip" disabled={busy || !transcript.englishTranslation} onClick={() => requestTranslation('to-original')}>{t('voice.translateBack', { language: names[transcript.detectedLanguage] })}</button></div>{transcript.translationBack && <section className="voice-back-translation"><b>{t('voice.backTranslation', { language: names[transcript.detectedLanguage] })}</b><p lang={transcript.detectedLanguage}>{transcript.translationBack}</p><SpeakButton text={transcript.translationBack} language={transcript.detectedLanguage}/></section>}{error && <p className="form-error">{error}</p>}{transcript.reportedSymptoms?.length > 0 && <div className="reported-symptoms"><b>{t('voice.reportedSymptoms')}</b><div>{transcript.reportedSymptoms.map(item => <span key={item}>{item}</span>)}</div></div>}<p className="voice-notice">{t('voice.notice')}</p></article>;
}

function SpeakButton({ text, language }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function generate() { setBusy(true); setError(''); try { const blob = await synthesizeSpeech(text, language); setUrl(URL.createObjectURL(blob)); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  if (!text) return null;
  return <div className="voice-playback">{url ? <audio controls preload="none" src={url}/> : <button className="text-link" disabled={busy} onClick={generate}>{busy ? t('voice.prepareAudio') : t('voice.playSpeech')}</button>}{error && <small className="form-error">{error}</small>}</div>;
}

export function VoiceHistory({ embedded = false }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const refresh = async () => { setLoading(true); setError(''); try { setItems((await getVoiceTranscripts()).items || []); } catch (e) { setError(e.message); } finally { setLoading(false); } };
  useEffect(() => { refresh(); }, []);
  return <section className={`panel voice-history ${embedded ? 'voice-history-embedded' : ''}`}><div className="panel-heading"><div><h2>{t('voice.history')}</h2><p>{t('voice.historyHelp')}</p></div><button className="text-link" onClick={refresh}>{t('common.refresh')}</button></div>{error && <p className="form-error">{error}</p>}{loading ? <div className="loading-state"><span className="spinner"/>{t('voice.loadingTranscripts')}</div> : items.length ? <div className="voice-history-list">{items.map(item => <div className="voice-history-item" key={item._id}><div className="voice-saved-head"><b>{item.patient?.name || t('voice.myTranscript')} · {names[item.detectedLanguage] || item.detectedLanguage}</b><span>{item.review?.status === 'reviewed' ? t('voice.doctorReviewed') : t('voice.pendingReview')}</span></div><p lang={item.detectedLanguage}>{item.originalTranscript}</p><p>{item.englishTranslation || t('voice.englishPending')}</p>{item.reportedSymptoms?.length > 0 && <small>{t('voice.reportedSymptomsLabel')} {item.reportedSymptoms.join(', ')}</small>}<small>{new Date(item.createdAt).toLocaleString(locale)} · {t(`voice.source.${item.source}`)}</small><p className="voice-notice">{t('voice.notice')}</p></div>)}</div> : <div className="empty-state"><span>♫</span><b>{t('voice.noSavedTranscripts')}</b><p>{t('voice.historyHelpStart')}</p></div>}</section>;
}

export function VoiceReviewQueue() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  async function refresh() { setLoading(true); setError(''); try { setItems((await getVoiceTranscripts({ pending: 'true' })).items || []); } catch (e) { setError(e.message); } finally { setLoading(false); } }
  useEffect(() => { refresh(); }, []);
  return <section className="voice-review-page"><p className="voice-notice">{t('voice.reviewNotice')}</p>{error && <div className="api-alert" role="alert">{error}<button onClick={refresh}>{t('common.retry')}</button></div>}{loading ? <div className="loading-state"><span className="spinner"/>{t('voice.loadingReviewQueue')}</div> : items.length ? items.map(item => <VoiceReviewCard key={item._id} item={item} onReviewed={refresh}/>) : <div className="empty-state panel"><span>✓</span><b>{t('voice.noPendingReview')}</b><p>{t('voice.patientAndAsha')}</p></div>}</section>;
}

function VoiceReviewCard({ item, onReviewed }) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() { setBusy(true); setError(''); try { await reviewTranscript(item._id, notes); onReviewed(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <article className="panel voice-review-card"><div className="voice-saved-head"><div><span className="demo-label">{t('voice.patientReported')} · {item.source.toUpperCase()}</span><h2>{item.patient?.name} <small>{item.patient?.patientId}</small></h2></div><span>{names[item.detectedLanguage] || item.detectedLanguage}</span></div><div className="voice-language-pair"><section><b>{t('voice.originalTranscript')} · {names[item.detectedLanguage]}</b><p lang={item.detectedLanguage}>{item.originalTranscript}</p><SpeakButton text={item.originalTranscript} language={item.detectedLanguage}/></section><section><b>{t('voice.englishTranslation')}</b><p>{item.englishTranslation || t('voice.translationRetry')}</p><SpeakButton text={item.englishTranslation} language="en-IN"/></section></div>{item.reportedSymptoms?.length > 0 && <div className="reported-symptoms"><b>{t('voice.symptomsNotDiagnosis')}</b><div>{item.reportedSymptoms.map(x => <span key={x}>{x}</span>)}</div></div>}<label className="voice-label">{t('voice.reviewNote')}<textarea value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} placeholder={t('voice.reviewPlaceholder')}/></label>{error && <p className="form-error">{error}</p>}<button className="auth-submit" disabled={busy} onClick={save}>{busy ? t('voice.savingReview') : t('voice.markReviewed')}</button><p className="voice-notice">{t('voice.reviewDisclaimer')}</p></article>;
}
