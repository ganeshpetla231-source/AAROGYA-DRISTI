import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { getScreeningImage, getScreeningQueue, reviewScreening, uploadScreening } from '../services/api.js';
import { saveOfflineScreeningDraft } from '../services/offlineStorage.js';
import { patientAgeFromDateOfBirth } from '../utils/patientAge.js';
import './reviewing-clinician.css';

const categoryKeys = {
  'possible-ulcer': 'possibleUlcer', 'possible-thrush': 'possibleThrush',
  'possible-gingivitis': 'possibleGingivitis', 'possible-infection': 'possibleInfection',
  'possible-white-patch': 'possibleWhitePatch', 'possible-red-lesion': 'possibleRedLesion', 'other-abnormality': 'otherAbnormality',
  'insufficient-quality': 'imageQuality', 'no-visible-abnormality': 'noAbnormality'
};
const translateDecision = (t, decision) => t(`screening.decision.${decision}`);

export function ScreeningUpload({ patients, onUploaded }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [patientId, setPatientId] = useState(''), [file, setFile] = useState(null), [preview, setPreview] = useState(''), [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine), [consentGranted, setConsentGranted] = useState(false), [symptomNotes, setSymptomNotes] = useState('');
  const [cameraStream, setCameraStream] = useState(null), [facingMode, setFacingMode] = useState('environment');
  const videoRef = useRef(null);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => { if (videoRef.current && cameraStream) videoRef.current.srcObject = cameraStream; }, [cameraStream]);
  useEffect(() => () => cameraStream?.getTracks().forEach(track => track.stop()), [cameraStream]);
  async function startCamera(mode = facingMode) {
    setError('');
    if (!consentGranted) return setError(t('screening.consentRequired'));
    if (!navigator.mediaDevices?.getUserMedia) return setError(t('screening.cameraUnsupported'));
    cameraStream?.getTracks().forEach(track => track.stop());
    try { setCameraStream(await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode } }, audio: false })); }
    catch { setError(t('screening.cameraDenied')); }
  }
  function stopCamera() { cameraStream?.getTracks().forEach(track => track.stop()); setCameraStream(null); }
  async function switchCamera() { const next = facingMode === 'environment' ? 'user' : 'environment'; setFacingMode(next); await startCamera(next); }
  function captureCamera() {
    const video = videoRef.current;
    if (!video?.videoWidth) return setError(t('screening.cameraNotReady'));
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => { if (blob) { setFile(new File([blob], `mouth-scan-${Date.now()}.jpg`, { type: 'image/jpeg' })); stopCamera(); } }, 'image/jpeg', 0.92);
  }
  async function saveMetadataOffline() {
    setError('');
    if (!patientId) return setError(t('offline.selectPatient'));
    if (!consentGranted) return setError(t('offline.consentRequired'));
    setBusy(true);
    try {
      await saveOfflineScreeningDraft({
        userId: auth.user?.id, patientId, symptoms: symptomNotes.split(',').map(value => value.trim()).filter(Boolean).slice(0, 12),
        capturedAt: new Date().toISOString(), consentGranted: true
      });
      setConsentGranted(false);
      setSymptomNotes('');
      setFile(null);
      setResult({ offlineQueued: true });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); setError(''); setResult(null);
    if (!patientId) return setError(t('screening.selectPatientError'));
    if (!consentGranted) return setError(t('screening.consentRequired'));
    if (!file) return setError(t('screening.selectImageError'));
    if (file.size > 8 * 1024 * 1024) return setError(t('screening.imageTooLarge'));
    setBusy(true);
    try { const form = new FormData(); form.append('patientId', patientId); form.append('consentGranted', 'true'); form.append('image', file); setResult(await uploadScreening(form)); setFile(null); onUploaded?.(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="panel screening-upload"><div className="panel-heading"><div><h2>{t('screening.title')}</h2><p>{t('screening.captureHelp')}</p></div><span className="db-pill">{t('screening.modelUnavailable')}</span></div><div className="screening-limit" role="note">{t('screening.limitation')}</div><div className="offline-screening-notice" role="status"><strong>{t('screening.modelUnavailable')}</strong><span>{t('screening.modelUnavailableHelp')}</span></div>{!online && <div className="offline-screening-notice" role="status"><strong>{t('offline.analysisPending')}</strong><span>{t('offline.noOfflineAi')}</span></div>}<form onSubmit={submit}><label className="screening-field">{t('screening.patient')}<select value={patientId} onChange={e => setPatientId(e.target.value)} required><option value="">{t('screening.choosePatient')}</option>{patients.map(p => <option key={p._id} value={p._id}>{p.name} · {p.patientId}</option>)}</select></label><label className="offline-consent"><input type="checkbox" checked={consentGranted} onChange={event => setConsentGranted(event.target.checked)}/><span>{t('screening.imageConsent')}</span></label><p className="offline-private-note">{t('screening.noImageStored')}</p><div className="screening-camera-controls">{!cameraStream ? <button type="button" className="date-chip" onClick={() => startCamera()}>{t('screening.startCamera')}</button> : <><button type="button" className="date-chip" onClick={captureCamera}>{t('screening.captureImage')}</button><button type="button" className="date-chip" onClick={switchCamera}>{t('screening.switchCamera')}</button><button type="button" className="date-chip" onClick={stopCamera}>{t('screening.stopCamera')}</button></>}</div>{cameraStream && <div className="screening-preview-wrap"><video ref={videoRef} autoPlay playsInline muted className="screening-preview" aria-label={t('screening.cameraPreview')}/><small>{t('screening.cameraInstructions')}</small></div>}<label className="screening-field">{t('screening.uploadLabel')}<input type="file" accept="image/jpeg,image/png" onChange={e => { setError(''); setResult(null); setFile(e.target.files?.[0] || null); }}/><small>{t('screening.uploadHelp')}</small></label>{preview && <div className="screening-preview-wrap"><img className="screening-preview" src={preview} alt={t('screening.previewAlt')}/><span>{file?.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span><button type="button" className="date-chip" onClick={() => { setFile(null); startCamera(); }}>{t('screening.retakeImage')}</button><button type="button" className="date-chip" onClick={() => setFile(null)}>{t('screening.removeImage')}</button></div>}{!online && <><label className="screening-field">{t('offline.symptoms')}<textarea value={symptomNotes} maxLength={1200} onChange={event => setSymptomNotes(event.target.value)} placeholder={t('offline.symptomPlaceholder')}/></label><p className="offline-private-note">{t('offline.noImageStored')}</p></>}{error && <p className="form-error" role="alert">{error}</p>}{online ? <button className="auth-submit" disabled={busy || !consentGranted}>{busy ? t('screening.checking') : t('screening.analyze')}</button> : <button className="auth-submit" type="button" disabled={busy || !patientId || !consentGranted} onClick={saveMetadataOffline}>{busy ? t('common.saving') : t('offline.saveDraft')}</button>}</form></section>;
}

export function ScreeningReviewQueue() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]), [hospitals, setHospitals] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [filters, setFilters] = useState({ q: '', from: '', to: '', reviewStatus: 'pending' });
  async function refresh(nextFilters = filters) {
    setLoading(true);
    setError('');
    try {
      const result = await getScreeningQueue(Object.fromEntries(Object.entries(nextFilters).filter(([, value]) => value)));
      setItems(result.items || []);
      setHospitals(result.hospitals || []);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => refresh(filters), filters.q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [filters]);
  function updateFilter(key, value) { setFilters(current => ({ ...current, [key]: value })); }
  return <section className="reviewing-clinician">
    <div className="reviewing-clinician-disclaimer" role="note">{t('clinicalReview.preliminaryDisclaimer')}</div>
    <div className="reviewing-clinician-filters">
      <label>{t('clinicalReview.patientSearch')}<input value={filters.q} maxLength={100} onChange={event => updateFilter('q', event.target.value)} placeholder={t('clinicalReview.patientSearchPlaceholder')}/></label>
      <label>{t('clinicalReview.startDate')}<input type="date" value={filters.from} onChange={event => updateFilter('from', event.target.value)}/></label>
      <label>{t('clinicalReview.endDate')}<input type="date" value={filters.to} onChange={event => updateFilter('to', event.target.value)}/></label>
      <label>{t('clinicalReview.reviewStatus')}<select value={filters.reviewStatus} onChange={event => updateFilter('reviewStatus', event.target.value)}>
        {['pending', 'approved', 'rejected', 'needs-further-examination', 'referred', 'all'].map(status => <option key={status} value={status}>{t(`clinicalReview.filters.${status}`)}</option>)}
      </select></label>
      <button type="button" className="date-chip" onClick={() => refresh()}>{t('common.refresh')}</button>
    </div>
    {error && <div className="api-alert" role="alert"><span>{error}</span><button onClick={() => refresh()}>{t('common.retry')}</button></div>}
    {loading ? <div className="loading-state"><span className="spinner"/>{t('screening.loadingQueue')}</div>
      : items.length ? <div className="reviewing-clinician-list">{items.map(item => <ScreeningReviewCard key={item._id} item={item} hospitals={hospitals} onSaved={() => refresh()}/>)}</div>
        : <div className="empty-state panel"><span>✓</span><b>{t('clinicalReview.noMatches')}</b><p>{t('clinicalReview.noMatchesHelp')}</p></div>}
  </section>;
}

export function ZoomableScreeningImage({ src, alt }) {
  const { t } = useTranslation();
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    if (!zoomed) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') setZoomed(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [zoomed]);
  return <>
    <button type="button" className="reviewing-clinician-image-button" onClick={() => setZoomed(true)} aria-label={t('clinicalReview.zoomImage')}>
      <img className="reviewing-clinician-image" src={src} alt={alt}/>
      <span>{t('clinicalReview.zoomImage')}</span>
    </button>
    {zoomed && <div className="reviewing-clinician-lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={() => setZoomed(false)}>
      <button type="button" className="reviewing-clinician-lightbox-close" onClick={() => setZoomed(false)}>{t('clinicalReview.closeZoom')}</button>
      <img src={src} alt={alt} onClick={event => event.stopPropagation()}/>
    </div>}
  </>;
}

function ScreeningReviewCard({ item, hospitals, onSaved }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
  const [category, setCategory] = useState(item.doctorAssessment?.category || (Object.hasOwn(categoryKeys, item.aiResult?.category) ? item.aiResult.category : ''));
  const [diagnosisNotes, setDiagnosisNotes] = useState(item.doctorAssessment?.diagnosisNotes || item.doctorAssessment?.notes || '');
  const [treatmentRecommendations, setTreatmentRecommendations] = useState(item.doctorAssessment?.treatmentRecommendations || '');
  const [referralHospital, setReferralHospital] = useState(item.doctorAssessment?.referralHospital?._id || '');
  const [referralReason, setReferralReason] = useState('');
  const [image, setImage] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let url;
    let live = true;
    getScreeningImage(item._id).then(blob => {
      if (!live) return;
      url = URL.createObjectURL(blob);
      setImage(url);
    }).catch(failure => { if (live) setError(failure.message); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [item._id]);
  async function save(decision) {
    setBusy(true);
    setError('');
    try {
      await reviewScreening(item._id, {
        category, diagnosisNotes, treatmentRecommendations, decision,
        ...(referralHospital ? { referral: { hospital: referralHospital, reason: referralReason } } : {})
      });
      await onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const categoryKey = categoryKeys[item.aiResult?.category];
  const dobAge = patientAgeFromDateOfBirth(item.patient?.dateOfBirth);
  const age = dobAge !== null ? dobAge : Number.isInteger(item.patient?.age) ? item.patient.age : null;
  const reviewHistory = item.reviews?.length ? item.reviews : item.doctorAssessment ? [item.doctorAssessment] : [];
  return <article className="reviewing-clinician-card">
    <header className="reviewing-clinician-patient">
      <div>
        <span className="demo-label">{t('clinicalReview.patientRecord')}</span>
        <h2>{item.patient?.name || t('screening.patientFallback')}</h2>
        <p>{t('clinicalReview.patientId')}: <b>{item.patient?.patientId || '—'}</b> · {item.patient?.phone || '—'}</p>
        <p>{item.patient?.gender || '—'}{age === null ? '' : ` · ${t('clinical.years', { count: age })}`} · {[item.patient?.village, item.patient?.district].filter(Boolean).join(', ') || '—'}</p>
        <p>{t('clinicalReview.screeningDate')}: {new Date(item.screenedAt).toLocaleString(locale)} · {t('screening.careTeam')}: {item.screenedBy?.name || '—'}</p>
      </div>
      <span className={`status-tag ${item.doctorAssessment ? 'reviewed' : 'needs-review'}`}>
        {item.doctorAssessment ? t(`clinicalReview.filters.${item.doctorAssessment.decision}`, { defaultValue: item.status }) : t('clinicalReview.filters.pending')}
      </span>
    </header>
    <div className="reviewing-clinician-evidence">
      {image
        ? <ZoomableScreeningImage src={image} alt={t('screening.privateImageAlt')}/>
        : <div className="screening-image-placeholder">{error ? t('screening.imageUnavailable') : t('screening.loadingImage')}</div>}
      <section className="reviewing-clinician-ai">
        <span className="demo-label">{t('clinicalReview.preliminaryFinding')}</span>
        <h3>{item.aiResult ? (categoryKey ? t(`screening.${categoryKey}`) : item.aiResult.category) : t('clinicalReview.noAiResult')}</h3>
        {item.aiResult?.finding && <p><b>{t('clinicalReview.visibleObservation')}:</b> {item.aiResult.finding}</p>}
        {item.aiResult?.possibleCauses?.length > 0 && <div><b>{t('patientScreening.possibleCauses')}</b><ul>{item.aiResult.possibleCauses.map((cause, index) => <li key={`${cause}-${index}`}>{cause}</li>)}</ul></div>}
        {item.aiResult?.explanation && <p>{item.aiResult.explanation}</p>}
        {item.aiResult?.nextSteps && <p><b>{t('patientScreening.nextSteps')}:</b> {item.aiResult.nextSteps}</p>}
        {item.oralRegion && <small>{t('clinicalReview.region')}: {t(`patientScreening.options.${item.oralRegion}`, { defaultValue: item.oralRegion })}</small>}
        {item.aiResult?.model && <small>{t('clinicalReview.model')}: {item.aiResult.model}</small>}
        <p className="reviewing-clinician-disclaimer">{t('clinicalReview.preliminaryDisclaimer')}</p>
        {item.questionnaire?.symptoms?.length > 0 && <p><b>{t('clinicalReview.reportedSymptoms')}:</b> {item.questionnaire.symptoms.map(value => t(`patientScreening.symptomValues.${value}`, { defaultValue: value.replaceAll('-', ' ') })).join(', ')}</p>}
        {item.questionnaire?.symptomDuration && <p><b>{t('patientScreening.symptomDuration')}:</b> {t(`patientScreening.symptomDurationValues.${item.questionnaire.symptomDuration}`, { defaultValue: item.questionnaire.symptomDuration.replaceAll('-', ' ') })}</p>}
        {item.questionnaire?.otherSymptoms && <p><b>{t('patientScreening.otherSymptoms')}:</b> {item.questionnaire.otherSymptoms}</p>}
        {item.questionnaire?.location && <p><b>{t('patientScreening.location')}:</b> {item.questionnaire.location}</p>}
      </section>
    </div>
    <div className="reviewing-clinician-form">
      <label>{t('clinicalReview.clinicalCategory')}<select value={category} onChange={event => setCategory(event.target.value)}><option value="">{t('clinicalReview.selectCategory')}</option>{Object.entries(categoryKeys).map(([value, key]) => <option key={value} value={value}>{t(`screening.${key}`)}</option>)}</select></label>
      <label>{t('clinicalReview.diagnosisNotes')}<textarea value={diagnosisNotes} maxLength={3000} onChange={event => setDiagnosisNotes(event.target.value)} placeholder={t('clinicalReview.diagnosisPlaceholder')}/></label>
      <label>{t('clinicalReview.treatmentRecommendations')}<textarea value={treatmentRecommendations} maxLength={3000} onChange={event => setTreatmentRecommendations(event.target.value)} placeholder={t('clinicalReview.treatmentPlaceholder')}/></label>
      <label>{t('clinicalReview.referralFacility')}<select value={referralHospital} onChange={event => setReferralHospital(event.target.value)}><option value="">{t('clinicalReview.noReferral')}</option>{hospitals.map(hospital => <option key={hospital._id} value={hospital._id}>{hospital.name} · {[hospital.village, hospital.district].filter(Boolean).join(', ')}</option>)}</select></label>
      {referralHospital && <label>{t('clinicalReview.referralReason')}<textarea value={referralReason} maxLength={1500} onChange={event => setReferralReason(event.target.value)} required placeholder={t('clinicalReview.referralReasonPlaceholder')}/></label>}
    </div>
    {reviewHistory.length > 0 && <section className="reviewing-clinician-history">
      <h3>{t('clinicalReview.reviewHistory')}</h3>
      {reviewHistory.map((review, index) => <article key={review._id || `${review.reviewedAt}-${index}`}>
        <b>{t(`clinicalReview.decisions.${review.decision}`, { defaultValue: review.decision })}</b>
        <time>{review.reviewedAt ? new Date(review.reviewedAt).toLocaleString(locale) : '—'}</time>
        <span>{review.reviewedBy?.name || t('clinical.doctor')}</span>
        {review.diagnosisNotes && <p><b>{t('clinicalReview.diagnosisNotes')}:</b> {review.diagnosisNotes}</p>}
        {!review.diagnosisNotes && review.notes && <p>{review.notes}</p>}
        {review.treatmentRecommendations && <p><b>{t('clinicalReview.treatmentRecommendations')}:</b> {review.treatmentRecommendations}</p>}
        {review.referralReason && <p><b>{t('clinicalReview.referralReason')}:</b> {review.referralReason}</p>}
      </article>)}
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="reviewing-clinician-actions">
      <button className="auth-submit" disabled={busy || !category || Boolean(referralHospital && !referralReason.trim())} onClick={() => save('approved')}>{t('clinicalReview.decisions.approved')}</button>
      <button className="reviewing-clinician-reject" disabled={busy || !category || Boolean(referralHospital && !referralReason.trim())} onClick={() => save('rejected')}>{t('clinicalReview.decisions.rejected')}</button>
      <button className="date-chip" disabled={busy || !category || Boolean(referralHospital && !referralReason.trim())} onClick={() => save('needs-further-examination')}>{t('clinicalReview.decisions.needs-further-examination')}</button>
    </div>
  </article>;
}

export function ScreeningHistory({ records, patients, onRefresh }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
  const patientName = id => patients.find(p => p._id === id)?.name || t('screening.patientRecord');
  return <section className="panel screening-history">
    <div className="panel-heading"><div><h2>{t('screening.history')}</h2><p>{t('screening.historyHelp')}</p></div><button className="date-chip" onClick={onRefresh}>{t('screening.refresh')}</button></div>
    <div className="screening-limit" role="note">{t('screening.limitation')}</div>
    {records.length ? <div className="content-list">{records.map(item => <article className="screening-history-row" key={item._id}>
      <span className="list-marker">◉</span>
      <span className="list-main">
        <b>{patientName(item.patient)} · {t(`screening.${categoryKeys[item.aiResult?.category || item.category]}`)}</b>
        <small>{new Date(item.screenedAt).toLocaleString(locale)} · {t('screening.confidenceLabel')} {item.aiResult ? `${Math.round(item.aiResult.confidence * 100).toLocaleString(locale)}% (${t('screening.demo')})` : t('screening.legacyRecord')}</small>
        {item.doctorAssessment && <small>{t('screening.doctor')}: {t(`screening.${categoryKeys[item.doctorAssessment.category]}`)} · {translateDecision(t, item.doctorAssessment.decision)}{item.doctorAssessment.notes ? ` · ${item.doctorAssessment.notes}` : ''}</small>}
      </span>
      <span className={`status-tag ${item.doctorAssessment ? 'reviewed' : 'needs-review'}`}>{item.doctorAssessment ? t('statuses.Reviewed') : item.aiResult?.suspicious ? t('statuses.Needs review') : t(`statuses.${item.status}`)}</span>
    </article>)}</div> : <div className="empty-state"><span>◉</span><b>{t('screening.noRecords')}</b><p>{t('screening.noRecordsHelp')}</p></div>}
  </section>;
}
