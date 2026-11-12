import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { getAdminFacilities, getAdminFacility, updateAdminFacility } from '../services/api.js';
import './admin-facilities.css';

const unavailable = 'Not Available';
const showValue = value => value === undefined || value === null || value === ''
  ? unavailable
  : Array.isArray(value) ? value.length ? value.join(', ') : unavailable
    : typeof value === 'object' ? unavailable : value;
const displayAddress = facility => [facility.address, facility.village, facility.mandal, facility.district, facility.postalCode]
  .filter(Boolean)
  .reduce((address, part) => address.toLowerCase().includes(part.toLowerCase()) ? address : [address, part].filter(Boolean).join(', '), '');

export function AdminFacilitiesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getAdminFacilities({ page, limit: 100, q: search || undefined })
      .then(data => { if (active) setResult(data); })
      .catch(cause => { if (active) setError(cause.message || 'Unable to load facilities.'); })
      .finally(() => { if (active) { setLoading(false); setRefreshing(false); } });
    return () => { active = false; };
  }, [page, search, reloadKey]);

  const refresh = () => {
    setRefreshing(true);
    setReloadKey(value => value + 1);
  };
  const submitSearch = event => {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  };
  const items = result?.items || [];
  const pagination = result?.pagination;

  return <section className="admin-facilities panel">
    <div className="admin-facilities-heading">
      <div><h2>Facilities</h2><p>MongoDB facility records, including government hospitals and PHCs.</p></div>
      <button className="admin-facilities-button secondary" type="button" onClick={refresh} disabled={loading || refreshing}>
        <RefreshCw size={15} className={refreshing ? 'is-spinning' : ''}/>{refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
    <form className="admin-facilities-search" onSubmit={submitSearch}>
      <label className="sr-only" htmlFor="admin-facility-search">Search facilities</label>
      <Search size={16} aria-hidden="true"/>
      <input id="admin-facility-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, mandal, phone, or facility ID"/>
      <button className="admin-facilities-button" type="submit">Search</button>
    </form>

    {loading && <div className="admin-facilities-state" role="status"><span className="spinner"/>Loading facilities from MongoDB…</div>}
    {!loading && error && <div className="admin-facilities-state error" role="alert"><b>Facilities could not be loaded</b><p>{error}</p><button className="admin-facilities-button" onClick={refresh} type="button">Try again</button></div>}
    {!loading && !error && !items.length && <div className="admin-facilities-state"><b>No facilities found</b><p>{search ? 'Try another search term.' : 'There are no facility records in the database.'}</p></div>}
    {!loading && !error && !!items.length && <>
      <div className="admin-facilities-count">{pagination?.total ?? items.length} facilities</div>
      <div className="admin-facilities-grid">
        {items.map(facility => <article className="admin-facility-card" key={facility._id}>
          <div className="admin-facility-card-top"><span className="admin-facility-icon" aria-hidden="true">⌖</span><span className={`admin-facility-status ${facility.isActive ? 'active' : 'inactive'}`}>{facility.isActive ? 'Active' : 'Inactive'}</span></div>
          <h3>{showValue(facility.name)}</h3>
          <p className="admin-facility-type">{showValue(facility.facilityType)}</p>
          <dl>
            <div><dt>Village / Mandal</dt><dd>{showValue([facility.village, facility.mandal].filter(Boolean).join(' / '))}</dd></div>
            <div><dt>District</dt><dd>{showValue(facility.district)}</dd></div>
            <div><dt>Contact</dt><dd>{showValue(facility.phone)}</dd></div>
            <div><dt>Beds</dt><dd>{showValue(facility.beds)}</dd></div>
          </dl>
          <button className="admin-facilities-button open" type="button" onClick={() => navigate(`/admin/facilities/${encodeURIComponent(facility._id)}`, { state: { from: `${location.pathname}${location.search}` } })}>
            Open details <ExternalLink size={14}/>
          </button>
        </article>)}
      </div>
      {pagination?.pages > 1 && <div className="admin-facilities-pagination">
        <button className="admin-facilities-button secondary" type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>Previous</button>
        <span>Page {page} of {pagination.pages}</span>
        <button className="admin-facilities-button secondary" type="button" disabled={page >= pagination.pages} onClick={() => setPage(current => current + 1)}>Next</button>
      </div>}
    </>}
  </section>;
}

export function AdminFacilityDetailsPage() {
  const { facilityId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [facility, setFacility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(() => new URLSearchParams(location.search).get('edit') === '1');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getAdminFacility(facilityId)
      .then(data => {
        if (!active) return;
        setFacility(data);
        setForm({
          registrationNumber: data.registrationNumber || '',
          facilityType: data.facilityType || '',
          village: data.village || '',
          mandal: data.mandal || '',
          district: data.district || '',
          postalCode: data.postalCode || '',
          phone: data.phone || '',
          address: data.address || '',
          workingHours: data.workingHours || '',
          beds: data.beds ?? '',
          services: (data.services || []).join('\n'),
          isActive: Boolean(data.isActive)
        });
      })
      .catch(cause => { if (active) setError(cause.message || 'Unable to load this facility.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [facilityId]);

  const back = () => navigate(location.state?.from || '/admin/dashboard?voicePage=facilities');
  const closeEditing = () => {
    setEditing(false);
    setSaveError('');
    if (new URLSearchParams(location.search).has('edit')) {
      navigate(location.pathname, { replace: true, state: location.state });
    }
  };
  const updateForm = event => setForm(current => ({ ...current, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveMessage('');
    try {
      const updated = await updateAdminFacility(facilityId, {
        registrationNumber: form.registrationNumber.trim(),
        facilityType: form.facilityType.trim(),
        village: form.village.trim(),
        mandal: form.mandal.trim(),
        district: form.district.trim(),
        ...(form.postalCode.trim() ? { postalCode: form.postalCode.trim() } : {}),
        phone: form.phone.trim(),
        address: form.address.trim(),
        workingHours: form.workingHours.trim(),
        beds: form.beds === '' ? 0 : Number(form.beds),
        services: form.services.split(/\r?\n|,/).map(service => service.trim()).filter(Boolean),
        isActive: form.isActive
      });
      setFacility(current => ({ ...current, ...updated }));
      setEditing(false);
      setSaveMessage('Facility details updated.');
      if (new URLSearchParams(location.search).has('edit')) {
        navigate(location.pathname, { replace: true, state: location.state });
      }
    } catch (cause) {
      setSaveError(cause.message || 'Unable to save facility changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="admin-facility-detail-shell"><div className="admin-facilities-state" role="status"><span className="spinner"/>Loading facility details…</div></main>;
  if (error || !facility) return <main className="admin-facility-detail-shell">
    <button className="admin-facilities-button secondary" onClick={back} type="button"><ArrowLeft size={15}/>Back to Facilities</button>
    <div className="admin-facilities-state error" role="alert"><b>Facility details unavailable</b><p>{error || 'Facility not found.'}</p></div>
  </main>;

  return <main className="admin-facility-detail-shell">
    <div className="admin-facility-detail-actions">
      <button className="admin-facilities-button secondary" onClick={back} type="button"><ArrowLeft size={15}/>Back to Facilities</button>
      {!editing && <button className="admin-facilities-button" onClick={() => { setEditing(true); setSaveError(''); }} type="button">Edit Facility</button>}
    </div>
    <header className="admin-facility-detail-hero">
      <span className="admin-facility-icon" aria-hidden="true">⌖</span>
      <div><p className="section-overline">SUPER ADMIN · FACILITY DETAILS</p><h1>{showValue(facility.name)}</h1><p>{showValue(facility.facilityType)} · {showValue([facility.village, facility.mandal, facility.district].filter(Boolean).join(', '))}</p></div>
      <span className={`admin-facility-status ${facility.isActive ? 'active' : 'inactive'}`}>{facility.isActive ? 'Active' : 'Inactive'}</span>
    </header>

    {saveMessage && <div className="admin-facility-notice" role="status">{saveMessage}</div>}
    {editing && <form className="admin-facility-edit panel" onSubmit={save}>
      <div className="admin-facilities-heading"><div><h2>Edit Facility</h2><p>Only fields supported by the existing facility record can be changed.</p></div></div>
      <div className="admin-facility-edit-grid">
        <label>Facility type<input name="facilityType" value={form.facilityType} onChange={updateForm} maxLength="100" required/></label>
        <label>Registration number<input name="registrationNumber" value={form.registrationNumber} onChange={updateForm} maxLength="100"/></label>
        <label>Village<input name="village" value={form.village} onChange={updateForm} maxLength="120" required/></label>
        <label>Mandal<input name="mandal" value={form.mandal} onChange={updateForm} maxLength="120"/></label>
        <label>District<input name="district" value={form.district} onChange={updateForm} maxLength="120"/></label>
        <label>Postal code<input name="postalCode" value={form.postalCode} onChange={updateForm} inputMode="numeric" pattern="[0-9]{6}" maxLength="6"/></label>
        <label>Contact number<input name="phone" value={form.phone} onChange={updateForm} maxLength="30"/></label>
        <label>Bed count<input name="beds" type="number" min="0" max="100000" step="1" value={form.beds} onChange={updateForm}/></label>
        <label className="wide">Address<input name="address" value={form.address} onChange={updateForm} maxLength="500"/></label>
        <label className="wide">Operating hours<input name="workingHours" value={form.workingHours} onChange={updateForm} maxLength="500"/></label>
        <label className="wide">Available services<textarea name="services" value={form.services} onChange={updateForm} rows="3" maxLength="3000" placeholder="One service per line"/></label>
        <label className="admin-facility-active-toggle"><input name="isActive" type="checkbox" checked={form.isActive} onChange={updateForm}/> Facility is active</label>
      </div>
      {saveError && <p className="admin-facility-save-error" role="alert">{saveError}</p>}
      <div className="admin-facility-edit-actions"><button className="admin-facilities-button secondary" type="button" onClick={closeEditing}>Cancel</button><button className="admin-facilities-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
    </form>}

    <div className="admin-facility-detail-grid">
      <DetailSection title="Facility information">
        <Detail label="Facility ID" value={facility.facilityId || facility.hospitalId}/>
        <Detail label="MongoDB ID" value={facility._id}/>
        <Detail label="Facility type" value={facility.facilityType}/>
        <Detail label="Registration number" value={facility.registrationNumber}/>
        <Detail label="Registered" value={facility.createdAt ? new Date(facility.createdAt).toLocaleDateString() : null}/>
        <Detail label="Status" value={facility.isActive ? 'Active' : 'Inactive'}/>
      </DetailSection>
      <DetailSection title="Location and contact">
        <Detail label="Village" value={facility.village}/>
        <Detail label="Mandal" value={facility.mandal}/>
        <Detail label="District" value={facility.district}/>
        <Detail label="Postal code" value={facility.postalCode}/>
        <Detail label="Complete address" value={displayAddress(facility)}/>
        <Detail label="Contact number" value={facility.phone}/>
      </DetailSection>
      <DetailSection title="Capacity and operations">
        <Detail label="Bed count / hospital capacity" value={facility.beds}/>
        <Detail label="Operating hours" value={facility.workingHours}/>
        <Detail label="Medical equipment" value={facility.equipment}/>
        <Detail label="Appointment count" value={facility.appointments?.total}/>
        {facility.appointments?.byStatus?.length ? facility.appointments.byStatus.map(item => <Detail key={item._id} label={`Appointments · ${item._id}`} value={item.count}/>) : <Detail label="Appointments by status" value={null}/>}
      </DetailSection>
      <DetailSection title="Healthcare services">
        {facility.services?.length ? <ul className="admin-facility-services">{facility.services.map((service, index) => <li key={`${service}-${index}`}>{service}</li>)}</ul> : <Detail label="Available services" value={null}/>}
      </DetailSection>
      <DetailSection title="Medical officer">
        <Detail label="Name" value={facility.medicalOfficer?.name}/>
        <Detail label="Role / designation" value={facility.medicalOfficer?.designation || facility.medicalOfficer?.role}/>
        <Detail label="Phone" value={facility.medicalOfficer?.phone}/>
        <Detail label="Staff ID" value={facility.medicalOfficer?.staffId}/>
      </DetailSection>
      <DetailSection title={`Doctors (${facility.doctors?.length || 0})`}>
        {facility.doctors?.length ? <div className="admin-facility-people">{facility.doctors.map(doctor => <article key={doctor._id}><b>{showValue(doctor.name)}</b><span>Email: {showValue(doctor.email)}</span><span>Specialization: {showValue(doctor.doctorProfile?.specialization)}</span><span>Qualifications: {showValue(doctor.doctorProfile?.qualifications)}</span><span>Registration: {showValue(doctor.doctorProfile?.registrationNumber)}</span><span>Experience: {doctor.doctorProfile?.yearsExperience == null ? unavailable : `${doctor.doctorProfile.yearsExperience} years`}</span><span>Phone: {showValue(doctor.phone)}</span><span>Approval: {showValue(doctor.approvalStatus)}</span><span>Staff ID: {showValue(doctor.staffId)}</span></article>)}</div> : <Detail label="Doctors" value={null}/>}
      </DetailSection>
      <DetailSection title={`Other staff (${facility.staff?.length || 0})`}>
        {facility.staff?.length ? <div className="admin-facility-people">{facility.staff.map(person => <article key={person._id}><b>{showValue(person.name)}</b><span>Email: {showValue(person.email)}</span><span>Role / designation: {showValue(person.designation || person.role)}</span><span>Phone: {showValue(person.phone)}</span><span>Employment: {showValue(person.employmentStatus)}</span><span>Staff ID: {showValue(person.staffId)}</span></article>)}</div> : <Detail label="Staff" value={null}/>}
      </DetailSection>
      <DetailSection title="Facility manager">
        <Detail label="Name" value={facility.manager?.name}/>
        <Detail label="Email" value={facility.manager?.email}/>
        <Detail label="Contact number" value={facility.manager?.phone}/>
        <Detail label="Manager ID" value={facility.manager?.staffId}/>
      </DetailSection>
    </div>
  </main>;
}

function DetailSection({ title, children }) {
  return <section className="admin-facility-detail-section panel"><h2>{title}</h2><div className="admin-facility-fields">{children}</div></section>;
}

function Detail({ label, value }) {
  return <div className="admin-facility-field"><span>{label}</span><b>{showValue(value)}</b></div>;
}
