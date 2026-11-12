import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { oralHealthDepartments, specialtiesForDepartment } from '../data/oralHealthDepartments.js';
import {
  downloadProfessionalDocument, getFacilityDoctors, uploadProfessionalDocument,
  updateAdminDoctorProfessionalProfile, verifyFacilityDoctor, verifyProfessionalDocument
} from '../services/api.js';

const emptyUpload = { documentType: 'qualification', title: '', file: null };

export function AdminDoctorVerification({ onChanged }) {
  const { t } = useTranslation();
  const [doctors, setDoctors] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [profileDraft, setProfileDraft] = useState({
    registrationNumber: '', qualifications: '', department: '', specialization: '',
    yearsExperience: '0', consultationFee: '0', expertise: '', biography: ''
  });
  const [upload, setUpload] = useState(emptyUpload);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await getFacilityDoctors();
      const items = result.items || [];
      setDoctors(items);
      setSelectedId(current => items.some(item => item._id === current) ? current : items[0]?._id || '');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const doctor = doctors.find(item => item._id === selectedId);
  const documents = doctor?.documents || [];
  const profile = doctor?.doctorProfile || {};
  useEffect(() => {
    if (!doctor) return;
    setProfileDraft({
      registrationNumber: profile.registrationNumber || '',
      qualifications: (profile.qualifications || []).join(', '),
      department: profile.department || '',
      specialization: profile.specialization || '',
      yearsExperience: String(profile.yearsExperience ?? 0),
      consultationFee: String(profile.consultationFee ?? 0),
      expertise: (profile.expertise || []).join(', '),
      biography: profile.biography || ''
    });
  }, [selectedId, doctors]);
  const hasVerifiedQualification = documents.some(item => item.documentType === 'qualification' && item.verificationStatus === 'verified');
  const hasVerifiedRegistration = documents.some(item => item.documentType === 'medical-registration' && item.verificationStatus === 'verified');
  const profileComplete = Boolean(profile.registrationNumber && profile.qualifications?.length);
  const canVerify = Boolean(doctor && !profile.profileVerifiedAt && profileComplete && hasVerifiedQualification && hasVerifiedRegistration);

  async function perform(action, message, refreshAdmin = false) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(message);
      await load();
      if (refreshAdmin) await onChanged?.();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitUpload(event) {
    event.preventDefault();
    if (!doctor?.hospital) {
      setError(t('adminDashboard.assignHospitalBeforeCredentials'));
      return;
    }
    if (!upload.file) {
      setError(t('facility.chooseDocument'));
      return;
    }
    if (upload.file.size > 10 * 1024 * 1024) {
      setError(t('facility.documentTooLarge'));
      return;
    }
    const formData = new FormData();
    formData.append('documentType', upload.documentType);
    formData.append('title', upload.title);
    formData.append('document', upload.file);
    await perform(
      async () => {
        await uploadProfessionalDocument(doctor._id, formData);
        setUpload(emptyUpload);
      },
      t('facility.documentUploaded')
    );
  }

  async function submitProfile(event) {
    event.preventDefault();
    if (!doctor) return;
    const data = {
      registrationNumber: profileDraft.registrationNumber,
      qualifications: profileDraft.qualifications.split(',').map(value => value.trim()).filter(Boolean),
      department: profileDraft.department,
      specialization: profileDraft.specialization,
      yearsExperience: Number(profileDraft.yearsExperience),
      consultationFee: Number(profileDraft.consultationFee),
      expertise: profileDraft.expertise.split(',').map(value => value.trim()).filter(Boolean),
      biography: profileDraft.biography
    };
    await perform(
      () => updateAdminDoctorProfessionalProfile(doctor._id, data),
      t('adminDashboard.doctorProfileSaved'),
      true
    );
  }

  async function download(document) {
    setError('');
    try {
      const file = await downloadProfessionalDocument(document._id);
      const url = URL.createObjectURL(file);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.title.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 100) || 'professional-document';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(failure.message);
    }
  }

  return <section className="role-dashboard-panel">
    <header className="role-dashboard-heading">
      <div>
        <h2>{t('adminDashboard.credentialReviewTitle')}</h2>
        <p>{t('adminDashboard.credentialReviewHelp')}</p>
      </div>
    </header>
    {error && <p className="role-dashboard-error" role="alert">{error}</p>}
    {notice && <p className="role-dashboard-success" role="status">{notice}</p>}
    {loading ? <p>{t('adminDashboard.loading')}</p> : doctors.length ? <>
      <label>{t('adminDashboard.doctorToReview')}
        <select value={selectedId} onChange={event => setSelectedId(event.target.value)}>
          {doctors.map(item => <option key={item._id} value={item._id}>
            {item.name} · {item.staffId || item.email}
          </option>)}
        </select>
      </label>
      {doctor && <>
        <p>{t('adminDashboard.doctorHospital')}: {doctor.hospital?.name || t('adminDashboard.notAssigned')} · {t('adminDashboard.accountStatus')}: {doctor.isActive ? t('adminDashboard.active') : t('adminDashboard.inactive')}</p>
        {!doctor.hospital && <p className="role-dashboard-error">{t('adminDashboard.assignHospitalBeforeCredentials')}</p>}
        <p>
          {t('adminDashboard.professionalVerification')}: {profile.profileVerifiedAt ? t('adminDashboard.verified') : t('adminDashboard.verificationRequired')}
        </p>
        <form className="admin-doctor-form" onSubmit={submitProfile}>
          <label>{t('facility.doctorRegistrationNumber')}
            <input required maxLength="80" value={profileDraft.registrationNumber} onChange={event => setProfileDraft(current => ({ ...current, registrationNumber: event.target.value }))}/>
          </label>
          <label>{t('facility.qualifications')}
            <input required maxLength="1200" value={profileDraft.qualifications} onChange={event => setProfileDraft(current => ({ ...current, qualifications: event.target.value }))}/>
          </label>
          <label>{t('facility.department')}
            <select value={profileDraft.department} onChange={event => {
              const department = event.target.value;
              setProfileDraft(current => ({
                ...current,
                department,
                specialization: specialtiesForDepartment(department)[0] || ''
              }));
            }}>
              <option value="">{t('doctorProfile.selectDepartment')}</option>
              {profileDraft.department && !oralHealthDepartments.some(item => item.name === profileDraft.department) &&
                <option value={profileDraft.department}>{profileDraft.department}</option>}
              {oralHealthDepartments.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label>{t('facility.specialization')}
            <select disabled={!profileDraft.department} value={profileDraft.specialization}
              onChange={event => setProfileDraft(current => ({ ...current, specialization: event.target.value }))}>
              <option value="">{t('doctorProfile.selectSpecialization')}</option>
              {profileDraft.specialization && !specialtiesForDepartment(profileDraft.department).includes(profileDraft.specialization) &&
                <option value={profileDraft.specialization}>{profileDraft.specialization}</option>}
              {specialtiesForDepartment(profileDraft.department).map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>{t('facility.yearsExperience')}
            <input required type="number" min="0" max="80" step="1" value={profileDraft.yearsExperience}
              onChange={event => setProfileDraft(current => ({ ...current, yearsExperience: event.target.value }))}/>
          </label>
          <label>{t('facility.consultationFee')}
            <input required type="number" min="0" max="1000000" step="0.01" value={profileDraft.consultationFee}
              onChange={event => setProfileDraft(current => ({ ...current, consultationFee: event.target.value }))}/>
          </label>
          <label>{t('adminDashboard.expertiseAreas')}
            <input maxLength="2400" value={profileDraft.expertise} onChange={event => setProfileDraft(current => ({ ...current, expertise: event.target.value }))}/>
          </label>
          <label>{t('facility.biography')}
            <textarea maxLength="2000" value={profileDraft.biography} onChange={event => setProfileDraft(current => ({ ...current, biography: event.target.value }))}/>
          </label>
          {profile.profileVerifiedAt && <p>{t('adminDashboard.profileUpdateWarning')}</p>}
          <button type="submit" className="role-dashboard-secondary" disabled={busy}>{t('adminDashboard.saveDoctorProfile')}</button>
        </form>
        <form className="admin-doctor-form" onSubmit={submitUpload}>
          <label>{t('facility.documentType')}
            <select value={upload.documentType} onChange={event => setUpload(current => ({ ...current, documentType: event.target.value }))}>
              {['qualification', 'medical-registration', 'experience', 'other'].map(value =>
                <option key={value} value={value}>{t(`facility.documentTypes.${value}`)}</option>)}
            </select>
          </label>
          <label>{t('facility.documentTitle')}
            <input required maxLength="160" value={upload.title} onChange={event => setUpload(current => ({ ...current, title: event.target.value }))}/>
          </label>
          <label>{t('facility.documentFile')}
            <input required type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => setUpload(current => ({ ...current, file: event.target.files?.[0] || null }))}/>
          </label>
          <button className="role-dashboard-primary" type="submit" disabled={busy || !doctor.hospital}>{t('facility.uploadDocument')}</button>
        </form>
        <div className="facility-item">
          <strong>{t('facility.doctors')}</strong>
          {documents.length ? documents.map(document => <div key={document._id}>
            {document.title} ({t(`facility.documentTypes.${document.documentType}`)}) — {t(`facility.documentStatuses.${document.verificationStatus}`)}
            <button type="button" disabled={busy} onClick={() => download(document)}>{t('facility.viewDocument')}</button>
            {document.verificationStatus === 'pending' && <>
              <button type="button" disabled={busy} onClick={() => perform(
                () => verifyProfessionalDocument(document._id, 'verified'),
                t('facility.documentVerified')
              )}>{t('facility.verify')}</button>
              <button type="button" disabled={busy} onClick={() => perform(
                () => verifyProfessionalDocument(document._id, 'rejected'),
                t('facility.documentRejected')
              )}>{t('facility.reject')}</button>
            </>}
          </div>) : <p>{t('adminDashboard.noCredentialDocuments')}</p>}
          {profile.profileVerifiedAt ? <p>{t('adminDashboard.verified')}</p> : <>
            {!profileComplete && <p>{t('adminDashboard.profileIncomplete')}</p>}
            {(!hasVerifiedQualification || !hasVerifiedRegistration) && <p>{t('adminDashboard.requiredDocumentsMissing')}</p>}
            <button type="button" className="role-dashboard-primary" disabled={busy || !canVerify}
              onClick={() => perform(
                () => verifyFacilityDoctor(doctor._id),
                t('adminDashboard.doctorProfileVerified', { name: doctor.name }),
                true
              )}>{t('adminDashboard.verifyProfessionalProfile')}</button>
          </>}
        </div>
      </>}
    </> : <p className="role-dashboard-empty">{t('adminDashboard.noDoctorsForVerification')}</p>}
  </section>;
}
