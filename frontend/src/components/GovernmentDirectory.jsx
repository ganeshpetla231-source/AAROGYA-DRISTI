import { useEffect, useMemo, useState } from 'react';
import { BedDouble, Building2, Copy, Hospital, Mail, MapPin, Phone, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getGovernmentDirectory } from '../services/api.js';
import './government-directory.css';

const mandals = ['Ananthagiri', 'Araku Valley', 'Chintapalli', 'Dumbriguda', 'G. Madugula', 'G.K. Veedhi', 'Hukumpeta', 'Koyyuru', 'Munchingiputtu', 'Paderu', 'Pedabayalu'];

export default function GovernmentDirectory() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [directory, setDirectory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mandal, setMandal] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');

  async function loadDirectory() {
    setLoading(true);
    setError('');
    try { setDirectory(await getGovernmentDirectory()); }
    catch (failure) { setError(failure.message || t('governmentDirectory.loadError')); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadDirectory(); }, []);

  const phcs = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return (directory?.phcs || []).filter(item =>
      (!mandal || item.mandal === mandal) &&
      (!search || `${item.name} ${item.mandal} ${item.postalCode} ${item.phone}`.toLocaleLowerCase().includes(search))
    );
  }, [directory, mandal, query]);

  async function copyNumber(number) {
    try {
      await navigator.clipboard.writeText(number);
      setCopyStatus(t('governmentDirectory.copied'));
    } catch {
      setCopyStatus(t('governmentDirectory.copyFailed'));
    }
    window.setTimeout(() => setCopyStatus(''), 2500);
  }

  function viewDetails(item) {
    if (user?.role === 'admin') {
      navigate(`/admin/facilities/${encodeURIComponent(item._id)}`, { state: { from: `${location.pathname}${location.search}` } });
      return;
    }
    setSelected(item);
  }

  return <section className="government-directory" aria-busy={loading}>
    <header className="government-directory-heading">
      <div><p className="government-directory-kicker">ITDA PADERU</p><h2>{t('governmentDirectory.title')}</h2><p>{t('governmentDirectory.description')}</p></div>
      <span className="government-directory-mark" aria-hidden="true"><Hospital size={28}/></span>
    </header>

    {error && <div className="directory-error" role="alert"><span>{error}</span><button type="button" onClick={loadDirectory}>{t('governmentDirectory.retry')}</button></div>}
    {loading && !directory && <div className="directory-loading" role="status">{t('governmentDirectory.loading')}</div>}

    {directory && <>
      <div className="directory-summary" aria-label={t('governmentDirectory.summary')}>
        {[
          [Hospital, t('governmentDirectory.totalHospitals'), directory.summary.hospitals],
          [Building2, t('governmentDirectory.totalPhcs'), directory.summary.phcs],
          [MapPin, t('governmentDirectory.totalMandals'), directory.summary.mandals],
          [BedDouble, t('governmentDirectory.listedBeds'), directory.summary.beds]
        ].map(([Icon, label, value]) => <article className="directory-summary-card" key={label}><span><Icon size={19}/></span><div><b>{loading ? '—' : value}</b><small>{label}</small></div></article>)}
      </div>

      <section className="directory-section" aria-labelledby="directory-hospitals-title">
        <div className="directory-section-heading"><div><p className="government-directory-kicker">ITDA PADERU</p><h3 id="directory-hospitals-title">{t('governmentDirectory.hospitalsHeading')}</h3></div><span className="directory-count">{directory.hospitals.length}</span></div>
        {directory.hospitals.length ? <div className="directory-hospital-grid">{directory.hospitals.map(item => <article className="directory-hospital-card" key={item._id}>
          <div className="directory-card-icon"><Hospital size={21}/></div><div className="directory-card-main"><h4>{item.name}</h4><span className="directory-type">{item.facilityType}</span>
            <p><MapPin size={15}/>{item.village}, {item.district} District</p>
            <p><BedDouble size={15}/>{t('governmentDirectory.beds', { count: item.beds })}</p>
            {item.phone ? <a className="directory-contact" href={`tel:${item.phone}`}><Phone size={15}/>{item.phone}</a> : <span className="directory-muted">{t('governmentDirectory.noVerifiedContact')}</span>}
          </div><button type="button" className="directory-details-button" onClick={() => viewDetails(item)}>{t('governmentDirectory.viewDetails')}</button>
        </article>)}</div> : <div className="directory-empty">{t('governmentDirectory.emptyHospitals')}</div>}
      </section>

      <section className="directory-section" aria-labelledby="directory-phcs-title">
        <div className="directory-section-heading"><div><p className="government-directory-kicker">{t('governmentDirectory.primaryCare')}</p><h3 id="directory-phcs-title">{t('governmentDirectory.phcsHeading')}</h3></div><span className="directory-count">{phcs.length} / {directory.summary.phcs}</span></div>
        <div className="directory-filters">
          <label><span>{t('governmentDirectory.selectMandal')}</span><select value={mandal} onChange={event => setMandal(event.target.value)}>
            <option value="">{t('governmentDirectory.allMandals')}</option>{mandals.map(name => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <label className="directory-search"><span><Search size={16}/>{t('governmentDirectory.searchLabel')}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('governmentDirectory.searchPlaceholder')} maxLength={120}/></label>
        </div>
        {phcs.length ? <div className="directory-phc-grid">{phcs.map(item => <article className="directory-phc-card" key={item._id}>
          <div className="directory-card-icon is-primary"><Building2 size={19}/></div><div className="directory-card-main"><h4>{item.name}</h4><span className="directory-type">{t('governmentDirectory.phcType')}</span><p><MapPin size={15}/>{item.mandal} Mandal</p><p><span className="directory-pin-label">PIN</span>{item.postalCode}</p><a className="directory-contact" href={`tel:${item.phone}`}><Phone size={15}/>{item.phone}</a></div>
          <div className="directory-card-actions"><a className="directory-call-button" href={`tel:${item.phone}`}><Phone size={15}/>{t('governmentDirectory.callNow')}</a><button type="button" className="directory-copy-button" onClick={() => copyNumber(item.phone)}><Copy size={15}/>{t('governmentDirectory.copyNumber')}</button><button type="button" className="directory-details-button" onClick={() => viewDetails(item)}>{t('governmentDirectory.viewDetails')}</button></div>
        </article>)}</div> : <div className="directory-empty" role="status">{t('governmentDirectory.emptyPhcs')}</div>}
        <p className="directory-copy-status" role="status" aria-live="polite">{copyStatus}</p>
      </section>

      <section className="directory-dmho" aria-labelledby="directory-dmho-title">
        <div className="directory-dmho-icon"><Hospital size={22}/></div><div className="directory-dmho-copy"><p className="government-directory-kicker">{t('governmentDirectory.districtOffice')}</p><h3 id="directory-dmho-title">{directory.dmho.name}</h3><p><Phone size={15}/>{directory.dmho.phone}</p><p><Mail size={15}/>{directory.dmho.email}</p></div>
        <div className="directory-dmho-actions"><a href={`tel:${directory.dmho.phone}`}><Phone size={15}/>{t('governmentDirectory.callDmho')}</a><a href={`mailto:${directory.dmho.email}`}><Mail size={15}/>{t('governmentDirectory.emailDmho')}</a></div>
      </section>
      <p className="directory-disclaimer">{t('governmentDirectory.disclaimer')}</p>
    </>}

    {selected && <div className="directory-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="directory-modal" role="dialog" aria-modal="true" aria-labelledby="directory-modal-title">
        <button className="directory-modal-close" type="button" onClick={() => setSelected(null)} aria-label={t('governmentDirectory.close')}><X size={20}/></button>
        <span className="directory-card-icon"><Hospital size={22}/></span><p className="government-directory-kicker">{selected.facilityType}</p><h3 id="directory-modal-title">{selected.name}</h3>
        <div className="directory-modal-details">
          <DirectoryDetail label="Facility ID" value={selected.hospitalId || selected.directoryKey || selected._id}/>
          <DirectoryDetail label="Facility type" value={selected.facilityType}/>
          <DirectoryDetail label="Village" value={selected.village}/>
          <DirectoryDetail label="Mandal" value={selected.mandal}/>
          <DirectoryDetail label="District" value={selected.district}/>
          <DirectoryDetail label="Complete address" value={selected.address}/>
          <DirectoryDetail label="Contact number" value={selected.phone}/>
          <DirectoryDetail label="Postal code" value={selected.postalCode}/>
          <DirectoryDetail label="Bed capacity" value={selected.beds}/>
          <DirectoryDetail label="Operating hours" value={selected.workingHours}/>
          <DirectoryDetail label="Medical equipment" value={null}/>
          <DirectoryDetail label="Available services" value={selected.services?.length ? selected.services.join(', ') : null}/>
          <DirectoryDetail label="Registration number" value={selected.registrationNumber}/>
        </div>
        {selected.phone ? <a className="directory-call-button" href={`tel:${selected.phone}`}><Phone size={15}/>{t('governmentDirectory.callNow')} · {selected.phone}</a> : <span className="directory-muted">{t('governmentDirectory.noVerifiedContact')}</span>}
      </section>
    </div>}
  </section>;
}

function DirectoryDetail({ label, value }) {
  const display = value === undefined || value === null || value === '' ? 'Not Available' : value;
  return <div className="directory-modal-detail"><span>{label}</span><b>{display}</b></div>;
}
