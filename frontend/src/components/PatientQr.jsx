import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { getPatientQr, issuePatientQr, revokePatientQr, scanPatientQr, getQrHistory, getQrConsent, setQrConsent } from '../services/api.js';

export function PatientQrCard({ auth }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = async () => { const [qr, grant] = await Promise.all([getPatientQr(), getQrConsent()]); setData(qr); setConsent(grant.granted); };
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function regenerate() { setBusy(true); setError(''); try { const result = await issuePatientQr(); auth.setQrToken(result.token); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function revoke() { setBusy(true); setError(''); try { await revokePatientQr(); auth.setQrToken(null); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function saveConsent(value) { setBusy(true); setError(''); try { const result = await setQrConsent(value); setConsent(result.granted); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  function download() { const svg = document.querySelector('.qr-code svg'); if (!svg) return; const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${data?.patient?.patientId || 'patient'}-qr.svg`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
  return <section className="panel qr-card-panel">
    <div className="panel-heading"><div><h2>{t('qr.cardTitle')}</h2><p>{t('qr.cardDescription')}</p></div><span className={`status-tag ${data?.qr?.active ? 'reviewed' : 'cancelled'}`}>{data?.qr?.active ? t('qr.active') : t('qr.inactive')}</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="qr-print-card"><div className="qr-card-copy"><span className="demo-label">{t('qr.patientCard')}</span><h2>{data?.patient?.name || t('qr.loadingPatient')}</h2><p>{t('qr.patientId')} <b>{data?.patient?.patientId || '—'}</b></p><p>{data?.patient?.village}</p><small>{t('qr.presentCode')}</small></div><div className="qr-code">{auth.qrToken ? <QRCodeSVG value={auth.qrToken} size={180} level="M" includeMargin/> : <div className="qr-placeholder">{data?.qr?.active ? t('qr.tokenUnavailable') : t('qr.noActive')}</div>}</div></div>
    <div className="qr-actions"><button className="auth-submit" disabled={!auth.qrToken} onClick={download}>{t('qr.download')}</button><button className="date-chip" onClick={() => window.print()}>{t('qr.print')}</button>{auth.qrToken && data?.qr?.active && <button className="date-chip" disabled={busy} onClick={revoke}>{t('qr.revoke')}</button>}<button className="date-chip" disabled={busy} onClick={regenerate}>{data?.qr?.active ? t('qr.regenerate') : t('qr.generate')}</button></div>
    <label className="qr-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e => saveConsent(e.target.checked)}/><span><b>{t('qr.allowLookups')}</b><small>{t('qr.consentDescription')}</small></span></label>
    <p className="qr-footnote">{data?.qr?.expiresAt ? t('qr.expiresOn', { date: new Date(data.qr.expiresAt).toLocaleDateString(locale) }) : t('qr.expires90Days')} {t('qr.revokeAnytime')}</p>
  </section>;
}

export function PatientQrScanner() {
  const { t } = useTranslation();
  const [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [camera, setCamera] = useState(false);
  const video = useRef(null), controls = useRef(null), busyRef = useRef(false), reader = useRef(new BrowserMultiFormatReader());
  async function process(token) { if (!token || busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); try { setResult((await scanPatientQr(token)).patient); controls.current?.stop(); setCamera(false); } catch (e) { setResult(null); setError(e.message); controls.current?.stop(); setCamera(false); } finally { busyRef.current = false; setBusy(false); } }
  async function startCamera() { setError(''); setResult(null); setCamera(true); }
  async function image(event) { const file = event.target.files?.[0]; if (!file) return; setError(''); setResult(null); const url = URL.createObjectURL(file); try { const decoded = await reader.current.decodeFromImageUrl(url); await process(decoded.getText()); } catch { setError(t('qr.noReadableQr')); } finally { URL.revokeObjectURL(url); event.target.value = ''; } }
  useEffect(() => { if (!camera || !video.current) return; let cancelled = false; reader.current.decodeFromVideoDevice(undefined, video.current, decoded => { if (decoded && !cancelled) process(decoded.getText()); }).then(control => { if (cancelled) control.stop(); else controls.current = control; }).catch(e => { if (!cancelled) { setCamera(false); setError(e.message || 'Could not access a camera.'); } }); return () => { cancelled = true; controls.current?.stop(); controls.current = null; }; }, [camera]);
  return <div className="qr-scanner-grid"><section className="panel qr-scan-panel"><div className="panel-heading"><div><h2>{t('qr.scanTitle')}</h2><p>{t('qr.scanDescription')}</p></div></div><div className="qr-scan-controls"><button className="auth-submit" disabled={busy || camera} onClick={startCamera}>{t('qr.openCamera')}</button><label className="date-chip qr-upload">{t('qr.scanImage')}<input type="file" accept="image/*" onChange={image}/></label>{camera && <button className="date-chip" onClick={() => { controls.current?.stop(); setCamera(false); }}>{t('qr.stopCamera')}</button>}</div><video ref={video} className={`qr-video ${camera ? 'visible' : ''}`} muted playsInline/><p className="qr-footnote">{t('qr.cameraNote')}</p>{busy && <div className="loading-state"><span className="spinner"/>{t('qr.validating')}</div>}{error && <p className="form-error" role="alert">{error}</p>}{result && <div className="qr-result"><span className="demo-label">{t('qr.authorizedSummary')}</span><h3>{result.name}</h3><p><b>{t('qr.patientId')}</b> · {result.patientId}</p><p><b>{t('qr.village')}</b> · {result.village}</p><p><b>{t('qr.status')}</b> · {t(`statuses.${result.status}`, { defaultValue: result.status })}</p>{result.district && <p><b>{t('qr.district')}</b> · {result.district}</p>}</div>}</section><QrHistory/></div>;
}

export function QrHistory() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => { getQrHistory().then(data => setItems(data.items || [])).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
  const outcome = value => t(`qr.outcomes.${value}`, { defaultValue: value.replaceAll('_', ' ') });
  return <section className="panel qr-history"><div className="panel-heading"><div><h2>{t('qr.historyTitle')}</h2><p>{t('qr.historyDescription')}</p></div></div>{error && <p className="form-error">{error}</p>}{loading ? <div className="loading-state"><span className="spinner"/>{t('qr.loadingHistory')}</div> : items.length ? <div className="content-list">{items.map(item => <article key={item.id}><span className="list-marker">▦</span><span className="list-main"><b>{outcome(item.outcome)}</b><small>{new Date(item.at).toLocaleString(locale)} · {item.scanner} · {t(`roles.${item.role}`, { defaultValue: item.role })}</small></span><span className={`status-tag ${item.outcome === 'success' ? 'reviewed' : 'cancelled'}`}>{outcome(item.outcome)}</span></article>)}</div> : <div className="empty-state"><span>▤</span><b>{t('qr.noScans')}</b><p>{t('qr.scanEmpty')}</p></div>}</section>;
}
