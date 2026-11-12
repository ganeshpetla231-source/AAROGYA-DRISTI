import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { ZoomableScreeningImage } from './Screenings.jsx';
import { createClinicalNote, createClinicalPrescription, createClinicalReferral, downloadClinicalDocument, getClinicalPatient, getClinicalPatients, getScreeningImage, reviewScreening, scanPatientQr, scheduleClinicalFollowup, updateClinicalPrescription, uploadClinicalLabReport } from '../services/api.js';
import { patientAgeFromDateOfBirth } from '../utils/patientAge.js';

const categoryKeys = {
  'possible-ulcer': 'possibleUlcer', 'possible-thrush': 'possibleThrush', 'possible-gingivitis': 'possibleGingivitis',
  'possible-infection': 'possibleInfection', 'possible-white-patch': 'possibleWhitePatch', 'possible-red-lesion': 'possibleRedLesion',
  'other-abnormality': 'otherAbnormality', 'insufficient-quality': 'imageQuality', 'no-visible-abnormality': 'noAbnormality'
};
const states = ['All', 'Needs review', 'Follow-up', 'Reviewed', 'Referred', 'Screened'];

export function ClinicalWorkspace() {
  const { t } = useTranslation();
  const [patients, setPatients] = useState([]), [query, setQuery] = useState(''), [status, setStatus] = useState('All'), [selectedKey, setSelectedKey] = useState('');
  const [detail, setDetail] = useState(null), [queueLoading, setQueueLoading] = useState(true), [detailLoading, setDetailLoading] = useState(false), [error, setError] = useState('');
  async function loadQueue() { setQueueLoading(true); try { setPatients((await getClinicalPatients({ q: query, status })).items || []); setError(''); } catch (e) { setError(e.message); } finally { setQueueLoading(false); } }
  async function loadDetail(key = selectedKey) { if (!key) return; setDetailLoading(true); try { setDetail(await getClinicalPatient(key)); setError(''); } catch (e) { setDetail(null); setError(e.message); } finally { setDetailLoading(false); } }
  useEffect(() => { const timer = setTimeout(loadQueue, 220); return () => clearTimeout(timer); }, [query, status]);
  useEffect(() => { if (selectedKey) loadDetail(selectedKey); }, [selectedKey]);
  const refresh = async () => { await Promise.all([loadQueue(), selectedKey ? loadDetail(selectedKey) : Promise.resolve()]); };
  return <div className="clinical-workspace"><div className="clinical-intro"><div><span className="demo-label">{t('clinical.authorizedTitle')}</span><p>{t('clinical.privacyHelp')}</p></div><button className="date-chip" onClick={refresh}>↻ {t('common.refresh')}</button></div>{error && <div className="api-alert" role="alert"><span>{error}</span><button onClick={refresh}>{t('common.retry')}</button></div>}
    <div className="clinical-layout"><aside className="panel clinical-queue"><div className="panel-heading"><div><h2>{t('clinical.queue')}</h2><p>{t('clinical.authorizedCount', { count: patients.length })}</p></div><span className="db-pill">{t('common.database')}</span></div><label className="search-input clinical-search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('clinical.searchPlaceholder')}/></label><select className="clinical-filter" value={status} onChange={e => setStatus(e.target.value)}>{states.map(item => <option key={item} value={item}>{item === 'All' ? t('common.allStatuses') : t(`statuses.${item}`)}</option>)}</select><QrLookup onPatient={key => setSelectedKey(key)}/>{queueLoading ? <div className="loading-state"><span className="spinner"/>{t('clinical.loadingQueue')}</div> : patients.length ? <div className="clinical-patient-list">{patients.map(patient => <button className={`clinical-patient ${selectedKey === patient.patientId ? 'selected' : ''}`} key={patient._id} onClick={() => setSelectedKey(patient.patientId)}><span className="clinical-avatar">{patient.name.split(' ').map(word => word[0]).join('').slice(0,2)}</span><span><b>{patient.name}</b><small>{patient.patientId} · {patient.village}{patient.district ? `, ${patient.district}` : ''}</small></span><span className={`status-tag ${patient.needsReview ? 'needs-review' : statusClass(patient.status)}`}>{patient.needsReview ? t('statuses.Needs review') : t(`statuses.${patient.status}`)}</span></button>)}</div> : <div className="empty-state"><span>⌕</span><b>{t('clinical.noLinked')}</b><p>{t('clinical.searchQrHelp')}</p></div>}</aside>
      <section className="clinical-record-area">{detailLoading ? <div className="panel loading-state"><span className="spinner"/>{t('clinical.openingRecord')}</div> : detail ? <ClinicalRecord key={detail.patient._id} data={detail} onRefresh={refresh}/> : <div className="panel clinical-placeholder"><span className="clinical-placeholder-icon">✚</span><h2>{t('clinical.openRecord')}</h2><p>{t('clinical.selectHelp')}</p></div>}</section></div></div>;
}

function statusClass(status='') { return status.toLowerCase().replaceAll(' ', '-'); }
function formatClinicalDate(value, language, dateOnly = false) {
  const locale = language === 'te' ? 'te-IN' : language === 'hi' ? 'hi-IN' : 'en-US';
  return new Date(value).toLocaleString(locale, dateOnly ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' });
}

function QrLookup({ onPatient }) {
  const { t } = useTranslation();
  const [camera, setCamera] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const video = useRef(null), controls = useRef(null), reader = useRef(new BrowserMultiFormatReader()), busy = useRef(false);
  async function process(token) { if (!token || busy.current) return; busy.current = true; setError(''); setMessage(t('clinical.checkingQr')); try { const result = await scanPatientQr(token); const p = result.patient; setMessage(t('clinical.verifiedPatient', { name: p.name, id: p.patientId })); onPatient(p.patientId); controls.current?.stop(); setCamera(false); } catch (e) { setMessage(''); setError(e.message); controls.current?.stop(); setCamera(false); } finally { busy.current = false; } }
  useEffect(() => { if (!camera || !video.current) return; let cancelled = false; reader.current.decodeFromVideoDevice(undefined, video.current, result => { if (result && !cancelled) process(result.getText()); }).then(c => { if (cancelled) c.stop(); else controls.current = c; }).catch(e => { if (!cancelled) { setCamera(false); setError(e.message || t('clinical.cameraStartFailed')); } }); return () => { cancelled = true; controls.current?.stop(); controls.current = null; }; }, [camera]);
  async function scanImage(event) { const file = event.target.files?.[0]; if (!file) return; const url = URL.createObjectURL(file); setError(''); try { const code = await reader.current.decodeFromImageUrl(url); await process(code.getText()); } catch (e) { setError(t('clinical.qrUnreadable')); } finally { URL.revokeObjectURL(url); event.target.value = ''; } }
  return <div className="clinical-qr"><div className="clinical-qr-actions"><button className="text-link" onClick={() => { setError(''); setCamera(value => !value); }}>{camera ? t('clinical.stopQr') : t('clinical.scanQr')}</button><label className="text-link clinical-qr-upload">{t('clinical.uploadQr')}<input type="file" accept="image/*" onChange={scanImage}/></label></div>{camera && <video ref={video} className="clinical-qr-video" muted playsInline/>}{message && <small className="clinical-qr-message" role="status">{message}</small>}{error && <small className="form-error" role="alert">{error}</small>}</div>;
}

function ClinicalRecord({ data, onRefresh }) {
  const { t, i18n } = useTranslation();
  const { patient, screenings, medicalHistory, prescriptions, appointments, referrals, documents, transcripts, hospitals } = data;
  const dobAge = patientAgeFromDateOfBirth(patient.dateOfBirth);
  const humanAge = dobAge !== null ? t('clinical.years', { count: dobAge }) : Number.isInteger(patient.age) ? t('clinical.years', { count: patient.age }) : '—';
  return <div className="clinical-record"><header className="panel clinical-patient-header"><div><span className="demo-label">{t('clinical.patientLabel', { id: patient.patientId })}</span><h1>{patient.name}</h1><p>{[humanAge, patient.gender, patient.village, patient.district, patient.phone].filter(Boolean).join(' · ')}</p></div><span className={`status-tag ${statusClass(patient.status)}`}>{t(`statuses.${patient.status}`)}</span></header>
    <section className="panel clinical-section"><div className="panel-heading"><div><h2>{t('clinical.oralHistory')}</h2><p>{t('clinical.aiHelp')}</p></div><span className="db-pill">{t('clinical.aiDoctor')}</span></div>{screenings.length ? <div className="clinical-screenings">{screenings.map(item => <ScreeningRecord key={item._id} item={item} hospitals={hospitals} onRefresh={onRefresh}/>)}</div> : <div className="empty-state"><b>{t('clinical.noImages')}</b><p>{t('clinical.screeningHelp')}</p></div>}</section>
    <section className="clinical-two-col"><ClinicalNoteForm patientKey={patient.patientId} recordType="assessment" title={t('clinical.assessment')} onSaved={onRefresh}/><ClinicalNoteForm patientKey={patient.patientId} recordType="note" title={t('clinical.doctorNotes')} onSaved={onRefresh}/></section>
    <ClinicalNoteForm patientKey={patient.patientId} recordType="treatment" title={t('clinical.treatmentHistory')} onSaved={onRefresh}/>
    <section className="panel clinical-section"><div className="panel-heading"><div><h2>{t('clinical.medicalFollowup')}</h2><p>{t('clinical.savedClinical')}</p></div></div><ClinicalNoteForm patientKey={patient.patientId} recordType="follow-up" title={t('clinical.followupRecommendation')} compact onSaved={onRefresh}/><div className="clinical-record-list">{medicalHistory.length ? medicalHistory.map(item => <article key={item._id}><span className="clinical-record-type">{t(`clinical.recordTypes.${item.recordType}`, { defaultValue: item.recordType })}</span><div><b>{item.title}</b><p>{item.notes}</p><small>{formatClinicalDate(item.recordedAt, i18n.resolvedLanguage)} · {item.author?.name || t('clinical.careTeam')}</small></div></article>) : <div className="empty-state"><b>{t('clinical.noMedicalHistory')}</b></div>}</div></section>
    <section className="clinical-two-col"><PrescriptionPanel patientKey={patient.patientId} items={prescriptions} onRefresh={onRefresh}/><FollowupPanel patientKey={patient.patientId} hospitals={hospitals} appointments={appointments} onRefresh={onRefresh}/></section>
    <section className="clinical-two-col"><ReferralPanel patientKey={patient.patientId} hospitals={hospitals} referrals={referrals} onRefresh={onRefresh}/><LabReportPanel patientKey={patient.patientId} documents={documents} onRefresh={onRefresh}/></section>
    <section className="panel clinical-section"><div className="panel-heading"><div><h2>{t('clinical.voiceNotes')}</h2><p>{t('clinical.transcriptDisclaimer')}</p></div></div>{transcripts.length ? transcripts.map(item => <article className="clinical-transcript" key={item._id}><div className="clinical-transcript-pair"><p><b>{t('clinical.original')} · {t(`clinical.detectedLanguages.${item.detectedLanguage}`, { defaultValue: item.detectedLanguage })}</b><br/>{item.originalTranscript}</p><p><b>{t('voice.englishTranslation')}</b><br/>{item.englishTranslation || t('clinical.translationPending')}</p></div><small>{item.review?.status === 'reviewed' ? t('clinical.doctorReviewedBy', { name: item.review.reviewedBy?.name || t('clinical.careTeam') }) : t('clinical.awaitingTranscriptReview')} · {formatClinicalDate(item.createdAt, i18n.resolvedLanguage)}</small></article>) : <div className="empty-state"><b>{t('clinical.noTranscripts')}</b></div>}</section>
  </div>;
}

function ScreeningRecord({ item, hospitals, onRefresh }) {
  const { t, i18n } = useTranslation();
  const [image, setImage] = useState('');
  const [category, setCategory] = useState(item.doctorAssessment?.category || (Object.hasOwn(categoryKeys, item.aiResult?.category) ? item.aiResult.category : ''));
  const [diagnosisNotes, setDiagnosisNotes] = useState(item.doctorAssessment?.diagnosisNotes || item.doctorAssessment?.notes || '');
  const [treatmentRecommendations, setTreatmentRecommendations] = useState(item.doctorAssessment?.treatmentRecommendations || '');
  const [referralHospital, setReferralHospital] = useState('');
  const [referralReason, setReferralReason] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { let url; let active = true; getScreeningImage(item._id).then(blob => { if (!active) return; url = URL.createObjectURL(blob); setImage(url); }).catch(e => setError(e.message)); return () => { active = false; if (url) URL.revokeObjectURL(url); }; }, [item._id]);
  async function save(nextDecision) {
    setBusy(true);
    setError('');
    try {
      await reviewScreening(item._id, {
        category, decision: nextDecision, diagnosisNotes, treatmentRecommendations,
        ...(referralHospital ? { referral: { hospital: referralHospital, reason: referralReason } } : {})
      });
      await onRefresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const reviewHistory = item.reviews?.length ? item.reviews : item.doctorAssessment ? [item.doctorAssessment] : [];
  return <article className="clinical-screening-card">
    <div className="clinical-screening-top"><b>{formatClinicalDate(item.screenedAt, i18n.resolvedLanguage)} · {item.screenedBy?.name || t('clinical.careTeam')}</b><span className="status-tag">{t(`statuses.${item.status}`, { defaultValue: item.status })}</span></div>
    <div className="clinical-screening-grid">
      {image ? <ZoomableScreeningImage src={image} alt={t('screening.previewAlt')}/> : <div className="clinical-image-placeholder">{error ? t('clinical.imageUnavailable') : t('clinical.loadingImage')}</div>}
      <div className="clinical-ai-result"><span className="demo-label">{t('clinicalReview.preliminaryFinding')}</span><h3>{item.aiResult ? t(`screening.${categoryKeys[item.aiResult.category]}`, { defaultValue: item.aiResult.category }) : t('clinicalReview.noAiResult')}</h3>
        {item.aiResult?.finding && <p><b>{t('clinicalReview.visibleObservation')}:</b> {item.aiResult.finding}</p>}
        {item.aiResult?.possibleCauses?.length > 0 && <div><b>{t('patientScreening.possibleCauses')}</b><ul>{item.aiResult.possibleCauses.map((cause, index) => <li key={`${cause}-${index}`}>{cause}</li>)}</ul></div>}
        {item.aiResult?.explanation && <p>{item.aiResult.explanation}</p>}
        {item.aiResult?.model && <small>{t('clinicalReview.model')}: {item.aiResult.model}</small>}
        {item.aiResult && <p>{item.aiResult.demonstration ? t('clinical.notValidated') : t('clinicalReview.preliminaryDisclaimer')}</p>}
        {item.questionnaire?.symptoms?.length > 0 && <p><b>{t('clinicalReview.reportedSymptoms')}:</b> {item.questionnaire.symptoms.map(value => t(`patientScreening.symptomValues.${value}`, { defaultValue: value.replaceAll('-', ' ') })).join(', ')}</p>}
        {item.questionnaire?.symptomDuration && <p><b>{t('patientScreening.symptomDuration')}:</b> {t(`patientScreening.symptomDurationValues.${item.questionnaire.symptomDuration}`, { defaultValue: item.questionnaire.symptomDuration.replaceAll('-', ' ') })}</p>}
        {item.questionnaire?.otherSymptoms && <p><b>{t('patientScreening.otherSymptoms')}:</b> {item.questionnaire.otherSymptoms}</p>}
        {item.questionnaire?.location && <p><b>{t('patientScreening.location')}:</b> {item.questionnaire.location}</p>}
      </div>
    </div>
    {reviewHistory.length > 0 && <div className="clinical-doctor-result">
      <span className="demo-label">{t('clinicalReview.reviewHistory')}</span>
      {reviewHistory.map((review, index) => <div key={review._id || `${review.reviewedAt}-${index}`}>
        <b>{t(`clinicalReview.decisions.${review.decision}`, { defaultValue: review.decision })} · {review.reviewedBy?.name || t('clinical.doctor')}</b>
        {review.diagnosisNotes || review.notes ? <p>{review.diagnosisNotes || review.notes}</p> : null}
        {review.treatmentRecommendations ? <p><b>{t('clinicalReview.treatmentRecommendations')}:</b> {review.treatmentRecommendations}</p> : null}
        {review.referralReason ? <p><b>{t('clinicalReview.referralReason')}:</b> {review.referralReason}</p> : null}
        <small>{formatClinicalDate(review.reviewedAt, i18n.resolvedLanguage)}</small>
      </div>)}
    </div>}
    <div className="clinical-review-form">
      <span className="demo-label">{t('clinical.yourReview')}</span>
      <label>{t('clinicalReview.clinicalCategory')}<select value={category} onChange={event => setCategory(event.target.value)}><option value="">{t('clinicalReview.selectCategory')}</option>{Object.entries(categoryKeys).map(([value, key]) => <option key={value} value={value}>{t(`screening.${key}`)}</option>)}</select></label>
      <label>{t('clinicalReview.diagnosisNotes')}<textarea value={diagnosisNotes} onChange={event => setDiagnosisNotes(event.target.value)} maxLength={3000} placeholder={t('clinicalReview.diagnosisPlaceholder')}/></label>
      <label>{t('clinicalReview.treatmentRecommendations')}<textarea value={treatmentRecommendations} onChange={event => setTreatmentRecommendations(event.target.value)} maxLength={3000} placeholder={t('clinicalReview.treatmentPlaceholder')}/></label>
      <label>{t('clinicalReview.referralFacility')}<select value={referralHospital} onChange={event => setReferralHospital(event.target.value)}><option value="">{t('clinicalReview.noReferral')}</option>{hospitals.map(hospital => <option key={hospital._id} value={hospital._id}>{hospital.name} · {[hospital.village, hospital.district].filter(Boolean).join(', ')}</option>)}</select></label>
      {referralHospital && <label>{t('clinicalReview.referralReason')}<textarea value={referralReason} onChange={event => setReferralReason(event.target.value)} maxLength={1500} placeholder={t('clinicalReview.referralReasonPlaceholder')}/></label>}
      {error && <small className="form-error">{error}</small>}
      <div className="clinical-actions">
        <button className="auth-submit" disabled={busy || !category || Boolean(referralHospital && !referralReason.trim())} onClick={() => save('approved')}>{t('clinicalReview.decisions.approved')}</button>
        <button className="reviewing-clinician-reject" disabled={busy || !category || Boolean(referralHospital && !referralReason.trim())} onClick={() => save('rejected')}>{t('clinicalReview.decisions.rejected')}</button>
        <button className="date-chip" disabled={busy || !category || Boolean(referralHospital && !referralReason.trim())} onClick={() => save('needs-further-examination')}>{t('clinicalReview.decisions.needs-further-examination')}</button>
      </div>
    </div>
  </article>;
}

function ClinicalNoteForm({ patientKey, recordType, title, compact = false, onSaved }) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(''), [error, setError] = useState(''), [saved, setSaved] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); setSaved(''); try { await createClinicalNote(patientKey, { recordType, title, notes }); setNotes(''); setSaved(t('clinical.savedToRecord')); await onSaved(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  const placeholderKey = recordType === 'assessment' ? 'assessmentPlaceholder' : recordType === 'treatment' ? 'treatmentPlaceholder' : recordType === 'follow-up' ? 'followupPlaceholder' : 'doctorNotesPlaceholder';
  const translatedType = recordType === 'follow-up' ? t('clinical.followupRecommendation') : t(`clinical.${recordType === 'assessment' ? 'assessment' : recordType === 'treatment' ? 'treatmentHistory' : 'doctorNotes'}`);
  return <form className={`panel clinical-note-form ${compact ? 'compact' : ''}`} onSubmit={submit}><div className="panel-heading"><div><h2>{title}</h2><p>{recordType === 'assessment' ? t('clinical.assessmentSavedSeparate') : t('clinical.entryAttributed')}</p></div></div><label>{t('clinical.notes')}<textarea value={notes} onChange={e => setNotes(e.target.value)} required maxLength={5000} placeholder={t(`clinical.${placeholderKey}`)}/></label>{error && <small className="form-error">{error}</small>}{saved && <small className="clinical-saved">{saved}</small>}<button className="date-chip" disabled={busy || !notes.trim()}>{busy ? t('clinical.saving') : t('clinical.saveRecord', { type: translatedType })}</button></form>;
}

function PrescriptionPanel({ patientKey, items, onRefresh }) {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget); try { await createClinicalPrescription(patientKey, { medication: form.get('medication'), instructions: form.get('instructions'), startDate: form.get('startDate') || undefined, endDate: form.get('endDate') || undefined }); event.currentTarget.reset(); await onRefresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function update(item, status) { setError(''); try { await updateClinicalPrescription(item._id, { status }); await onRefresh(); } catch (e) { setError(e.message); } }
  return <section className="panel clinical-section"><div className="panel-heading"><div><h2>{t('clinical.prescriptionsTitle')}</h2><p>{t('clinical.prescriptionsDescription')}</p></div></div><form className="clinical-form-grid" onSubmit={submit}><label>{t('clinical.medication')}<input name="medication" required maxLength="160"/></label><label>{t('clinical.instructions')}<input name="instructions" required maxLength="1000"/></label><label>{t('clinical.startDate')}<input name="startDate" type="date"/></label><label>{t('clinical.endDate')}<input name="endDate" type="date"/></label><button className="auth-submit" disabled={busy}>{busy ? t('common.saving') : t('clinical.addPrescription')}</button></form>{error && <small className="form-error">{error}</small>}<div className="clinical-record-list">{items.map(item => <article key={item._id}><span className={`status-tag ${statusClass(item.status)}`}>{t(`clinical.medicationStatuses.${item.status}`, { defaultValue: item.status })}</span><div><b>{item.medication}</b><p>{item.instructions}</p><small>{item.prescribedBy?.name || t('clinical.doctor')} · {item.startDate ? formatClinicalDate(item.startDate, i18n.resolvedLanguage, true) : t('clinical.noStartDate')}{item.endDate ? ` — ${formatClinicalDate(item.endDate, i18n.resolvedLanguage, true)}` : ''}</small></div>{item.status === 'Active' && <select aria-label={t('clinical.updateMedicationStatus', { medication: item.medication })} defaultValue="Active" onChange={e => update(item, e.target.value)}><option value="Active">{t('clinical.medicationStatuses.Active')}</option><option value="Stopped">{t('clinical.medicationStatuses.Stopped')}</option><option value="Completed">{t('clinical.medicationStatuses.Completed')}</option></select>}</article>)}</div>{!items.length && <div className="empty-state"><b>{t('clinical.noPrescriptions')}</b></div>}</section>;
}

function FollowupPanel({ patientKey, hospitals, appointments, onRefresh }) {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget); try { await scheduleClinicalFollowup(patientKey, { scheduledAt: new Date(form.get('scheduledAt')).toISOString(), type: form.get('type'), hospital: form.get('hospital') || undefined, notes: form.get('notes') }); event.currentTarget.reset(); await onRefresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <section className="panel clinical-section"><div className="panel-heading"><div><h2>{t('clinical.scheduleFollowup')}</h2><p>{t('clinical.followupDescription')}</p></div></div><form className="clinical-form-grid" onSubmit={submit}><label>{t('clinical.dateTime')}<input name="scheduledAt" type="datetime-local" required/></label><label>{t('clinical.visitType')}<input name="type" defaultValue={t('clinical.defaultFollowupType')} maxLength="100"/></label><label>{t('clinical.facility')}<select name="hospital"><option value="">{t('clinical.noFacilitySelected')}</option>{hospitals.map(h => <option key={h._id} value={h._id}>{h.name} · {h.village}</option>)}</select></label><label>{t('clinical.recommendation')}<input name="notes" maxLength="1500" placeholder={t('clinical.returnInstructionsPlaceholder')}/></label><button className="auth-submit" disabled={busy}>{busy ? t('clinical.scheduling') : t('clinical.scheduleFollowup')}</button></form>{error && <small className="form-error">{error}</small>}<div className="clinical-record-list">{appointments.map(item => <article key={item._id}><span className={`status-tag ${statusClass(item.status)}`}>{t(`statuses.${item.status}`, { defaultValue: item.status })}</span><div><b>{item.type}</b><p>{formatClinicalDate(item.scheduledAt, i18n.resolvedLanguage)} · {item.hospital?.name || t('clinical.noFacility')}{item.notes ? ` · ${item.notes}` : ''}</p></div></article>)}</div></section>;
}

function ReferralPanel({ patientKey, hospitals, referrals, onRefresh }) {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget); try { await createClinicalReferral(patientKey, { hospital: form.get('hospital'), reason: form.get('reason') }); event.currentTarget.reset(); await onRefresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <section className="panel clinical-section"><div className="panel-heading"><div><h2>{t('clinical.referralTitle')}</h2><p>{t('clinical.referralDescription')}</p></div></div><form className="clinical-form-grid" onSubmit={submit}><label>{t('clinical.referralFacility')}<select name="hospital" required><option value="">{t('clinical.selectFacility')}</option>{hospitals.map(h => <option key={h._id} value={h._id}>{h.name} · {h.village}</option>)}</select></label><label>{t('clinical.clinicalReason')}<textarea name="reason" required maxLength="1500" placeholder={t('clinical.reasonPlaceholder')}></textarea></label><button className="auth-submit" disabled={busy}>{busy ? t('common.saving') : t('clinical.recommendReferral')}</button></form>{error && <small className="form-error">{error}</small>}<div className="clinical-record-list">{referrals.map(item => <article key={item._id}><span className={`status-tag ${statusClass(item.status)}`}>{t(`statuses.${item.status}`, { defaultValue: item.status })}</span><div><b>{item.hospital?.name || t('clinical.referralFacility')}</b><p>{item.reason}</p><small>{formatClinicalDate(item.referredAt, i18n.resolvedLanguage)}</small></div></article>)}</div></section>;
}

function LabReportPanel({ patientKey, documents, onRefresh }) {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [downloadUrl, setDownloadUrl] = useState('');
  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget); const body = new FormData(); body.append('title', form.get('title')); body.append('report', form.get('report')); try { await uploadClinicalLabReport(patientKey, body); event.currentTarget.reset(); await onRefresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function download(id) { setError(''); try { const blob = await downloadClinicalDocument(id); const url = URL.createObjectURL(blob); setDownloadUrl(current => { if (current) URL.revokeObjectURL(current); return url; }); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'lab-report'; anchor.click(); } catch (e) { setError(e.message); } }
  return <section className="panel clinical-section"><div className="panel-heading"><div><h2>{t('clinical.labReports')}</h2><p>{t('clinical.labDescription')}</p></div></div><form className="clinical-form-grid" onSubmit={submit}><label>{t('clinical.reportTitle')}<input name="title" placeholder={t('clinical.reportPlaceholder')} maxLength="160"/></label><label>{t('clinical.reportFile')}<input name="report" type="file" required accept="application/pdf,image/jpeg,image/png"/></label><button className="auth-submit" disabled={busy}>{busy ? t('clinical.encryptingSaving') : t('clinical.uploadLabReport')}</button></form>{error && <small className="form-error">{error}</small>}<div className="clinical-record-list">{documents.map(item => <article key={item._id}><span className="clinical-record-type">LAB</span><div><b>{item.title}</b><p>{t('clinical.kilobytes', { count: (item.byteLength / 1024).toFixed(0) })} · {formatClinicalDate(item.recordedAt, i18n.resolvedLanguage)}</p><small>{t('clinical.uploadedBy', { name: item.uploadedBy?.name || t('clinical.doctor') })}</small></div><button className="text-link" onClick={() => download(item._id)}>{t('clinical.download')}</button></article>)}</div>{!documents.length && <div className="empty-state"><b>{t('clinical.noLabReports')}</b></div>}</section>;
}
