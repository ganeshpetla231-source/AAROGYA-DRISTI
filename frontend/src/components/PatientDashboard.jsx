import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deletePatientProfilePhoto, getPatientProfile, getPatientProfilePhoto, updatePatientProfile, uploadPatientProfilePhoto } from '../services/api.js';
import './role-dashboards.css';

const editableFields = ['phone', 'village', 'district', 'mandal', 'dateOfBirth', 'gender'];
const profilePhotoTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxProfilePhotoBytes = 5 * 1024 * 1024;

export function PatientDashboard() {
  const { t } = useTranslation();
  const [patient, setPatient] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const photoUrlRef = useRef('');

  const replacePhoto = useCallback(blob => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const nextUrl = blob ? URL.createObjectURL(blob) : '';
    photoUrlRef.current = nextUrl;
    setPhotoUrl(nextUrl);
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { patient: record } = await getPatientProfile();
      setPatient(record);
      setForm(Object.fromEntries(editableFields.map(field => [
        field,
        field === 'dateOfBirth' && record[field] ? new Date(record[field]).toISOString().slice(0, 10) : record[field] || ''
      ])));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    let active = true;
    if (!patient?.hasProfilePhoto) {
      replacePhoto(null);
      return () => { active = false; };
    }
    getPatientProfilePhoto()
      .then(blob => { if (active) replacePhoto(blob); })
      .catch(failure => { if (active && failure.statusCode !== 404) setError(failure.message); });
    return () => { active = false; };
  }, [patient?.hasProfilePhoto, replacePhoto]);
  useEffect(() => () => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updates = Object.fromEntries(editableFields.map(field => [field, form[field]]));
      const { patient: updated } = await updatePatientProfile(updates);
      setPatient(updated);
      setNotice(t('patientProfile.updated'));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    if (!profilePhotoTypes.has(file.type)) {
      setError(t('patientProfile.photoInvalidType'));
      return;
    }
    if (file.size > maxProfilePhotoBytes) {
      setError(t('patientProfile.photoTooLarge'));
      return;
    }
    setPhotoBusy(true);
    try {
      await uploadPatientProfilePhoto(file);
      setPatient(current => ({ ...current, hasProfilePhoto: true }));
      replacePhoto(file);
      setNotice(t('patientProfile.photoUpdated'));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    setError('');
    setNotice('');
    try {
      await deletePatientProfilePhoto();
      setPatient(current => ({ ...current, hasProfilePhoto: false }));
      replacePhoto(null);
      setNotice(t('patientProfile.photoRemoved'));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  if (loading) return <div className="loading-state"><span className="spinner"/>{t('patientProfile.loading')}</div>;
  if (!patient) return <section className="role-dashboard-panel"><div className="role-dashboard-error" role="alert">{error || t('patientProfile.missing')}</div><button className="role-dashboard-primary" type="button" onClick={load}>{t('common.retry')}</button></section>;

  return <section className="role-dashboard-panel patient-profile-panel" aria-label={t('patientProfile.title')}>
    <header className="role-dashboard-heading">
      <div><p className="section-overline">{t('patientProfile.title').toUpperCase()}</p><h2>{t('patientProfile.title')}</h2><p>{t('patientProfile.updateText', { name: patient.name })}</p></div>
      <div className="patient-id-badge"><span>{t('patientProfile.patientId')}</span><strong>{patient.patientId}</strong></div>
    </header>
    {error && <p className="role-dashboard-error" role="alert">{error}</p>}
    {notice && <p className="role-dashboard-success" role="status">{notice}</p>}
    <div className="patient-profile-photo">
      {photoUrl
        ? <img src={photoUrl} alt={t('patientProfile.photoAlt', { name: patient.name })}/>
        : <span className="patient-profile-photo-placeholder" aria-hidden="true">{(patient.name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span>}
      <div>
        <strong>{t('patientProfile.photoTitle')}</strong>
        <p>{t('patientProfile.photoHelp')}</p>
        <div className="patient-profile-photo-actions">
          <label className="role-dashboard-secondary patient-photo-upload">
            {photoBusy ? t('patientProfile.photoSaving') : t(patient.hasProfilePhoto ? 'patientProfile.changePhoto' : 'patientProfile.uploadPhoto')}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy} onChange={uploadPhoto}/>
          </label>
          {patient.hasProfilePhoto && <button className="role-dashboard-secondary" type="button" disabled={photoBusy} onClick={removePhoto}>{t('patientProfile.removePhoto')}</button>}
        </div>
      </div>
    </div>
    <form className="patient-profile-form" onSubmit={save}>
    <label>{t('patientProfile.fullName')}<input value={patient.name || ''} readOnly/></label>
    <label>{t('patientProfile.email')}<input value={patient.email || ''} readOnly type="email"/></label>
    <label>{t('patientProfile.phone')}<input maxLength="30" value={form.phone || ''} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))}/></label>
    <label>{t('patientProfile.village')}<input maxLength="120" value={form.village || ''} onChange={event => setForm(current => ({ ...current, village: event.target.value }))}/></label>
    <label>{t('patientProfile.district')}<input maxLength="120" value={form.district || ''} onChange={event => setForm(current => ({ ...current, district: event.target.value }))}/></label>
    <label>{t('patientProfile.mandal')}<input maxLength="120" value={form.mandal || ''} onChange={event => setForm(current => ({ ...current, mandal: event.target.value }))}/></label>
    <label>{t('patientProfile.dateOfBirth')}<input type="date" value={form.dateOfBirth || ''} onChange={event => setForm(current => ({ ...current, dateOfBirth: event.target.value }))}/></label>
    <label>{t('patientProfile.gender')}<select value={form.gender || 'prefer-not-to-say'} onChange={event => setForm(current => ({ ...current, gender: event.target.value }))}>
      <option value="prefer-not-to-say">{t('patientProfile.preferNotToSay')}</option><option value="female">{t('patientProfile.female')}</option><option value="male">{t('patientProfile.male')}</option><option value="other">{t('patientProfile.other')}</option>
      </select></label>
    <button className="role-dashboard-primary" type="submit" disabled={saving}>{saving ? t('patientProfile.saving') : t('patientProfile.save')}</button>
    </form>
  </section>;
}
