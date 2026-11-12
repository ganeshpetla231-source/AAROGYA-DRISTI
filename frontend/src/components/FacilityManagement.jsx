import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Eye, Pencil, RefreshCw, Search, ShieldCheck, UserRound } from 'lucide-react';
import {
  createAdminHospital, getAdminFacilitySummary, getAdminFacilities, getAdminHospitalManagers,
  getFacilityProfile, updateFacilityProfile, updateAdminFacility
} from '../services/api.js';
import './facility-management.css';

export function FacilityManagement({ role }) {
  const { t } = useTranslation();
  const [hospital, setHospital] = useState(null);
  const [profile, setProfile] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const profileResult = await getFacilityProfile();
      setHospital(profileResult.hospital);
      setProfile(profileResult.hospital);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (role !== 'admin') load(); }, [role]);

  async function submit(action, successMessage) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      await load();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  if (role === 'admin') return <AdminFacilitiesWorkspace/>;

  return <section className="facility-workspace">
    <div className="panel">
      <h2>{t('facility.title')}</h2>
      <p>{t('facility.managerIntro')}</p>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="api-success" role="status">{notice}</p>}
    {loading ? <div className="panel">{t('common.loading')}</div> : hospital && <form className="panel auth-form" onSubmit={event => {
      event.preventDefault();
      const fields = ['registrationNumber', 'facilityType', 'village', 'mandal', 'district', 'address', 'phone', 'postalCode', 'workingHours'];
      const changes = Object.fromEntries(fields.map(field => [field, profile[field] || '']));
      submit(() => updateFacilityProfile(changes), t('facility.profileSaved'));
    }}>
      <h3>{hospital.name}</h3>
      {['registrationNumber', 'facilityType', 'village', 'mandal', 'district', 'address', 'phone', 'postalCode', 'workingHours'].map(field =>
        <label key={field}>{t(`facility.${field}`)}
          <input value={profile[field] || ''} maxLength={field === 'address' || field === 'workingHours' ? 500 : field === 'postalCode' ? 6 : 120}
            onChange={event => setProfile(current => ({ ...current, [field]: event.target.value }))}/>
        </label>)}
      <button className="auth-submit" disabled={busy}>{t('facility.saveProfile')}</button>
    </form>}
    <div className="panel">
      <h3>{t('facility.adminManagedDoctorsTitle')}</h3>
      <p>{t('facility.adminManagedDoctorsHelp')}</p>
    </div>
  </section>;
}

const emptyFacilityForm = {
  name: '', village: '', facilityType: '', district: '', address: '',
  managerName: '', managerEmail: '', managerPhone: '', beds: ''
};

const facilityTypes = [
  ['District Hospital', 'District Hospital'],
  ['Area Hospital', 'Area Hospital'],
  ['Community Health Centre', 'CHC — Community Health Centre'],
  ['Primary Health Centre', 'PHC — Primary Health Centre'],
  ['Sub-Centre', 'Sub-Centre']
];

function AdminFacilitiesWorkspace() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(emptyFacilityForm);
  const [result, setResult] = useState({ items: [], pagination: { page: 1, pages: 1, total: 0 } });
  const [summary, setSummary] = useState({ total: 0, active: 0, inactive: 0, managers: 0 });
  const [managers, setManagers] = useState([]);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [facilityType, setFacilityType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [credential, setCredential] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      getAdminFacilities({
        page,
        limit: 10,
        q: query || undefined,
        facilityType: facilityType || undefined,
        isActive: status || undefined
      }),
      getAdminFacilitySummary(),
      getAdminHospitalManagers({ page: 1, limit: 100 })
    ]).then(([facilities, facilitySummary, managerResult]) => {
      if (!active) return;
      setResult(facilities);
      setSummary(facilitySummary);
      setManagers(managerResult.items || []);
    }).catch(failure => {
      if (active) setError(failure.message || 'Unable to load facility management data.');
    }).finally(() => {
      if (active) {
        setLoading(false);
        setRefreshing(false);
      }
    });
    return () => { active = false; };
  }, [page, query, facilityType, status, reloadKey]);

  function updateForm(event) {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function registerFacility(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    setCredential(null);
    try {
      const saved = await createAdminHospital({
        name: form.name.trim(),
        village: form.village.trim(),
        facilityType: form.facilityType,
        district: form.district.trim(),
        address: form.address.trim(),
        managerName: form.managerName.trim(),
        managerEmail: form.managerEmail.trim(),
        managerPhone: form.managerPhone.trim(),
        beds: Number(form.beds)
      });
      setForm(emptyFacilityForm);
      setCredential(saved);
      setNotice('Facility and manager registered successfully.');
      setPage(1);
      setReloadKey(value => value + 1);
    } catch (failure) {
      setError(failure.message || 'Facility registration failed.');
    } finally {
      setBusy(false);
    }
  }

  async function setFacilityStatus(facility) {
    const nextActive = !facility.isActive;
    const action = nextActive ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${action} ${facility.name}?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await updateAdminFacility(facility._id, { isActive: nextActive });
      setNotice(`${facility.name} ${nextActive ? 'activated' : 'deactivated'}.`);
      setReloadKey(value => value + 1);
    } catch (failure) {
      setError(failure.message || `Unable to ${action} this facility.`);
    } finally {
      setBusy(false);
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  }

  function resetForm() {
    setForm(emptyFacilityForm);
    setError('');
  }

  const managerByHospital = new Map(managers.map(manager => [
    typeof manager.hospital === 'object' ? manager.hospital?._id : manager.hospital,
    manager
  ]));
  const facilities = result.items || [];
  const pages = Math.max(1, result.pagination?.pages || 1);

  return <section className="facility-management-dashboard">
    <header className="fm-page-header">
      <div><p className="fm-eyebrow">SUPER ADMIN WORKSPACE · DATABASE DATA</p><h2>Facility Management</h2><p>Manage healthcare facilities, hospitals and their managers.</p></div>
      <button className="fm-button fm-button-muted" type="button" onClick={() => { setRefreshing(true); setReloadKey(value => value + 1); }} disabled={loading || refreshing}>
        <RefreshCw size={16} className={refreshing ? 'fm-spin' : ''}/>{refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </header>

    <div className="fm-summary-grid">
      <SummaryCard icon={<Building2 size={18}/>} label="Total Facilities" value={summary.total}/>
      <SummaryCard icon={<CheckCircle2 size={18}/>} label="Active Facilities" value={summary.active}/>
      <SummaryCard icon={<ShieldCheck size={18}/>} label="Inactive Facilities" value={summary.inactive}/>
      <SummaryCard icon={<UserRound size={18}/>} label="Total Registered Managers" value={summary.managers}/>
    </div>

    {error && <div className="fm-alert fm-alert-error" role="alert">{error}<button type="button" aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
    {notice && <div className="fm-alert fm-alert-success" role="status">{notice}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
    {credential && <aside className="fm-credential" role="status">
      <div><b>Manager account created</b><p>Initial password is displayed only once. Share it securely with {credential.manager?.email || 'the manager'}.</p></div>
      <code>{credential.initialPassword}</code>
      <button type="button" aria-label="Dismiss manager credentials" onClick={() => setCredential(null)}>×</button>
    </aside>}

    <form className="fm-card fm-registration" onSubmit={registerFacility} onReset={resetForm}>
      <div className="fm-section-heading"><div><p className="fm-eyebrow">NEW RECORD</p><h3>Register New Healthcare Facility</h3></div><span className="fm-required-note"><i>*</i> Required fields</span></div>
      <div className="fm-form-grid">
        <Field label="Hospital / Facility Name" required><input name="name" value={form.name} onChange={updateForm} maxLength="180" required autoComplete="organization"/></Field>
        <Field label="Village / Locality" required><input name="village" value={form.village} onChange={updateForm} maxLength="120" required autoComplete="address-level3"/></Field>
        <Field label="Facility Type" required><select name="facilityType" value={form.facilityType} onChange={updateForm} required><option value="">Select facility type</option>{facilityTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
        <Field label="District" required><input name="district" value={form.district} onChange={updateForm} maxLength="120" required autoComplete="address-level2"/></Field>
        <Field label="Complete Address" required wide><textarea name="address" value={form.address} onChange={updateForm} maxLength="500" rows="3" required autoComplete="street-address"/></Field>
        <Field label="Manager Full Name" required><input name="managerName" value={form.managerName} onChange={updateForm} maxLength="120" required autoComplete="name"/></Field>
        <Field label="Manager Email" required><input name="managerEmail" type="email" value={form.managerEmail} onChange={updateForm} maxLength="254" required autoComplete="email"/></Field>
        <Field label="Manager Mobile Number" required><input name="managerPhone" type="tel" value={form.managerPhone} onChange={updateForm} maxLength="30" minLength="8" pattern="\+?[0-9\s()-]{8,20}" title="Enter a valid phone number" required autoComplete="tel"/></Field>
        <Field label="Number of Beds" required><input name="beds" type="number" value={form.beds} onChange={updateForm} min="0" max="100000" step="1" required/></Field>
      </div>
      <div className="fm-form-actions">
        <button className="fm-button fm-button-muted" type="reset" disabled={busy}>Reset Form</button>
        <button className="fm-button fm-button-primary" type="submit" disabled={busy}>{busy ? 'Registering…' : 'Register Facility'}</button>
      </div>
    </form>

    <section className="fm-card fm-registered-section">
      <div className="fm-section-heading fm-list-heading"><div><p className="fm-eyebrow">FACILITY DIRECTORY</p><h3>Registered Facilities</h3><p>View and update facilities stored in the database.</p></div></div>
      <div className="fm-table-toolbar">
        <form className="fm-search" onSubmit={submitSearch}>
          <Search size={16} aria-hidden="true"/>
          <label className="fm-sr-only" htmlFor="fm-search-facility">Search facilities</label>
          <input id="fm-search-facility" value={queryInput} onChange={event => setQueryInput(event.target.value)} placeholder="Search hospital or locality" maxLength="100"/>
          <button type="submit" className="fm-button fm-button-muted">Search</button>
        </form>
        <label className="fm-filter">Facility type<select value={facilityType} onChange={event => { setPage(1); setFacilityType(event.target.value); }}><option value="">All facility types</option>{facilityTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="fm-filter">Status<select value={status} onChange={event => { setPage(1); setStatus(event.target.value); }}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></label>
      </div>

      {loading ? <div className="fm-table-state" role="status">Loading facilities…</div> : facilities.length ? <div className="fm-table-wrap">
        <table className="fm-facility-table">
          <thead><tr><th>S.No</th><th>Hospital Name</th><th>Village / Locality</th><th>Facility Type</th><th>Manager Name</th><th>Contact Number</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{facilities.map((facility, index) => {
            const manager = managerByHospital.get(facility._id);
            return <tr key={facility._id}>
              <td data-label="S.No">{((result.pagination?.page || page) - 1) * 10 + index + 1}</td>
              <td data-label="Hospital Name"><b>{facility.name}</b><small>{facility.hospitalId || facility._id}</small></td>
              <td data-label="Village / Locality">{facility.village || 'Not Available'}</td>
              <td data-label="Facility Type"><span className="fm-type-badge">{facility.facilityType || 'Not Available'}</span></td>
              <td data-label="Manager Name">{manager?.name || 'Not Assigned'}</td>
              <td data-label="Contact Number">{manager?.phone || facility.phone || 'Not Available'}</td>
              <td data-label="Status"><span className={`fm-status ${facility.isActive ? 'is-active' : 'is-inactive'}`}>{facility.isActive ? 'Active' : 'Inactive'}</span></td>
              <td data-label="Actions"><div className="fm-row-actions">
                <button type="button" className="fm-action-button" onClick={() => navigate(`/admin/facilities/${encodeURIComponent(facility._id)}`, { state: { from: `${location.pathname}${location.search}` } })}><Eye size={14}/>View Details</button>
                <button type="button" className="fm-action-button" onClick={() => navigate(`/admin/facilities/${encodeURIComponent(facility._id)}?edit=1`, { state: { from: `${location.pathname}${location.search}` } })}><Pencil size={14}/>Edit</button>
                <button type="button" className={`fm-action-button ${facility.isActive ? 'fm-deactivate' : 'fm-activate'}`} disabled={busy} onClick={() => setFacilityStatus(facility)}>{facility.isActive ? 'Deactivate' : 'Activate'}</button>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <div className="fm-table-state">{error ? 'Facilities are unavailable. Use Refresh to try again.' : 'No facilities match these filters.'}</div>}

      <div className="fm-pagination">
        <span>{result.pagination?.total || 0} facilities</span>
        <div><button type="button" className="fm-button fm-button-muted" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1 || loading}><ChevronLeft size={15}/>Previous</button><span>Page {page} of {pages}</span><button type="button" className="fm-button fm-button-muted" onClick={() => setPage(current => Math.min(pages, current + 1))} disabled={page >= pages || loading}>Next<ChevronRight size={15}/></button></div>
      </div>
    </section>
  </section>;
}

function SummaryCard({ icon, label, value }) {
  return <article className="fm-summary-card"><span>{icon}</span><div><small>{label}</small><b>{value}</b></div></article>;
}

function Field({ label, required, wide, children }) {
  return <label className={`fm-field${wide ? ' fm-field-wide' : ''}`}><span>{label}{required && <i aria-hidden="true"> *</i>}</span>{children}</label>;
}
