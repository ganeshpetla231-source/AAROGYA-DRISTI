import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext.jsx';
import { TelemedicineCall as VideoRoom } from './TelemedicineCall.jsx';
import './telemedicine.css';
import {
  bookTelemedicineAppointment, createDoctorAvailability, deleteDoctorAvailability, getAccessToken,
  getDoctorAvailability, getRealtimeOrigin, getTelemedicineAppointments, recordTelemedicineConsent,
  saveConsultationNotes, scheduleClinicalFollowup, updateTelemedicineAppointment
} from '../services/api.js';

function dateTimeLocalMin(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function TelemedicineWorkspace({ language = 'en', mode = 'all' }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const doctor = auth.user.role === 'doctor';
  const [appointments, setAppointments] = useState([]), [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const [startAt, setStartAt] = useState(''), [endAt, setEndAt] = useState(''), [slotMinutes, setSlotMinutes] = useState(30);
  const [notes, setNotes] = useState({}), [followups, setFollowups] = useState({}), [roomAppointment, setRoomAppointment] = useState(null);
  const [doctorSearch, setDoctorSearch] = useState(''), [bookingSlot, setBookingSlot] = useState(null);
  const [bookingDetails, setBookingDetails] = useState({ consultationReason: '', symptoms: '', consentGranted: false });
  const [consentBusy, setConsentBusy] = useState(false), [callConsented, setCallConsented] = useState(false);
  const minStartAt = dateTimeLocalMin(new Date());
  const dateLabel = value => new Date(value).toLocaleString(language === 'te' ? 'te-IN' : language === 'hi' ? 'hi-IN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const isVideoVisit = appointment => appointment.visitMode === 'Video' ||
    (!appointment.visitMode && String(appointment.type || '').toLowerCase().includes('telemedicine'));
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [appointmentResult, availabilityResult] = await Promise.all([getTelemedicineAppointments(), getDoctorAvailability()]);
      setAppointments(appointmentResult.items || []);
      setAvailability((availabilityResult.items || []).filter(slot => !doctor || String(slot.doctor?._id) === String(auth.user.id)));
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [auth.user.id, doctor]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const socket = io(getRealtimeOrigin(), { path: '/socket.io', auth: { token: getAccessToken() }, transports: ['websocket', 'polling'] });
    socket.on('notification:new', item => {
      if (item.metadata?.appointmentId) load();
    });
    return () => socket.disconnect();
  }, [load]);
  const visibleAppointments = mode === 'video' && !doctor ? appointments.filter(isVideoVisit) : appointments;
  const upcoming = useMemo(() => visibleAppointments.filter(item => ['Upcoming', 'Confirmed'].includes(item.status)).sort((a,b) => new Date(a.scheduledAt)-new Date(b.scheduledAt)), [visibleAppointments]);
  const past = useMemo(() => visibleAppointments.filter(item => ['Completed', 'Cancelled', 'Declined'].includes(item.status)).sort((a,b) => new Date(b.scheduledAt)-new Date(a.scheduledAt)), [visibleAppointments]);

  async function act(fn, successText) { setBusy(true); setError(''); setSuccess(''); try { await fn(); setSuccess(successText); await load(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  async function publishAvailability(event) {
    event.preventDefault();
    const starts = new Date(startAt), ends = new Date(endAt);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
      setError(t('telemedicine.invalidAvailabilityDates'));
      return;
    }
    if (starts.getTime() <= Date.now()) {
      setError(t('telemedicine.availabilityStartFuture'));
      return;
    }
    if (ends <= starts) {
      setError(t('telemedicine.availabilityEndAfterStart'));
      return;
    }
    const duration = ends.getTime() - starts.getTime();
    if (duration > 12 * 60 * 60 * 1000) {
      setError(t('telemedicine.availabilityMax12Hours'));
      return;
    }
    if (duration < Number(slotMinutes) * 60 * 1000) {
      setError(t('telemedicine.availabilityMinimumSlot', { count: slotMinutes }));
      return;
    }
    await act(async () => { await createDoctorAvailability({ startsAt: new Date(startAt).toISOString(), endsAt: new Date(endAt).toISOString(), slotMinutes: Number(slotMinutes) }); setStartAt(''); setEndAt(''); }, t('telemedicine.savedAvailability'));
  }
  async function book(event) {
    event.preventDefault();
    if (!bookingSlot) return;
    await act(async () => {
      await bookTelemedicineAppointment(bookingSlot._id, bookingDetails);
      setBookingSlot(null);
      setBookingDetails({ consultationReason: '', symptoms: '', consentGranted: false });
    }, t('telemedicine.booked'));
  }
  async function joinAfterConsent(event) {
    event.preventDefault();
    if (!roomAppointment) return;
    setConsentBusy(true);
    setError('');
    try {
      await recordTelemedicineConsent(roomAppointment._id);
      setCallConsented(true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setConsentBusy(false);
    }
  }
  async function reschedule(appointment) {
    const availabilityId = followups[`reschedule-${appointment._id}`];
    if (!availabilityId) { setError(t('telemedicine.chooseSlot')); return; }
    await act(() => updateTelemedicineAppointment(appointment._id, 'reschedule', { availabilityId }), t('telemedicine.reschedule'));
  }
  async function saveNotes(appointment) { await act(() => saveConsultationNotes(appointment._id, notes[appointment._id] ?? ''), t('telemedicine.saveNotes')); }
  async function saveFollowup(event, appointment) {
    event.preventDefault(); const scheduledAt = followups[`followup-${appointment._id}`];
    await act(() => scheduleClinicalFollowup(appointment.patient?._id || appointment.patient, { scheduledAt: new Date(scheduledAt).toISOString(), notes: t('telemedicine.followupNote'), type: t('telemedicine.videoFollowup') }), t('telemedicine.followup'));
  }
  const patientName = appointment => appointment.patient?.name || t('telemedicine.patient');
  const doctorName = appointment => appointment.provider?.name || t('telemedicine.doctor');
  const visibleSlots = availability.filter(slot => {
    if (doctor) return String(slot.doctor?._id) === String(auth.user.id);
    const profile = slot.doctor?.doctorProfile || {};
    return `${slot.doctor?.name || ''} ${profile.department || ''} ${profile.specialization || ''} ${(profile.qualifications || []).join(' ')}`.toLowerCase().includes(doctorSearch.trim().toLowerCase());
  });

  return <div className="telemedicine-workspace">
    <div className="telemedicine-banner"><span>▣</span><div><b>{t('telemedicine.title')}</b><small>{t('telemedicine.description')}</small></div><span className="language-support">{t('telemedicine.languageSupport')}</span></div>
    {error && <div className="api-alert" role="alert">{error}<button onClick={load}>{t('telemedicine.retry')}</button></div>}{success && <div className="api-success" role="status">{success}<button onClick={() => setSuccess('')}>×</button></div>}
    {doctor && <section className="panel telemedicine-availability"><div className="panel-heading"><div><h2>{t('telemedicine.myAvailability')}</h2><p>{t('telemedicine.addSlots')}</p></div><span className="db-pill">{t('roles.doctor').toUpperCase()}</span></div><form onSubmit={publishAvailability} className="availability-form">
      <label>{t('telemedicine.start')}<input type="datetime-local" required min={minStartAt} value={startAt} onChange={event => setStartAt(event.target.value)}/></label>
      <label>{t('telemedicine.end')}<input type="datetime-local" required min={startAt || minStartAt} value={endAt} onChange={event => setEndAt(event.target.value)}/></label>
      <label>{t('telemedicine.minutesSlot')}<select value={slotMinutes} onChange={event => setSlotMinutes(event.target.value)}>{[15, 30, 45, 60].map(minutes => <option key={minutes} value={minutes}>{t('telemedicine.minutes', { count: minutes })}</option>)}</select></label>
      <button className="auth-submit" disabled={busy}>{t('telemedicine.publishSlots')} →</button>
    </form>
      <div className="availability-list">{availability.filter(slot => String(slot.doctor?._id) === String(auth.user.id)).map(slot => <div key={slot._id}><span><b>{dateLabel(slot.startsAt)}</b><small>{t('telemedicine.minutes', { count: slot.slotMinutes })} · {t(`statuses.${slot.status}`, { defaultValue: slot.status })}</small></span>{slot.status === 'Open' && <button onClick={() => act(() => deleteDoctorAvailability(slot._id), t('telemedicine.savedAvailabilityRemoved'))}>{t('telemedicine.remove')}</button>}</div>)}{!availability.length && <p className="telemedicine-empty">{t('telemedicine.noSlots')}</p>}</div></section>}
    {!doctor && <section className="panel available-slots"><div className="panel-heading"><div><h2>{t('telemedicine.bookTitle')}</h2><p>{t('telemedicine.chooseTime')}</p></div><button className="text-link" onClick={load}>↻ {t('telemedicine.refreshTimes')}</button></div><label className="telemedicine-doctor-search">{t('telemedicine.searchDoctor')}<span className="telemedicine-doctor-search-control"><Search className="telemedicine-doctor-search-icon" size={19} aria-hidden="true"/><input type="search" value={doctorSearch} maxLength={100} onChange={event => setDoctorSearch(event.target.value)} placeholder={t('telemedicine.searchDoctorPlaceholder')} aria-label={t('telemedicine.searchDoctorPlaceholder')}/></span></label>{loading ? <div className="loading-state"><span className="spinner"/>{t('telemedicine.loadingTimes')}</div> : visibleSlots.length ? <div className="available-slot-grid">{visibleSlots.map(slot => <article key={slot._id}><span className="video-slot-icon">▣</span><b>{slot.doctor?.name || t('telemedicine.doctor')}</b><small>{slot.doctor?.doctorProfile?.department || slot.doctor?.doctorProfile?.specialization || t('telemedicine.generalDoctor')}</small>{slot.doctor?.doctorProfile?.specialization && slot.doctor.doctorProfile.specialization !== slot.doctor.doctorProfile.department && <small>{slot.doctor.doctorProfile.specialization}</small>}<small>{(slot.doctor?.doctorProfile?.qualifications || []).join(', ') || t('telemedicine.qualificationUnavailable')}</small>{slot.doctor?.doctorProfile?.yearsExperience != null && <small>{t('telemedicine.experienceYears', { count: slot.doctor.doctorProfile.yearsExperience })}</small>}<small>{dateLabel(slot.startsAt)}</small><small>{t('telemedicine.videoVisitMinutes', { count: slot.slotMinutes })}</small><button className="auth-submit" disabled={busy} onClick={() => { setBookingSlot(slot); setError(''); }}>{t('telemedicine.book')} →</button></article>)}</div> : <div className="empty-state"><b>{t(availability.length ? 'telemedicine.noDoctorMatches' : 'telemedicine.noVideoSlots')}</b><p>{t('telemedicine.tryLater')}</p></div>}</section>}
    <section className="telemedicine-appointments"><div className="panel-heading"><div><h2>{t('telemedicine.upcoming')}</h2><p>{t('telemedicine.scheduled', { count: upcoming.length })}</p></div><button className="text-link" onClick={load}>↻ {t('telemedicine.refresh')}</button></div>{loading ? <div className="loading-state"><span className="spinner"/>{t('telemedicine.loadingAppointments')}</div> : upcoming.length ? upcoming.map(appointment => <article className="panel telemedicine-appointment" key={appointment._id}><div className="telemedicine-appointment-head"><span className="video-slot-icon">▣</span><div><b>{doctor ? patientName(appointment) : doctorName(appointment)}</b><small>{dateLabel(appointment.scheduledAt)} · {appointment.visitMode || t(isVideoVisit(appointment) ? 'telemedicine.video' : 'telemedicine.clinic')}</small><small className="telemedicine-patient-id">{t('telemedicine.patientId')}: {appointment.patient?.patientId || '—'}</small></div><span className={`status-tag ${appointment.status.toLowerCase()}`}>{t(`statuses.${appointment.status}`, { defaultValue: appointment.status })}</span></div>{doctor && (appointment.consultationReason || appointment.symptoms) && <div className="telemedicine-booking-summary">{appointment.consultationReason && <p><b>{t('telemedicine.consultationReason')}:</b> {appointment.consultationReason}</p>}{appointment.symptoms && <p><b>{t('telemedicine.reportedSymptoms')}:</b> {appointment.symptoms}</p>}</div>}<div className="telemedicine-actions">
      {doctor && appointment.status === 'Upcoming' && <><button className="clinical-secondary" disabled={busy} onClick={() => act(() => updateTelemedicineAppointment(appointment._id, 'confirm'), t('telemedicine.confirmed'))}>{t('telemedicine.accept')}</button><button className="clinical-secondary" disabled={busy} onClick={() => act(() => updateTelemedicineAppointment(appointment._id, 'decline'), t('telemedicine.declined'))}>{t('telemedicine.decline')}</button></>}
      {isVideoVisit(appointment) ? appointment.status === 'Confirmed' ? <button className="telemedicine-join" disabled={busy} onClick={() => setRoomAppointment(appointment)}>{t('telemedicine.join')} ↗</button> : <span className="clinic-visit-label">{t('telemedicine.awaitingConfirmation')}</span> : <span className="clinic-visit-label">{t('telemedicine.clinicNoVideo')}</span>}
      <button className="clinical-secondary" disabled={busy} onClick={() => act(() => updateTelemedicineAppointment(appointment._id, 'cancel'), t('telemedicine.cancelled'))}>{t('telemedicine.cancel')}</button>
      {isVideoVisit(appointment) && <><select aria-label={t('telemedicine.chooseRescheduleSlot')} value={followups[`reschedule-${appointment._id}`] || ''} onChange={event => setFollowups(previous => ({ ...previous, [`reschedule-${appointment._id}`]: event.target.value }))}><option value="">{t('telemedicine.rescheduleTime')}</option>{availability.filter(slot => String(slot.doctor?._id) === String(appointment.provider?._id)).map(slot => <option key={slot._id} value={slot._id}>{dateLabel(slot.startsAt)}</option>)}</select><button className="clinical-secondary" disabled={busy} onClick={() => reschedule(appointment)}>{t('telemedicine.rescheduleButton')}</button></>}
    </div>{doctor && <div className="telemedicine-doctor-tools">{isVideoVisit(appointment) && appointment.status === 'Confirmed' && <><label>{t('telemedicine.consultationNotes')}<textarea value={notes[appointment._id] ?? ''} maxLength={5000} onChange={event => setNotes(previous => ({ ...previous, [appointment._id]: event.target.value }))} placeholder={t('telemedicine.doctorOnlyNotes')}/></label><button className="clinical-secondary" disabled={busy} onClick={() => saveNotes(appointment)}>{t('telemedicine.saveNotesButton')}</button></>}<form onSubmit={event => saveFollowup(event, appointment)}><label>{t('telemedicine.followupDateTime')}<input type="datetime-local" required value={followups[`followup-${appointment._id}`] || ''} onChange={event => setFollowups(previous => ({ ...previous, [`followup-${appointment._id}`]: event.target.value }))}/></label><button className="clinical-secondary" disabled={busy}>{t('telemedicine.scheduleFollowup')}</button></form></div>}</article>) : <div className="panel empty-state"><b>{t('telemedicine.noUpcoming')}</b><p>{t(doctor ? 'telemedicine.newBookings' : 'telemedicine.bookSlotStart')}</p></div>}</section>
    <section className="telemedicine-appointments past-appointments"><div className="panel-heading"><div><h2>{t('telemedicine.pastConsultations')}</h2><p>{t('telemedicine.pastStatusSummary')}</p></div></div>{past.length ? past.map(appointment => <article className="panel past-appointment" key={appointment._id}><div><b>{doctor ? patientName(appointment) : doctorName(appointment)}</b><small>{dateLabel(appointment.scheduledAt)}</small><small className="telemedicine-patient-id">{t('telemedicine.patientId')}: {appointment.patient?.patientId || '—'}</small></div><span className={`status-tag ${appointment.status.toLowerCase()}`}>{t(`statuses.${appointment.status}`, { defaultValue: appointment.status })}</span>{doctor && isVideoVisit(appointment) && <button className="clinical-secondary" onClick={() => setRoomAppointment(appointment)}>{t('telemedicine.viewNotesChat')}</button>}</article>) : <div className="panel empty-state"><b>{t('telemedicine.noPast')}</b></div>}</section>
    {bookingSlot && <div className="telemedicine-consent-backdrop" role="presentation"><section className="panel telemedicine-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="telemedicine-booking-title"><button type="button" className="text-link telemedicine-dialog-close" onClick={() => setBookingSlot(null)} aria-label={t('telemedicine.close')}>×</button><h2 id="telemedicine-booking-title">{t('telemedicine.bookingDetails')}</h2><p>{bookingSlot.doctor?.name} · {dateLabel(bookingSlot.startsAt)}</p><form onSubmit={book}><label>{t('telemedicine.consultationReason')}<textarea required maxLength={1000} value={bookingDetails.consultationReason} onChange={event => setBookingDetails(value => ({ ...value, consultationReason: event.target.value }))}/></label><label>{t('telemedicine.reportedSymptoms')}<textarea maxLength={1500} value={bookingDetails.symptoms} onChange={event => setBookingDetails(value => ({ ...value, symptoms: event.target.value }))}/></label><label className="telemedicine-consent-check"><input type="checkbox" required checked={bookingDetails.consentGranted} onChange={event => setBookingDetails(value => ({ ...value, consentGranted: event.target.checked }))}/><span>{t('telemedicine.bookingConsent')}</span></label><button className="auth-submit" disabled={busy}>{t('telemedicine.confirmBooking')}</button></form></section></div>}
    {roomAppointment && !callConsented && <div className="telemedicine-consent-backdrop" role="presentation"><section className="panel telemedicine-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="telemedicine-call-consent-title"><button type="button" className="text-link telemedicine-dialog-close" onClick={() => { setRoomAppointment(null); setCallConsented(false); }} aria-label={t('telemedicine.close')}>×</button><h2 id="telemedicine-call-consent-title">{t('telemedicine.callConsentTitle')}</h2><p>{t('telemedicine.callConsentText')}</p>{error && <p className="form-error" role="alert">{error}</p>}<form onSubmit={joinAfterConsent}><label className="telemedicine-consent-check"><input type="checkbox" required/><span>{t('telemedicine.callConsentCheck')}</span></label><button className="auth-submit" disabled={consentBusy}>{consentBusy ? t('telemedicine.savingConsent') : t('telemedicine.joinNow')}</button></form></section></div>}
    {roomAppointment && callConsented && <VideoRoom appointment={roomAppointment} doctor={doctor} onClose={() => { setRoomAppointment(null); setCallConsented(false); load(); }}/ >}
  </div>;
}
