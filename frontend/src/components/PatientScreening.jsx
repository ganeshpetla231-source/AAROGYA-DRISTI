import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { analyzePatientScreening, getMyScreenings, getScreeningImage, getVerifiedProviders } from '../services/api.js';
import { recommendDoctors } from '../utils/doctorRecommendations.js';
import './patient-screening.css';

const maxImageBytes = 8 * 1024 * 1024;
const regions = ['tongue', 'inner-cheek', 'gums', 'lips', 'floor-of-mouth', 'roof-of-mouth', 'other'];
const categories = [
  'possible-ulcer', 'possible-thrush', 'possible-gingivitis', 'possible-infection',
  'possible-white-patch', 'possible-red-lesion', 'other-abnormality',
  'insufficient-quality', 'no-visible-abnormality'
];

function ScreeningHistoryImage({ id, alt }) {
  const { t } = useTranslation();
  const [requested, setRequested] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!requested) return undefined;
    let active = true;
    let objectUrl = '';
    getScreeningImage(id).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setImageUrl(objectUrl);
    }).catch(() => {
      if (active) setUnavailable(true);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, requested]);

  if (imageUrl) return <img className="patient-screening-history-image" src={imageUrl} alt={alt}/>;
  if (!requested) return <button type="button" className="clinical-secondary patient-screening-image-button" onClick={() => setRequested(true)}>{t('patientScreening.viewPrivateImage')}</button>;
  return <p className="patient-screening-image-note" role={unavailable ? 'status' : undefined}>
    {unavailable ? alt : t('patientScreening.loadingImage')}
  </p>;
}

export function PatientScreening({ historyOnly = false, onNavigate }) {
  const { t, i18n } = useTranslation();
  const [history, setHistory] = useState([]);
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [region, setRegion] = useState('');
  const [file, setFile] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState(null);
  const cameraRef = useRef(null);
  const streamRef = useRef(null);
  const cameraRequestRef = useRef(0);
  const [imagePreview, setImagePreview] = useState('');
  const latestCategory = latest?.screening?.aiResult?.category || latest?.screening?.category;
  const recommendations = useMemo(
    () => latestCategory ? recommendDoctors(latestCategory, providers) : { matched: false, doctors: [] },
    [latestCategory, providers]
  );

  useEffect(() => {
    if (!file) {
      setImagePreview('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => {
    if (cameraRef.current && streamRef.current) cameraRef.current.srcObject = streamRef.current;
  }, [cameraActive]);
  useEffect(() => {
    if (!latest?.imageUrl) return undefined;
    return () => URL.revokeObjectURL(latest.imageUrl);
  }, [latest]);

  function stopCamera() {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (cameraRef.current) cameraRef.current.srcObject = null;
    setCameraActive(false);
  }

  async function startCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('patientScreening.cameraUnsupported'));
      return;
    }
    const requestId = ++cameraRequestRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraActive(true);
    } catch (failure) {
      if (requestId !== cameraRequestRef.current) return;
      setError(failure.name === 'NotAllowedError' || failure.name === 'SecurityError'
        ? t('patientScreening.cameraDenied')
        : t('patientScreening.cameraFailed'));
    }
  }

  async function capturePhoto() {
    const video = cameraRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError(t('patientScreening.cameraNotReady'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError(t('patientScreening.captureFailed'));
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      let blob = null;
      for (const quality of [0.9, 0.8, 0.7, 0.6]) {
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= maxImageBytes) break;
      }
      if (!blob) {
        setError(t('patientScreening.captureFailed'));
        return;
      }
      if (blob.size > maxImageBytes) {
        setError(t('patientScreening.imageTooLarge'));
        return;
      }
      setFile(new File([blob], `oral-screening-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      stopCamera();
    } catch {
      setError(t('patientScreening.captureFailed'));
    }
  }

  async function loadPage() {
    setLoading(true);
    const [screeningsResult, providersResult] = await Promise.allSettled([
      getMyScreenings({ limit: 20 }),
      historyOnly ? Promise.resolve({ items: [] }) : getVerifiedProviders()
    ]);
    if (screeningsResult.status === 'fulfilled') setHistory(screeningsResult.value.items);
    else setError(screeningsResult.reason.message);
    if (providersResult.status === 'fulfilled') setProviders(providersResult.value.items);
    else setError(current => current || providersResult.reason.message);
    setLoading(false);
  }

  useEffect(() => { loadPage(); }, [historyOnly]);

  function selectImage(nextFile) {
    setError('');
    stopCamera();
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(nextFile.type)) {
      setFile(null);
      setError(t('patientScreening.invalidImageType'));
      return;
    }
    if (nextFile.size > maxImageBytes) {
      setFile(null);
      setError(t('patientScreening.imageTooLarge'));
      return;
    }
    setLatest(null);
    setFile(nextFile);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!file) {
      setError(t('patientScreening.imageRequired'));
      return;
    }
    if (!consent) {
      setError(t('patientScreening.consentRequired'));
      return;
    }
    if (file.size > maxImageBytes) {
      setError(t('patientScreening.imageTooLarge'));
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('consentGranted', 'true');
      form.append('language', ['en', 'te', 'hi'].includes(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en');
      if (region) form.append('oralRegion', region);
      const doctor = providers.find(item => String(item.id) === providerId);
      if (doctor) {
        form.append('reviewingDoctor', providerId);
        if (doctor.hospital?._id) form.append('hospitalId', doctor.hospital._id);
      }
      form.append('image', file);
      const result = await analyzePatientScreening(form);
      setLatest({ screening: result, imageUrl: URL.createObjectURL(file) });
      setFile(null);
      setConsent(false);
      setRegion('');
      setProviderId('');
      const historyResult = await getMyScreenings({ limit: 20 });
      setHistory(historyResult.items);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function categoryLabel(category) {
    if (category === 'pending-clinical-assessment') return t('patientScreening.statusPending');
    return categories.includes(category)
      ? t(`patientScreening.categories.${category}`)
      : t('patientScreening.unknownResult');
  }

  function statusLabel(category) {
    if (category === 'pending-clinical-assessment') return t('patientScreening.statusPending');
    if (category === 'no-visible-abnormality') return t('patientScreening.statusNoVisible');
    if (category === 'insufficient-quality') return t('patientScreening.statusInsufficient');
    return t('patientScreening.statusPossible');
  }

  function recommendedNextSteps(category) {
    if (category === 'insufficient-quality') return t('patientScreening.nextStepsQuality');
    if (category === 'no-visible-abnormality') return t('patientScreening.nextStepsNoVisible');
    return t('patientScreening.nextStepsPossible');
  }

  function renderReport(screening, imageUrl, key) {
    const result = screening.aiResult || {};
    const category = result.category || screening.category;
    return <article className="patient-screening-report" key={key}>
      {imageUrl
        ? <img className="patient-screening-history-image" src={imageUrl} alt={t('patientScreening.imagePreview')}/>
        : <ScreeningHistoryImage id={screening._id} alt={t('patientScreening.historyImageUnavailable')}/>}
      <div className="patient-screening-report-content">
        <div className="patient-screening-report-heading">
          <strong>{categoryLabel(category)}</strong>
          <time dateTime={screening.screenedAt}>{new Date(screening.screenedAt).toLocaleString()}</time>
        </div>
        {result.model && <small>{t('clinicalReview.model')}: {result.model}</small>}
        <span className="patient-screening-status">{statusLabel(category)}</span>
        {result.finding && <p><strong>{t('patientScreening.finding')}:</strong> {result.finding}</p>}
        {result.possibleCauses?.length > 0 && <div>
          <strong>{t('patientScreening.possibleCauses')}</strong>
          <ul>{result.possibleCauses.map((cause, index) => <li key={`${cause}-${index}`}>{cause}</li>)}</ul>
        </div>}
        {result.explanation && <p>{result.explanation}</p>}
        {result.nextSteps && <p><strong>{t('patientScreening.nextSteps')}:</strong> {recommendedNextSteps(category)}</p>}
        {(screening.reviews?.length ? screening.reviews : screening.doctorAssessment ? [screening.doctorAssessment] : []).map((review, index) => <div key={review._id || `${review.reviewedAt}-${index}`}>
          <p><strong>{t('patientScreening.clinicianReview')} · {review.reviewedBy?.name || t('patientScreening.doctorLabel')} — {t(`clinicalReview.decisions.${review.decision}`, { defaultValue: review.decision })}:</strong> {review.diagnosisNotes || review.notes || t('patientScreening.reviewSaved')}</p>
          {review.treatmentRecommendations && <p><strong>{t('clinicalReview.treatmentRecommendations')}:</strong> {review.treatmentRecommendations}</p>}
          {review.referralHospital?.name && <p><strong>{t('clinicalReview.referralFacility')}:</strong> {review.referralHospital.name}</p>}
          <small>{review.reviewedAt ? new Date(review.reviewedAt).toLocaleString() : ''}</small>
        </div>)}
      </div>
    </article>;
  }

  return <div className="patient-screening-workspace">
    {error && <p className="form-error" role="alert">{error}</p>}

    {!historyOnly && <>
    <header className="patient-screening-header">
      <h2>{t('patientScreening.title')}</h2>
      <p>{t('patientScreening.intro')}</p>
    </header>

    <form className="patient-screening-form" onSubmit={submit}>
      <section className="patient-screening-card">
        <h3>{t('patientScreening.imageDetails')}</h3>
        <p>{t('patientScreening.photoGuide')}</p>
        <div className="screening-camera-controls">
          {!cameraActive
            ? <button type="button" className="clinical-secondary" onClick={startCamera}>{t('patientScreening.startCamera')}</button>
            : <>
              <video ref={cameraRef} className="screening-camera-preview" autoPlay muted playsInline aria-label={t('patientScreening.cameraPreview')}/>
              <div className="screening-camera-actions">
                <button type="button" className="clinical-secondary" onClick={capturePhoto}>{t('patientScreening.capturePhoto')}</button>
                <button type="button" className="clinical-secondary" onClick={stopCamera}>{t('patientScreening.stopCamera')}</button>
              </div>
            </>}
        </div>
        <label className="patient-screening-upload">
          <span>{t('patientScreening.uploadImage')}</span>
          <input type="file" accept="image/jpeg,image/png" capture="environment" onChange={event => {
            selectImage(event.target.files?.[0]);
            event.target.value = '';
          }}/>
        </label>
        {file && imagePreview && <div className="patient-screening-preview">
          <img className="screening-camera-preview" src={imagePreview} alt={t('patientScreening.imagePreview')}/>
          <span>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>
          <div className="screening-camera-actions">
            <button type="button" className="clinical-secondary" onClick={startCamera}>{t('patientScreening.retakeImage')}</button>
            <button type="button" className="clinical-secondary" onClick={() => setFile(null)}>{t('patientScreening.removeImage')}</button>
          </div>
        </div>}
        <label className="patient-screening-region">
          <span>{t('patientScreening.oralRegion')}</span>
          <select value={region} onChange={event => setRegion(event.target.value)}>
            <option value="">{t('patientScreening.regionOptional')}</option>
            {regions.map(value => <option key={value} value={value}>{t(`patientScreening.options.${value}`)}</option>)}
          </select>
        </label>
        <label className="patient-screening-region">
          <span>{t('patientScreening.chooseDoctor')}</span>
          <select value={providerId} onChange={event => setProviderId(event.target.value)}>
            <option value="">{t('patientScreening.chooseDoctorPlaceholder')}</option>
            {providers.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.name} · {doctor.profile?.department || doctor.profile?.specialization || t('patientScreening.doctorLabel')}{doctor.hospital?.name ? ` · ${doctor.hospital.name}` : ''}</option>)}
          </select>
        </label>
        {!loading && <p className="patient-screening-assignment-note">{providers.length
          ? t('patientScreening.reviewAssignmentHint')
          : t('patientScreening.noDoctors')}</p>}
        <label className="patient-screening-consent">
          <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>
          <span>{t('patientScreening.consent')}</span>
        </label>
        <button className="auth-submit" disabled={busy || loading || cameraActive || !file || !consent}>
          {busy ? t('patientScreening.analyzing') : t('patientScreening.analyze')}
        </button>
        {busy && <p className="patient-screening-processing" role="status">{t('patientScreening.processing')}</p>}
      </section>
    </form>

    <aside className="patient-screening-disclaimer" role="note">{t('patientScreening.disclaimer')}</aside>

    {latest && <section className="patient-screening-card patient-screening-results" aria-live="polite">
      <h3>{t('patientScreening.resultsTitle')}</h3>
      <p className="patient-screening-status">{statusLabel(latest.screening.aiResult?.category || latest.screening.category)}</p>
      {renderReport(latest.screening, latest.imageUrl, 'latest')}
      <section className="patient-screening-doctor-suggestions" aria-labelledby="patient-screening-doctor-suggestions-title">
        <h3 id="patient-screening-doctor-suggestions-title">{t('patientScreening.recommendationTitle')}</h3>
        <p>{latestCategory === 'insufficient-quality'
          ? t('patientScreening.recommendationQuality')
          : recommendations.matched
            ? t('patientScreening.recommendationMatched')
            : t('patientScreening.recommendationFallback')}</p>
        {recommendations.doctors.length > 0
          ? <div className="patient-screening-doctor-grid">{recommendations.doctors.map(doctor => <article key={doctor.id}>
            <strong>{doctor.name}</strong>
            <span>{doctor.profile?.department || doctor.profile?.specialization || t('patientScreening.generalDepartment')}</span>
            {doctor.profile?.specialization && doctor.profile.specialization !== doctor.profile.department && <small>{doctor.profile.specialization}</small>}
            {doctor.hospital?.name && <small>{doctor.hospital.name}</small>}
          </article>)}</div>
          : latestCategory !== 'insufficient-quality' && <p>{t('patientScreening.noRecommendedDoctors')}</p>}
        <div className="patient-screening-doctor-actions">
          <button type="button" className="clinical-secondary" onClick={() => onNavigate?.('appointments')}>{t('patientScreening.bookClinicAppointment')}</button>
          <button type="button" className="clinical-secondary" onClick={() => onNavigate?.('video-consultation')}>{t('patientScreening.bookVideoConsultation')}</button>
        </div>
      </section>
    </section>}
    </>}

    <section className="patient-screening-card patient-screening-history">
      <h3>{t('patientScreening.history')}</h3>
      {loading ? <p>{t('common.loading')}</p> : history.length
        ? history.map(item => renderReport(item, '', item._id))
        : <p>{t('patientScreening.noHistory')}</p>}
    </section>
  </div>;
}
