import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAdminTelemedicineOverview } from '../services/api.js';

export function TelemedicineAdminOverview({ onManageDoctors }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dateLocale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getAdminTelemedicineOverview());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return <section className="telemedicine-admin">
    <header className="panel-heading">
      <div><h2>{t('telemedicine.adminTitle')}</h2><p>{t('telemedicine.adminPrivacy')}</p></div>
      <button className="text-link" onClick={load}>{t('telemedicine.refresh')}</button>
    </header>
    {error && <div className="api-alert" role="alert">{error}<button onClick={load}>{t('telemedicine.retry')}</button></div>}
    {loading ? <div className="loading-state"><span className="spinner"/>{t('telemedicine.loadingAppointments')}</div> : data && <>
      <div className="telemedicine-admin-stats">
        {[
          ['totalVideoAppointments', data.summary.totalVideoAppointments],
          ['pending', data.summary.pendingAppointments],
          ['confirmed', data.summary.confirmedAppointments],
          ['completed', data.summary.completedAppointments],
          ['activeCalls', data.summary.activeConsultations],
          ['openSlots', data.summary.openSlots]
        ].map(([label, value]) => <article className="panel" key={label}><small>{t(`telemedicine.adminStats.${label}`)}</small><b>{value}</b></article>)}
      </div>
      <div className="telemedicine-admin-section panel">
        <div className="panel-heading"><div><h3>{t('telemedicine.adminDoctors')}</h3><p>{t('telemedicine.adminDoctorHelp')}</p></div><button className="clinical-secondary" onClick={onManageDoctors}>{t('telemedicine.manageVerification')}</button></div>
        <div className="telemedicine-admin-table-wrap"><table className="telemedicine-admin-table">
          <thead><tr><th>{t('telemedicine.doctor')}</th><th>{t('telemedicine.specialization')}</th><th>{t('telemedicine.qualifications')}</th><th>{t('telemedicine.doctorAccount')}</th></tr></thead>
          <tbody>{data.doctors.map(doctor => <tr key={doctor.id}><td>{doctor.name}</td><td>{[doctor.department, doctor.specialization].filter(Boolean).join(' · ') || '—'}</td><td>{doctor.qualifications.join(', ') || '—'}</td><td>{doctor.approvalStatus} · {doctor.isActive ? t('telemedicine.active') : t('telemedicine.inactive')} · {doctor.profileVerified ? t('telemedicine.verified') : t('telemedicine.unverified')}</td></tr>)}</tbody>
        </table></div>
      </div>
      <div className="telemedicine-admin-section panel">
        <div className="panel-heading"><div><h3>{t('telemedicine.adminAppointments')}</h3><p>{t('telemedicine.adminAppointmentHelp')}</p></div></div>
        <div className="telemedicine-admin-table-wrap"><table className="telemedicine-admin-table">
          <thead><tr><th>{t('telemedicine.patient')}</th><th>{t('telemedicine.doctor')}</th><th>{t('telemedicine.date')}</th><th>{t('telemedicine.appointmentStatus')}</th><th>{t('telemedicine.consultationStatus')}</th></tr></thead>
          <tbody>{data.appointments.map(item => <tr key={item.id}><td>{item.patient?.name || '—'}{item.patient?.patientId ? ` · ${item.patient.patientId}` : ''}</td><td>{item.doctor?.name || '—'}{item.doctor?.department ? ` · ${item.doctor.department}` : ''}{item.doctor?.specialization ? ` · ${item.doctor.specialization}` : ''}</td><td>{new Date(item.scheduledAt).toLocaleString(dateLocale)}</td><td>{item.status}</td><td>{item.consultationStatus}</td></tr>)}</tbody>
        </table></div>
        {!data.appointments.length && <p className="telemedicine-empty">{t('telemedicine.noPast')}</p>}
      </div>
    </>}
  </section>;
}
