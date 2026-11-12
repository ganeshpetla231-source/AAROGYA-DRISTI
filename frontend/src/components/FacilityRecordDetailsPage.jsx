import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { getResourceRecord, updateResource } from '../services/api.js';
import './admin-facilities.css';

const unavailable = 'Not Available';
const showValue = value => value === undefined || value === null || value === ''
  ? unavailable
  : Array.isArray(value) ? value.length ? value.join(', ') : unavailable
    : typeof value === 'object' ? unavailable : value;

export function FacilityRecordDetailsPage() {
  const { facilityId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [facility, setFacility] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const canEdit = ['admin', 'hospital'].includes(user?.role);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getResourceRecord('hospitals', facilityId)
      .then(record => {
        if (!active) return;
        setFacility(record);
        setForm({
          registrationNumber: record.registrationNumber || '',
          facilityType: record.facilityType || '',
          village: record.village || '',
          mandal: record.mandal || '',
          district: record.district || '',
          postalCode: record.postalCode || '',
          phone: record.phone || '',
          address: record.address || '',
          workingHours: record.workingHours || '',
          beds: record.beds ?? '',
          services: (record.services || []).join('\n'),
          isActive: Boolean(record.isActive)
        });
      })
      .catch(cause => { if (active) setError(cause.message || 'Unable to load facility details.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [facilityId]);

  const dashboardPath = ['patient', 'doctor', 'admin'].includes(user?.role) ? `/${user.role}/dashboard` : `/app/${user?.role || 'admin'}`;
  const back = () => navigate(location.state?.from || `${dashboardPath}?voicePage=facilities`);
  const setField = event => setForm(current => ({
    ...current,
    [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value
  }));
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError('');
    setNotice('');
    try {
      const updated = await updateResource('hospitals', facilityId, {
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
        services: form.services.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean),
        isActive: form.isActive
      });
      setFacility(current => ({ ...current, ...updated }));
      setEditing(false);
      setNotice('Facility details updated.');
    } catch (cause) {
      setSaveError(cause.message || 'Unable to save facility changes.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="admin-facility-detail-shell"><div className="admin-facilities-state" role="status"><span className="spinner"/>Loading facility details…</div></main>;
  if (error || !facility) return <main className="admin-facility-detail-shell">
    <button className="admin-facilities-button secondary" type="button" onClick={back}><ArrowLeft size={15}/>Back to Facilities</button>
    <div className="admin-facilities-state error" role="alert"><b>Facility details unavailable</b><p>{error || 'Facility not found.'}</p></div>
  </main>;

  const locationLabel = [facility.village, facility.mandal, facility.district].filter(Boolean).join(', ');
  const coordinates = facility.coordinates && [facility.coordinates.latitude, facility.coordinates.longitude].every(Number.isFinite)
    ? `${facility.coordinates.latitude}, ${facility.coordinates.longitude}`
    : null;

  return <main className="admin-facility-detail-shell">
    <div className="admin-facility-detail-actions">
      <button className="admin-facilities-button secondary" type="button" onClick={back}><ArrowLeft size={15}/>Back to Facilities</button>
      {canEdit && !editing && <button className="admin-facilities-button" type="button" onClick={() => { setEditing(true); setSaveError(''); }}>Edit details</button>}
    </div>
    <header className="admin-facility-detail-hero">
      <span className="admin-facility-icon" aria-hidden="true">⌖</span>
      <div><p className="section-overline">FACILITY DETAILS</p><h1>{showValue(facility.name)}</h1><p>{showValue(facility.facilityType)} · {showValue(locationLabel)}</p></div>
      <span className={`admin-facility-status ${facility.isActive ? 'active' : 'inactive'}`}>{facility.isActive ? 'Active' : 'Inactive'}</span>
    </header>

    {notice && <div className="admin-facility-notice" role="status">{notice}</div>}
    {editing && <form className="admin-facility-edit panel" onSubmit={save}>
      <div className="admin-facilities-heading"><div><h2>Edit facility details</h2><p>Changes are saved to the existing facility record.</p></div></div>
      <div className="admin-facility-edit-grid">
        <label>Facility type<input name="facilityType" value={form.facilityType} onChange={setField} maxLength="100" required/></label>
        <label>Registration number<input name="registrationNumber" value={form.registrationNumber} onChange={setField} maxLength="100"/></label>
        <label>Village<input name="village" value={form.village} onChange={setField} maxLength="120" required/></label>
        <label>Mandal<input name="mandal" value={form.mandal} onChange={setField} maxLength="120"/></label>
        <label>District<input name="district" value={form.district} onChange={setField} maxLength="120"/></label>
        <label>Postal code<input name="postalCode" value={form.postalCode} onChange={setField} inputMode="numeric" pattern="[0-9]{6}" maxLength="6"/></label>
        <label>Contact number<input name="phone" value={form.phone} onChange={setField} maxLength="30"/></label>
        <label>Bed count<input name="beds" type="number" min="0" max="100000" step="1" value={form.beds} onChange={setField}/></label>
        <label className="wide">Address<input name="address" value={form.address} onChange={setField} maxLength="500"/></label>
        <label className="wide">Operating hours<input name="workingHours" value={form.workingHours} onChange={setField} maxLength="500"/></label>
        <label className="wide">Available services<textarea name="services" value={form.services} onChange={setField} rows="3" maxLength="3000" placeholder="One service per line"/></label>
        <label className="admin-facility-active-toggle"><input name="isActive" type="checkbox" checked={form.isActive} onChange={setField}/> Facility is active</label>
      </div>
      {saveError && <p className="admin-facility-save-error" role="alert">{saveError}</p>}
      <div className="admin-facility-edit-actions">
        <button className="admin-facilities-button secondary" type="button" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
        <button className="admin-facilities-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>}

    <div className="admin-facility-detail-grid">
      <DetailSection title="Facility information">
        <Detail label="Facility ID" value={facility.hospitalId || facility._id}/>
        <Detail label="Registration number" value={facility.registrationNumber}/>
        <Detail label="Facility type" value={facility.facilityType}/>
        <Detail label="Status" value={facility.isActive ? 'Active' : 'Inactive'}/>
        <Detail label="Created" value={facility.createdAt ? new Date(facility.createdAt).toLocaleString() : null}/>
        <Detail label="Last updated" value={facility.updatedAt ? new Date(facility.updatedAt).toLocaleString() : null}/>
      </DetailSection>
      <DetailSection title="Location and contact">
        <Detail label="Village" value={facility.village}/>
        <Detail label="Mandal" value={facility.mandal}/>
        <Detail label="District" value={facility.district}/>
        <Detail label="Postal code" value={facility.postalCode}/>
        <Detail label="Address" value={facility.address}/>
        <Detail label="Contact number" value={facility.phone}/>
        <Detail label="Coordinates" value={coordinates}/>
      </DetailSection>
      <DetailSection title="Capacity and operations">
        <Detail label="Bed count" value={facility.beds}/>
        <Detail label="Operating hours" value={facility.workingHours}/>
      </DetailSection>
      <DetailSection title="Healthcare services">
        {facility.services?.length ? <ul className="admin-facility-services">{facility.services.map((service, index) => <li key={`${service}-${index}`}>{service}</li>)}</ul> : <Detail label="Available services" value={null}/>}
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
