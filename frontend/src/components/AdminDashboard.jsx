import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  assignAdminDoctorHospital, assignPatientDoctor, createAdminAccount, createAdminDoctor, createAdminStaff, decideAdminDoctor, getAdminAccounts,
  getAdminActivity, getAdminDashboard, getAdminDoctors, getAdminHospitalManagers, getAdminHospitals,
  getAdminPatients, updateResource
} from '../services/api.js';
import { FacilityManagement } from './FacilityManagement.jsx';
import { AdminDoctorVerification } from './AdminDoctorVerification.jsx';
import { HealthcareWorkers } from './HealthcareWorkers.jsx';
import './role-dashboards.css';

const emptyDoctor = { name: '', email: '', staffId: '', password: '', phone: '', district: '' };
const emptyAdmin = { name: '', email: '', staffId: '', password: '', phone: '' };
const summaryLabels = ['totalHospitals', 'activeHospitals', 'totalHospitalAdmins', 'totalDoctors', 'totalHealthWorkers', 'totalPatients', 'todayAppointments', 'pendingCases', 'completedCases', 'pendingDoctorApprovals', 'totalReferrals'];
const pageSize = 20;
const emptyPagination = { page: 1, limit: pageSize, total: 0, pages: 0 };
const adminSections = ['overview', 'hospitals', 'hospitalAdmins', 'doctors', 'staff', 'patients', 'appointments', 'cases', 'referrals', 'phcs', 'departments', 'reports', 'notifications', 'users', 'permissions', 'activity', 'settings'];

async function getPage(fetchPage, page, params = {}) {
  let result = await fetchPage({ ...params, page, limit: pageSize });
  const lastPage = Math.max(result.pagination.pages, 1);
  if (page > lastPage) result = await fetchPage({ ...params, page: lastPage, limit: pageSize });
  return result;
}

export function AdminDashboard({ sections = adminSections, initialSection = 'overview' }) {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState(null);
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [approvedDoctors, setApprovedDoctors] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [patients, setPatients] = useState([]);
  const [pendingPage, setPendingPage] = useState(1);
  const [approvedPage, setApprovedPage] = useState(1);
  const [patientPage, setPatientPage] = useState(1);
  const [pendingPagination, setPendingPagination] = useState(emptyPagination);
  const [approvedPagination, setApprovedPagination] = useState(emptyPagination);
  const [patientPagination, setPatientPagination] = useState(emptyPagination);
  const [section, setSection] = useState(initialSection);
  const [managers, setManagers] = useState([]);
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionPage, setSectionPage] = useState(1);
  const [sectionPagination, setSectionPagination] = useState(emptyPagination);
  const [form, setForm] = useState(emptyDoctor);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summary, pending, approved, patientRecords, hospitalRecords] = await Promise.all([
        getAdminDashboard(),
        getPage(getAdminDoctors, pendingPage, { status: 'pending' }),
        getPage(getAdminDoctors, approvedPage, { status: 'approved', active: true }),
        getPage(getAdminPatients, patientPage),
        getAdminHospitals({ page: 1, limit: 100 })
      ]);
      setDashboard(summary);
      setPendingDoctors(pending.items);
      setApprovedDoctors(approved.items);
      setHospitals((hospitalRecords.items || []).filter(hospital => hospital.isActive));
      setPatients(patientRecords.items);
      setPendingPagination(pending.pagination);
      setApprovedPagination(approved.pagination);
      setPatientPagination(patientRecords.pagination);
      if (pendingPage !== pending.pagination.page) setPendingPage(pending.pagination.page);
      if (approvedPage !== approved.pagination.page) setApprovedPage(approved.pagination.page);
      if (patientPage !== patientRecords.pagination.page) setPatientPage(patientRecords.pagination.page);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [pendingPage, approvedPage, patientPage]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!sections.includes(section)) setSection(initialSection || sections[0] || 'overview');
  }, [sections, initialSection, section]);

  useEffect(() => {
    if (!['hospitalAdmins', 'activity', 'users'].includes(section)) return;
    let active = true;
    setSectionLoading(true);
    setError('');
    const request = section === 'hospitalAdmins'
      ? getAdminHospitalManagers({ page: sectionPage, limit: pageSize })
      : section === 'activity'
        ? getAdminActivity({ page: sectionPage, limit: pageSize })
        : getAdminAccounts({ page: sectionPage, limit: pageSize });
    request.then(result => {
      if (!active) return;
      if (section === 'hospitalAdmins') setManagers(result.items || []);
      else if (section === 'activity') setActivities(result.items || []);
      else setAdminAccounts(result.items || []);
      setSectionPagination(result.pagination || emptyPagination);
      if (sectionPage !== result.pagination?.page) setSectionPage(result.pagination?.page || 1);
    }).catch(failure => {
      if (active) setError(failure.message);
    }).finally(() => {
      if (active) setSectionLoading(false);
    });
    return () => { active = false; };
  }, [section, sectionPage]);

  const [adminForm, setAdminForm] = useState(emptyAdmin);

  async function submitAdminAccount(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const created = await createAdminAccount(adminForm);
      setAdminForm(emptyAdmin);
      setNotice(t('adminDashboard.adminAccountCreated', { name: created.name, email: created.email }));
      const result = await getAdminAccounts({ page: sectionPage, limit: pageSize });
      setAdminAccounts(result.items || []);
      setSectionPagination(result.pagination || emptyPagination);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitDoctor(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const created = await createAdminDoctor(form);
      setForm(emptyDoctor);
      setNotice(t('adminDashboard.createdWithStaffId', { name: created.name, staffId: created.staffId }));
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  async function decideDoctor(doctor, decision) {
    setBusyId(doctor._id);
    setError('');
    setNotice('');
    try {
      await decideAdminDoctor(doctor._id, decision);
      setNotice(t(decision === 'approve' ? 'adminDashboard.approvedNotice' : 'adminDashboard.rejectedNotice', { name: doctor.name }));
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyId('');
    }
  }

  async function assignHospital(doctor, hospitalId) {
    if (!hospitalId) return;
    const hospital = hospitals.find(item => item._id === hospitalId);
    const currentHospitalId = doctor.hospital?._id || '';
    const isReassignment = Boolean(currentHospitalId && currentHospitalId !== hospitalId);
    const confirmation = isReassignment ? 'adminDashboard.confirmMoveDoctor' : 'adminDashboard.confirmAssignDoctor';
    if (!hospital || !window.confirm(t(confirmation, { name: doctor.name, hospital: hospital.name }))) return;
    setBusyId(doctor._id);
    setError('');
    setNotice('');
    try {
      await assignAdminDoctorHospital(doctor._id, hospitalId);
      setNotice(t(isReassignment ? 'adminDashboard.doctorHospitalMoved' : 'adminDashboard.doctorHospitalAssigned', {
        name: doctor.name,
        hospital: hospital.name
      }));
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyId('');
    }
  }

  async function assign(patient, doctorId) {
    setBusyId(patient._id);
    setError('');
    setNotice('');
    try {
      await assignPatientDoctor(patient._id, doctorId || null);
      setNotice(t('adminDashboard.assignmentUpdated', { name: patient.name }));
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyId('');
    }
  }

  async function toggleManager(manager) {
    if (!window.confirm(t(manager.isActive ? 'adminDashboard.confirmDeactivateManager' : 'adminDashboard.confirmActivateManager', { name: manager.name }))) return;
    setBusyId(String(manager._id));
    setError('');
    setNotice('');
    try {
      await updateResource('users', manager._id, { isActive: !manager.isActive });
      setNotice(t('adminDashboard.managerStatusUpdated', { name: manager.name }));
      const result = await getAdminHospitalManagers({ page: sectionPage, limit: pageSize });
      setManagers(result.items || []);
      setSectionPagination(result.pagination || emptyPagination);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyId('');
    }
  }

  if (loading && !dashboard) return <div className="loading-state"><span className="spinner"/>{t('adminDashboard.loading')}</div>;

  return <div className="role-dashboard-stack" aria-label={t('roles.admin')}>
    {error && <p className="role-dashboard-error" role="alert">{error}</p>}
    {notice && <p className="role-dashboard-success" role="status">{notice}</p>}
    <div className="admin-dashboard-toolbar"><span>{t('roles.admin')}</span><button type="button" className="role-dashboard-secondary" onClick={load} disabled={loading}>{t('common.refresh')}</button></div>
    <nav className="admin-section-tabs" aria-label={t('adminDashboard.sections')}>
      {sections.map(item => <button key={item} type="button" aria-current={section === item ? 'page' : undefined}
        className={section === item ? 'admin-section-active' : ''} onClick={() => { setSection(item); setSectionPage(1); }}>
        {t(`adminDashboard.sectionsList.${item}`)}
      </button>)}
    </nav>
    {section === 'overview' && dashboard && <section className="admin-summary-grid" aria-label={t('adminDashboard.statisticsLabel')}>
      {summaryLabels.map(key => <article className="admin-summary-card" key={key}>
        <span>{t(`adminDashboard.stats.${key}`)}</span><strong>{dashboard.summary[key] ?? 0}</strong>
      </article>)}
    </section>}

    {section === 'hospitals' && <FacilityManagement role="admin"/>}
    {section === 'staff' && <><StaffAccountProvisioning/><HealthcareWorkers role="admin"/></>}
    {section === 'doctors' && <><section className="role-dashboard-panel">
      <header className="role-dashboard-heading"><div><p className="section-overline">{t('adminDashboard.accessControl')}</p><h2>{t('adminDashboard.doctorsTitle')}</h2><p>{t('adminDashboard.doctorDescription')}</p></div></header>
      {pendingDoctors.length ? <div className="admin-doctor-card-list">
        {pendingDoctors.map(doctor => <article className="admin-doctor-card admin-doctor-card-pending" key={doctor._id}>
          <div className="admin-doctor-card-heading">
            <div><h3>{doctor.name}</h3><p>{doctor.staffId || '—'} · {doctor.email}</p></div>
            <span className="admin-doctor-status admin-doctor-status-pending">{t('adminDashboard.approvalPending')}</span>
          </div>
          <dl className="admin-doctor-card-details">
            <div><dt>{t('adminDashboard.district')}</dt><dd>{doctor.district || '—'}</dd></div>
          </dl>
          <div className="admin-doctor-card-actions">
            <button type="button" className="role-dashboard-primary" disabled={busyId === doctor._id} onClick={() => decideDoctor(doctor, 'approve')}>{t('adminDashboard.approve')}</button>
            <button type="button" className="role-dashboard-secondary" disabled={busyId === doctor._id} onClick={() => decideDoctor(doctor, 'reject')}>{t('adminDashboard.reject')}</button>
          </div>
        </article>)}
      </div> : <p className="role-dashboard-empty">{t('adminDashboard.noPendingDoctors')}</p>}
      <PaginationControls pagination={pendingPagination} onPageChange={setPendingPage} label={t('adminDashboard.pendingDoctorsPagination')} loading={loading}/>
    </section>
    <section className="role-dashboard-panel">
      <header className="role-dashboard-heading"><div><h2>{t('adminDashboard.activeDoctorsTitle')}</h2><p>{t('adminDashboard.activeDoctorsHelp')}</p></div></header>
      {approvedDoctors.length ? <div className="admin-doctor-card-list">
        {approvedDoctors.map(doctor => <article className="admin-doctor-card" key={doctor._id}>
          <div className="admin-doctor-card-heading">
            <div><h3>{doctor.name}</h3><p>{doctor.staffId || '—'} · {doctor.email}</p></div>
            <span className={`admin-doctor-status ${doctor.isActive ? 'admin-doctor-status-active' : 'admin-doctor-status-inactive'}`}>
              {doctor.isActive ? t('adminDashboard.active') : t('adminDashboard.inactive')}
            </span>
          </div>
          <dl className="admin-doctor-card-details">
            <div><dt>{t('adminDashboard.district')}</dt><dd>{doctor.district || '—'}</dd></div>
            <div><dt>{t('adminDashboard.professionalVerification')}</dt><dd>{doctor.profileVerified ? t('adminDashboard.verified') : doctor.hospital ? t('adminDashboard.verificationRequired') : t('adminDashboard.notAssigned')}</dd></div>
          </dl>
          <label className="admin-doctor-hospital-field">{t('adminDashboard.assignHospitalTo', { name: doctor.name })}
            <select aria-label={t('adminDashboard.assignHospitalTo', { name: doctor.name })}
              value={doctor.hospital?._id || ''} disabled={busyId === doctor._id || !hospitals.length}
              onChange={event => assignHospital(doctor, event.target.value)}>
              <option value="">{hospitals.length ? t('adminDashboard.assignHospital') : t('adminDashboard.noActiveHospitals')}</option>
              {doctor.hospital && !hospitals.some(hospital => hospital._id === doctor.hospital._id) &&
                <option value={doctor.hospital._id}>{doctor.hospital.name} ({t('adminDashboard.inactive')})</option>}
              {hospitals.map(hospital => <option key={hospital._id} value={hospital._id}>{hospital.name}</option>)}
            </select>
          </label>
        </article>)}
      </div> : <p className="role-dashboard-empty">{t('adminDashboard.noActiveDoctors')}</p>}
      <PaginationControls pagination={approvedPagination} onPageChange={setApprovedPage} label={t('adminDashboard.doctorOptionsPagination')} loading={loading}/>
    </section>
    <AdminDoctorVerification onChanged={load}/></>}

    {section === 'doctors' && <><section className="role-dashboard-panel">
      <header className="role-dashboard-heading"><div><p className="section-overline">{t('adminDashboard.accountProvisioning')}</p><h2>{t('adminDashboard.createDoctorTitle')}</h2><p>{t('adminDashboard.createDoctorDescription')}</p></div></header>
      <form className="admin-doctor-form" onSubmit={submitDoctor}>
        <label>{t('adminDashboard.name')}<input required maxLength="120" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))}/></label>
        <label>{t('adminDashboard.email')}<input required type="email" maxLength="254" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))}/></label>
        <label>{t('adminDashboard.staffId')}<input maxLength="40" value={form.staffId} onChange={event => setForm(current => ({ ...current, staffId: event.target.value.toUpperCase() }))}/><small>{t('adminDashboard.staffIdHint')}</small></label>
        <label>{t('adminDashboard.temporaryPassword')}<input required type="password" minLength="10" maxLength="128" pattern="[a-z]{10,128}" autoComplete="new-password" value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))}/><small>{t('adminDashboard.passwordHint')}</small></label>
        <label>{t('patientProfile.phone')}<input maxLength="30" value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))}/></label>
        <label>{t('adminDashboard.district')}<input maxLength="120" value={form.district} onChange={event => setForm(current => ({ ...current, district: event.target.value }))}/></label>
        <button className="role-dashboard-primary" type="submit" disabled={saving}>{saving ? t('adminDashboard.creating') : t('adminDashboard.createPendingDoctor')}</button>
      </form>
    </section></>}

    {section === 'patients' && <section className="role-dashboard-panel">
      <header className="role-dashboard-heading"><div><p className="section-overline">{t('adminDashboard.assignments')}</p><h2>{t('adminDashboard.assignTitle')}</h2><p>{t('adminDashboard.assignDescription')}</p></div></header>
      <PaginationControls pagination={approvedPagination} onPageChange={setApprovedPage} label={t('adminDashboard.doctorOptionsPagination')} loading={loading}/>
      {patients.length ? <div className="role-dashboard-table-wrap"><table className="role-dashboard-table">
        <thead><tr><th>{t('common.patient')}</th><th>{t('patientProfile.patientId')}</th><th>{t('adminDashboard.district')}</th><th>{t('roles.doctor')}</th></tr></thead>
        <tbody>{patients.map(patient => {
          const currentDoctor = patient.assignedDoctor && typeof patient.assignedDoctor === 'object' ? patient.assignedDoctor : null;
          const currentDoctorId = currentDoctor?._id || patient.assignedDoctor || '';
          const currentDoctorIsLoaded = approvedDoctors.some(doctor => doctor._id === currentDoctorId);
          return <tr key={patient._id}>
            <td>{patient.name}</td><td>{patient.patientId}</td><td>{patient.district || '—'}</td>
            <td><select aria-label={t('adminDashboard.assignTo', { name: patient.name })} value={currentDoctorId} disabled={busyId === patient._id} onChange={event => assign(patient, event.target.value)}>
              <option value="">{t('adminDashboard.unassigned')}</option>
              {currentDoctorId && !currentDoctorIsLoaded && <option value={currentDoctorId}>{currentDoctor?.name || currentDoctorId}</option>}
              {approvedDoctors.map(doctor => <option key={doctor._id} value={doctor._id}>{doctor.name}</option>)}
            </select></td>
          </tr>;
        })}</tbody>
      </table></div> : <p className="role-dashboard-empty">{t('adminDashboard.noPatients')}</p>}
      <PaginationControls pagination={patientPagination} onPageChange={setPatientPage} label={t('adminDashboard.patientsPagination')} loading={loading}/>
    </section>}

    {section === 'hospitalAdmins' && <section className="role-dashboard-panel">
      <header className="role-dashboard-heading"><div><p className="section-overline">{t('adminDashboard.hospitalAdminManagement')}</p><h2>{t('adminDashboard.hospitalAdminsTitle')}</h2><p>{t('adminDashboard.hospitalAdminsHelp')}</p></div></header>
      {sectionLoading ? <p>{t('adminDashboard.loading')}</p> : managers.length ? <div className="role-dashboard-table-wrap"><table className="role-dashboard-table">
        <thead><tr><th>{t('adminDashboard.name')}</th><th>{t('adminDashboard.email')}</th><th>{t('adminDashboard.staffId')}</th><th>{t('adminDashboard.hospital')}</th><th>{t('adminDashboard.accountStatus')}</th><th>{t('adminDashboard.decision')}</th></tr></thead>
        <tbody>{managers.map(manager => <tr key={manager._id}>
          <td>{manager.name}</td><td>{manager.email}</td><td>{manager.staffId || '—'}</td>
          <td>{manager.hospital?.name || manager.hospital || '—'}</td>
          <td>{manager.isActive ? t('adminDashboard.active') : t('adminDashboard.inactive')}</td>
          <td><button className="role-dashboard-secondary" disabled={busyId === String(manager._id)} onClick={() => toggleManager(manager)}>{t(manager.isActive ? 'adminDashboard.deactivate' : 'adminDashboard.activate')}</button></td>
        </tr>)}</tbody>
      </table></div> : <p className="role-dashboard-empty">{t('adminDashboard.noHospitalAdmins')}</p>}
      <PaginationControls pagination={sectionPagination} onPageChange={setSectionPage} label={t('adminDashboard.hospitalAdminsPagination')} loading={sectionLoading}/>
    </section>}

    {section === 'users' && <section className="role-dashboard-panel">
      <header className="role-dashboard-heading"><div><p className="section-overline">{t('adminDashboard.sectionsList.users')}</p><h2>{t('adminDashboard.adminAccountsTitle')}</h2><p>{t('adminDashboard.adminAccountsHelp')}</p></div></header>
      <form className="admin-doctor-form" onSubmit={submitAdminAccount}>
        <label>{t('adminDashboard.name')}<input required maxLength="120" value={adminForm.name} onChange={event => setAdminForm(current => ({ ...current, name: event.target.value }))}/></label>
        <label>{t('adminDashboard.email')}<input required type="email" maxLength="254" value={adminForm.email} onChange={event => setAdminForm(current => ({ ...current, email: event.target.value }))}/></label>
        <label>{t('adminDashboard.staffId')}<input maxLength="40" value={adminForm.staffId} onChange={event => setAdminForm(current => ({ ...current, staffId: event.target.value.toUpperCase() }))}/><small>{t('adminDashboard.staffIdHint')}</small></label>
        <label>{t('adminDashboard.temporaryPassword')}<input required type="password" minLength="10" maxLength="128" pattern="[a-z]{10,128}" autoComplete="new-password" value={adminForm.password} onChange={event => setAdminForm(current => ({ ...current, password: event.target.value }))}/><small>{t('adminDashboard.passwordHint')}</small></label>
        <label>{t('patientProfile.phone')}<input maxLength="30" value={adminForm.phone} onChange={event => setAdminForm(current => ({ ...current, phone: event.target.value }))}/></label>
        <p className="admin-account-password-note">{t('adminDashboard.adminPasswordNotice')}</p>
        <button className="role-dashboard-primary" type="submit" disabled={saving}>{saving ? t('adminDashboard.creating') : t('adminDashboard.createAdminAccount')}</button>
      </form>
      {sectionLoading ? <p>{t('adminDashboard.loading')}</p> : adminAccounts.length ? <div className="role-dashboard-table-wrap"><table className="role-dashboard-table">
        <thead><tr><th>{t('adminDashboard.name')}</th><th>{t('adminDashboard.email')}</th><th>{t('adminDashboard.staffId')}</th><th>{t('adminDashboard.accountStatus')}</th><th>{t('adminDashboard.activityDate')}</th></tr></thead>
        <tbody>{adminAccounts.map(account => <tr key={account._id}><td>{account.name}</td><td>{account.email}</td><td>{account.staffId || '—'}</td><td>{account.isActive ? t('adminDashboard.active') : t('adminDashboard.inactive')}</td><td>{account.createdAt ? new Date(account.createdAt).toLocaleDateString() : '—'}</td></tr>)}</tbody>
      </table></div> : <p className="role-dashboard-empty">{t('adminDashboard.noAdminAccounts')}</p>}
      <PaginationControls pagination={sectionPagination} onPageChange={setSectionPage} label={t('adminDashboard.adminAccountsPagination')} loading={sectionLoading}/>
    </section>}

    {section === 'appointments' && <StatusSummary title={t('adminDashboard.appointmentSummary')} items={dashboard?.appointmentsByStatus || []}/>}
    {section === 'cases' && <StatusSummary title={t('adminDashboard.caseSummary')} items={dashboard?.casesByStatus || []} note={t('adminDashboard.casePrivacyNote')}/>}
    {section === 'referrals' && <StatusSummary title={t('adminDashboard.referralsByStatus')} items={dashboard?.referralsByStatus || []}/>}

    {section === 'activity' && <section className="role-dashboard-panel">
      <header className="role-dashboard-heading"><div><p className="section-overline">{t('adminDashboard.activityLogs')}</p><h2>{t('adminDashboard.recentActivity')}</h2><p>{t('adminDashboard.activityPrivacyNote')}</p></div></header>
      {sectionLoading ? <p>{t('adminDashboard.loading')}</p> : activities.length ? <div className="role-dashboard-table-wrap"><table className="role-dashboard-table">
        <thead><tr><th>{t('adminDashboard.activityDate')}</th><th>{t('adminDashboard.actor')}</th><th>{t('adminDashboard.activity')}</th><th>{t('adminDashboard.resource')}</th></tr></thead>
        <tbody>{activities.map(item => <tr key={item.id}>
          <td>{new Date(item.occurredAt).toLocaleString()}</td><td>{item.actor?.name || '—'}</td>
          <td>{item.action}</td><td>{item.resourceType}</td>
        </tr>)}</tbody>
      </table></div> : <p className="role-dashboard-empty">{t('adminDashboard.noActivity')}</p>}
      <PaginationControls pagination={sectionPagination} onPageChange={setSectionPage} label={t('adminDashboard.activityPagination')} loading={sectionLoading}/>
    </section>}

    {section === 'reports' && dashboard && <AdminReports dashboard={dashboard} t={t}/>}
    {['phcs', 'departments', 'notifications', 'permissions', 'settings'].includes(section) && <section className="role-dashboard-panel">
      <header className="role-dashboard-heading"><div><p className="section-overline">{t('adminDashboard.sectionsList.' + section)}</p><h2>{t('adminDashboard.notAvailableTitle')}</h2><p>{t(`adminDashboard.unavailable.${section}`)}</p></div></header>
    </section>}

    {section === 'overview' && dashboard && <AdminReports dashboard={dashboard} t={t}/>}
    {section === 'overview' && pendingDoctors.length > 0 && <section className="role-dashboard-panel">
      <h2>{t('adminDashboard.pendingApprovalPreview')}</h2>
      {pendingDoctors.slice(0, 5).map(doctor => <p className="admin-report-row" key={doctor._id}><span>{doctor.name} · {doctor.email}</span><button className="role-dashboard-primary" disabled={busyId === doctor._id} onClick={() => decideDoctor(doctor, 'approve')}>{t('adminDashboard.approve')}</button></p>)}
    </section>}
  </div>;
}

function StaffAccountProvisioning() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', email: '', staffId: '', password: '', role: 'asha', district: '', hospital: '' });
  const [hospitals, setHospitals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    getAdminHospitals({ limit: 100 }).then(result => setHospitals(result.items || [])).catch(failure => setError(failure.message));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await createAdminStaff(form);
      setForm({ name: '', email: '', staffId: '', password: '', role: 'asha', district: '', hospital: '' });
      setNotice(t('adminDashboard.staffAccountCreated', { name: created.name, staffId: created.staffId }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="role-dashboard-panel">
    <header className="role-dashboard-heading"><div><p className="section-overline">{t('adminDashboard.accountProvisioning')}</p><h2>{t('adminDashboard.createStaffAccount')}</h2><p>{t('adminDashboard.createStaffAccountHelp')}</p></div></header>
    {error && <p className="role-dashboard-error" role="alert">{error}</p>}
    {notice && <p className="role-dashboard-success" role="status">{notice}</p>}
    <form className="admin-doctor-form" onSubmit={submit}>
      <label>{t('adminDashboard.name')}<input required maxLength="120" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))}/></label>
      <label>{t('adminDashboard.email')}<input required type="email" maxLength="254" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))}/></label>
      <label>{t('adminDashboard.staffId')}<input maxLength="40" value={form.staffId} onChange={event => setForm(current => ({ ...current, staffId: event.target.value.toUpperCase() }))}/></label>
      <label>{t('adminDashboard.staffAccountRole')}<select value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value, district: '', hospital: '' }))}>
        {['asha', 'specialist', 'district'].map(role => <option key={role} value={role}>{t(`workers.roles.${role}`, { defaultValue: role })}</option>)}
      </select></label>
      {form.role === 'district' && <label>{t('adminDashboard.district')}<input required maxLength="120" value={form.district} onChange={event => setForm(current => ({ ...current, district: event.target.value }))}/></label>}
      {form.role === 'specialist' && <label>{t('adminDashboard.hospital')}<select required value={form.hospital} onChange={event => setForm(current => ({ ...current, hospital: event.target.value }))}>
        <option value="">{t('adminDashboard.chooseHospital')}</option>{hospitals.map(hospital => <option key={hospital._id} value={hospital._id}>{hospital.name}</option>)}
      </select></label>}
      <label>{t('adminDashboard.temporaryPassword')}<input required type="password" minLength="10" maxLength="128" pattern="[a-z]{10,128}" autoComplete="new-password" value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))}/><small>{t('adminDashboard.passwordHint')}</small></label>
      <button className="role-dashboard-primary" type="submit" disabled={busy}>{busy ? t('adminDashboard.creating') : t('adminDashboard.createStaffAccount')}</button>
    </form>
  </section>;
}

function StatusSummary({ title, items, note }) {
  const { t } = useTranslation();
  return <section className="role-dashboard-panel">
    <h2>{title}</h2>
    {note && <p>{note}</p>}
    {items.length ? items.map(item => <p className="admin-report-row" key={item._id}><span>{item._id}</span><strong>{item.count}</strong></p>) : <p className="role-dashboard-empty">{t('adminDashboard.noStatusData')}</p>}
  </section>;
}

function AdminReports({ dashboard, t }) {
  return <section className="admin-report-grid">
    <article className="role-dashboard-panel"><h2>{t('adminDashboard.hospitalWisePatients')}</h2>
      {dashboard.patientsByHospital?.length ? dashboard.patientsByHospital.map((item, index) => <p className="admin-report-row" key={item.hospitalId || item.hospitalName || `hospital-${index}`}><span>{item.hospitalName}</span><strong>{item.patients}</strong></p>) : <p className="role-dashboard-empty">{t('adminDashboard.noHospitalPatientStats')}</p>}
    </article>
    <article className="role-dashboard-panel"><h2>{t('adminDashboard.monthlyRegistrations')}</h2>
      {dashboard.monthlyRegistrations?.length ? dashboard.monthlyRegistrations.map(item => <p className="admin-report-row" key={`${item._id.year}-${item._id.month}`}><span>{item._id.year}-{String(item._id.month).padStart(2, '0')}</span><strong>{item.count}</strong></p>) : <p className="role-dashboard-empty">{t('adminDashboard.noMonthlyData')}</p>}
    </article>
    <article className="role-dashboard-panel"><h2>{t('adminDashboard.referralsByStatus')}</h2>
      {dashboard.referralsByStatus?.length ? dashboard.referralsByStatus.map(item => <p className="admin-report-row" key={item._id}><span>{item._id}</span><strong>{item.count}</strong></p>) : <p className="role-dashboard-empty">{t('adminDashboard.noReferralStats')}</p>}
    </article>
    <article className="role-dashboard-panel"><h2>{t('adminDashboard.screeningsByDistrict')}</h2>
      {dashboard.districtStatistics?.length ? dashboard.districtStatistics.map(item => <p className="admin-report-row" key={item._id}><span>{item._id}</span><strong>{item.screenings}</strong></p>) : <p className="role-dashboard-empty">{t('adminDashboard.noDistrictStats')}</p>}
    </article>
  </section>;
}

function PaginationControls({ pagination, onPageChange, label, loading }) {
  const { t } = useTranslation();
  if (!pagination?.pages || pagination.pages <= 1) return null;
  return <nav className="admin-pagination" aria-label={label}>
    <button type="button" className="role-dashboard-secondary" disabled={loading || pagination.page <= 1} onClick={() => onPageChange(page => Math.max(1, page - 1))}>{t('adminDashboard.previousPage')}</button>
    <span>{t('adminDashboard.pageStatus', { page: pagination.page, pages: pagination.pages })}</span>
    <button type="button" className="role-dashboard-secondary" disabled={loading || pagination.page >= pagination.pages} onClick={() => onPageChange(page => Math.min(pagination.pages, page + 1))}>{t('adminDashboard.nextPage')}</button>
  </nav>;
}
