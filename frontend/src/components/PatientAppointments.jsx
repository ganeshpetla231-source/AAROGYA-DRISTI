import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import {
  bookClinicAppointment, getTelemedicineAppointments, getVerifiedProviders,
  updateTelemedicineAppointment
} from '../services/api.js';
import './telemedicine.css';

function localDateTime(value) {
  const date = new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateLabel(value, locale) {
  return new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function isVideoAppointment(appointment) {
  return appointment.visitMode === 'Video' ||
    (!appointment.visitMode && String(appointment.type || '').toLowerCase().includes('telemedicine'));
}

export function PatientAppointments() {
  const { t, i18n } = useTranslation();
  const [appointments, setAppointments] = useState([]);
  const [providers, setProviders] = useState([]);
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [reason, setReason] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [consentGranted, setConsentGranted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [appointmentResult, providerResult] = await Promise.allSettled([
      getTelemedicineAppointments(),
      getVerifiedProviders()
    ]);
    if (appointmentResult.status === 'fulfilled') setAppointments(appointmentResult.value.items || []);
    else setError(appointmentResult.reason.message);
    if (providerResult.status === 'fulfilled') setProviders(providerResult.value.items || []);
    else setError(current => current || providerResult.reason.message);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const departments = useMemo(() => [...new Set(
    providers.map(provider => (provider.profile?.department || provider.profile?.specialization)?.trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b)), [providers]);
  const matchingDoctors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return providers.filter(provider => {
      const profile = provider.profile || {};
      const matchesDepartment = !department || (profile.department || profile.specialization) === department;
      const searchable = [
        provider.name,
        profile.department,
        profile.specialization,
        ...(profile.expertise || []),
        ...(profile.qualifications || []),
        provider.hospital?.name
      ].filter(Boolean).join(' ').toLowerCase();
      return matchesDepartment && (!query || searchable.includes(query));
    });
  }, [department, providers, search]);

  const clinicAppointments = appointments.filter(item => !isVideoAppointment(item));
  const upcoming = clinicAppointments
    .filter(item => ['Upcoming', 'Confirmed'].includes(item.status) && new Date(item.scheduledAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const past = clinicAppointments
    .filter(item => ['Completed', 'Cancelled', 'Declined'].includes(item.status) || new Date(item.scheduledAt).getTime() < Date.now())
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

  function openBooking(doctor) {
    setSelectedDoctor(doctor);
    setScheduledAt(localDateTime(Date.now() + 24 * 60 * 60 * 1000));
    setReason('');
    setSymptoms('');
    setConsentGranted(false);
    setError('');
    setSuccess('');
  }

  async function submitBooking(event) {
    event.preventDefault();
    if (!selectedDoctor) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await bookClinicAppointment({
        doctorId: selectedDoctor.id,
        scheduledAt: new Date(scheduledAt).toISOString(),
        consultationReason: reason,
        symptoms,
        consentGranted
      });
      setSelectedDoctor(null);
      setSuccess(t('clinicAppointments.requestSent'));
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(appointment) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await updateTelemedicineAppointment(appointment._id, 'cancel');
      setSuccess(t('clinicAppointments.cancelled'));
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="telemedicine-workspace clinic-appointments-workspace">
    <div className="telemedicine-banner"><span>▦</span><div><b>{t('clinicAppointments.title')}</b><small>{t('clinicAppointments.description')}</small></div></div>
    {error && <div className="api-alert" role="alert">{error}<button type="button" onClick={load}>{t('telemedicine.retry')}</button></div>}
    {success && <div className="api-success" role="status">{success}<button type="button" onClick={() => setSuccess('')}>×</button></div>}

    <section className="panel available-slots clinic-doctor-directory">
      <div className="panel-heading"><div><h2>{t('clinicAppointments.findDoctor')}</h2><p>{t('clinicAppointments.verifiedOnly')}</p></div><button className="text-link" type="button" onClick={load}>↻ {t('telemedicine.refresh')}</button></div>
      <div className="clinic-doctor-filters">
        <label>{t('clinicAppointments.department')}<select value={department} onChange={event => setDepartment(event.target.value)}><option value="">{t('clinicAppointments.allDepartments')}</option>{departments.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="telemedicine-doctor-search">{t('clinicAppointments.searchDoctors')}<span className="telemedicine-doctor-search-control"><Search className="telemedicine-doctor-search-icon" size={19} aria-hidden="true"/><input type="search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} placeholder={t('clinicAppointments.searchPlaceholder')}/></span></label>
      </div>
      {loading ? <div className="loading-state"><span className="spinner"/>{t('telemedicine.loadingAppointments')}</div>
        : matchingDoctors.length ? <div className="available-slot-grid">{matchingDoctors.map(doctor => <article key={doctor.id}>
          <span className="video-slot-icon">⚕</span>
          <b>{doctor.name}</b>
          <small>{doctor.profile?.department || doctor.profile?.specialization || t('clinicAppointments.generalDepartment')}</small>
          {doctor.profile?.specialization && doctor.profile.specialization !== doctor.profile.department && <small>{doctor.profile.specialization}</small>}
          <small>{doctor.hospital?.name || t('clinicAppointments.hospitalNotListed')}</small>
          {(doctor.profile?.qualifications || []).length > 0 && <small>{doctor.profile.qualifications.join(', ')}</small>}
          <button className="auth-submit" type="button" disabled={busy} onClick={() => openBooking(doctor)}>{t('clinicAppointments.requestAppointment')} →</button>
        </article>)}</div>
          : <div className="empty-state"><b>{t(providers.length ? 'clinicAppointments.noMatchingDoctors' : 'clinicAppointments.noVerifiedDoctors')}</b><p>{t('clinicAppointments.tryAnotherDepartment')}</p></div>}
    </section>

    <section className="telemedicine-appointments">
      <div className="panel-heading"><div><h2>{t('clinicAppointments.upcoming')}</h2><p>{t('clinicAppointments.requestedCount', { count: upcoming.length })}</p></div><button className="text-link" type="button" onClick={load}>↻ {t('telemedicine.refresh')}</button></div>
      {loading ? <div className="loading-state"><span className="spinner"/>{t('telemedicine.loadingAppointments')}</div>
        : upcoming.length ? upcoming.map(appointment => <article className="panel telemedicine-appointment" key={appointment._id}>
          <div className="telemedicine-appointment-head"><span className="video-slot-icon">▦</span><div><b>{appointment.provider?.name || t('telemedicine.doctor')}</b><small>{appointment.provider?.doctorProfile?.specialization || t('clinicAppointments.generalDepartment')}</small><small>{dateLabel(appointment.scheduledAt, locale)} · {t('clinicAppointments.inPerson')}</small></div><span className={`status-tag ${appointment.status.toLowerCase()}`}>{t(`statuses.${appointment.status}`, { defaultValue: appointment.status })}</span></div>
          {appointment.consultationReason && <div className="telemedicine-booking-summary"><p><b>{t('telemedicine.consultationReason')}:</b> {appointment.consultationReason}</p></div>}
          <div className="clinic-appointment-note">{t(appointment.status === 'Confirmed' ? 'clinicAppointments.confirmedNote' : 'clinicAppointments.pendingNote')}</div>
          {['Upcoming', 'Confirmed'].includes(appointment.status) && <div className="telemedicine-actions"><button className="clinical-secondary" type="button" disabled={busy} onClick={() => cancel(appointment)}>{t('telemedicine.cancel')}</button></div>}
        </article>)
          : <div className="panel empty-state"><b>{t('clinicAppointments.noUpcoming')}</b><p>{t('clinicAppointments.noUpcomingHelp')}</p></div>}
    </section>

    <section className="telemedicine-appointments past-appointments">
      <div className="panel-heading"><div><h2>{t('clinicAppointments.past')}</h2></div></div>
      {past.length ? past.map(appointment => <article className="panel past-appointment" key={appointment._id}><div><b>{appointment.provider?.name || t('telemedicine.doctor')}</b><small>{dateLabel(appointment.scheduledAt, locale)} · {t('clinicAppointments.inPerson')}</small></div><span className={`status-tag ${appointment.status.toLowerCase()}`}>{t(`statuses.${appointment.status}`, { defaultValue: appointment.status })}</span></article>) : <div className="panel empty-state"><b>{t('clinicAppointments.noPast')}</b></div>}
    </section>

    {selectedDoctor && <div className="telemedicine-consent-backdrop" role="presentation"><section className="panel telemedicine-consent-dialog clinic-booking-dialog" role="dialog" aria-modal="true" aria-labelledby="clinic-booking-title">
      <button type="button" className="text-link telemedicine-dialog-close" onClick={() => setSelectedDoctor(null)} aria-label={t('telemedicine.close')}>×</button>
      <h2 id="clinic-booking-title">{t('clinicAppointments.requestTitle')}</h2>
      <p>{selectedDoctor.name} · {selectedDoctor.profile?.department || selectedDoctor.profile?.specialization || t('clinicAppointments.generalDepartment')}{selectedDoctor.profile?.specialization && selectedDoctor.profile.specialization !== selectedDoctor.profile.department ? ` · ${selectedDoctor.profile.specialization}` : ''}</p>
      <form onSubmit={submitBooking}>
        <label>{t('clinicAppointments.preferredDateTime')}<input type="datetime-local" required min={localDateTime(Date.now())} max={localDateTime(Date.now() + 90 * 24 * 60 * 60 * 1000)} value={scheduledAt} onChange={event => setScheduledAt(event.target.value)}/></label>
        <label>{t('telemedicine.consultationReason')}<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/></label>
        <label>{t('telemedicine.reportedSymptoms')}<textarea maxLength={1500} value={symptoms} onChange={event => setSymptoms(event.target.value)}/></label>
        <label className="telemedicine-consent-check"><input type="checkbox" required checked={consentGranted} onChange={event => setConsentGranted(event.target.checked)}/><span>{t('clinicAppointments.bookingConsent')}</span></label>
        <p className="clinic-appointment-note">{t('clinicAppointments.confirmationNote')}</p>
        <button className="auth-submit" disabled={busy}>{busy ? t('clinicAppointments.sending') : t('clinicAppointments.sendRequest')}</button>
      </form>
    </section></div>}
  </div>;
}
