import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sampleFacilities, facilityCategories } from '../data/sampleFacilities.js';
import { createClinicalReferral } from '../services/api.js';

const categoryKeys = {
  'All categories': 'allCategories', PHC: 'phc', CHC: 'chc',
  'Government hospital': 'governmentHospital', 'Specialist hospital': 'specialistHospital',
  'Dental service': 'dentalService'
};

export function MapsPage({ role, patients = [], hospitals = [], onReferralSaved, mini = false, onExplore }) {
  const { t } = useTranslation();
  const [category, setCategory] = useState('All categories');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [selected, setSelected] = useState(sampleFacilities[0]);
  const [coords, setCoords] = useState(null);
  const [geoState, setGeoState] = useState('idle');
  const [patientId, setPatientId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const visible = useMemo(() => sampleFacilities.filter(item =>
    (category === 'All categories' || item.category === category) &&
    `${item.name} ${item.category} ${item.area} ${item.address}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (!location.trim() || `${item.area} ${item.address}`.toLowerCase().includes(location.trim().toLowerCase()))
  ), [category, query, location]);
  const selectedHospital = hospitals.find(hospital => hospital.name === selected.name && hospital.isActive !== false);

  function locate() {
    setError('');
    if (!navigator.geolocation) { setGeoState('unavailable'); return; }
    setGeoState('loading');
    navigator.geolocation.getCurrentPosition(position => {
      setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      setGeoState('success');
    }, () => setGeoState('denied'), { enableHighAccuracy: true, timeout: 10000 });
  }
  async function refer(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await createClinicalReferral(patientId, { hospital: selectedHospital._id, reason });
      setMessage(t('maps.referralSaved', { patient: patients.find(item => item._id === patientId)?.name || t('maps.patient') }));
      setReason(''); onReferralSaved?.();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const directions = facility => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${facility.address}`)}&travelmode=driving`;
  if (mini) return <section className="panel maps-overview-card"><div className="panel-heading"><div><h2>{t('maps.careLocations')}</h2><p>{t('maps.nearbyExplore')}</p></div><button className="text-link" onClick={onExplore}>{t('maps.openMaps')}</button></div><div className="mini-map-wrap"><div className="demo-map mini-demo-map"><div className="map-grid-lines"/><svg className="map-route-lines" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M50 50 Q 45 43 18 31"/><path d="M5 22 Q22 30 35 23 T67 25 T96 17 M4 57 Q22 48 36 56 T70 55 T96 63 M8 90 Q29 77 43 84 T77 81 T96 89" className="map-road"/></svg>{sampleFacilities.map(item => <span key={item.id} className="facility-map-pin mini-pin" style={{ '--pin-color': item.color, left: `${item.x}%`, top: `${item.y}%` }}>✚</span>)}<div className="map-scale">{t('maps.sampleMap')}</div></div><div className="mini-map-categories">{facilityCategories.slice(1).map(value => <span key={value}>✚ {t(`maps.${categoryKeys[value]}`)}</span>)}</div></div></section>;
  return <div className="maps-workspace">
    <div className="maps-demo-note"><span>ⓘ</span><div><b>{t('maps.demonstration')}</b><small>{t('maps.sampleDisclaimer')}</small></div></div>
    <section className="map-controls panel">
      <label className="map-search">{t('maps.searchName')}<input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('maps.searchPlaceholder')} /></label>
      <label className="map-search">{t('maps.villageMandalPin')}<input value={location} onChange={event => setLocation(event.target.value)} placeholder={t('maps.locationPlaceholder')} /></label>
      <label className="map-category">{t('maps.category')}<select value={category} onChange={event => setCategory(event.target.value)}>{facilityCategories.map(value => <option key={value} value={value}>{t(`maps.${categoryKeys[value]}`)}</option>)}</select></label>
      <button className="map-locate" onClick={locate} disabled={geoState === 'loading'}>⌖ {geoState === 'loading' ? t('maps.locating') : t('maps.useLocation')}</button>
      {geoState === 'success' && <span className="location-state">{t('maps.locationGranted', { coords: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` })}</span>}
      {geoState === 'denied' && <span className="location-state muted">{t('maps.locationDenied')}</span>}
      {geoState === 'unavailable' && <span className="location-state muted">{t('maps.locationUnsupported')}</span>}
    </section>
    <div className="map-results-layout">
      <section className="demo-map" aria-label={t('maps.demoFacilitiesMap')}>
        <div className="map-grid-lines"/><svg className="map-route-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={`M50 50 Q 45 43 ${selected.x} ${selected.y}`} /><path d="M5 22 Q22 30 35 23 T67 25 T96 17 M4 57 Q22 48 36 56 T70 55 T96 63 M8 90 Q29 77 43 84 T77 81 T96 89" className="map-road"/></svg>
        <span className="map-label map-label-a">{t('maps.demoBlock')}</span><span className="map-label map-label-b">{t('maps.sampleMandal')}</span>
        {coords && <span className="user-map-pin" title={t('maps.useLocation')}>●<small>{t('maps.you')}</small></span>}
        {visible.map(facility => <button key={facility.id} className={`facility-map-pin ${selected.id === facility.id ? 'pin-selected' : ''}`} style={{ '--pin-color': facility.color, left: `${facility.x}%`, top: `${facility.y}%` }} onClick={() => setSelected(facility)} title={facility.name}><span>✚</span><small>{t(`maps.${categoryKeys[facility.category]}`)}</small></button>)}
        <div className="map-scale">{t('maps.sampleMap')}</div>
      </section>
      <aside className="map-facility-list">
        <div className="map-list-heading"><div><h2>{t('maps.nearbyOptions')}</h2><p>{t('maps.sampleFacilities', { count: visible.length })}</p></div><span className="demo-tag">{t('maps.sample')}</span></div>
        {visible.length ? visible.map(facility => <button key={facility.id} onClick={() => setSelected(facility)} className={`facility-result ${selected.id === facility.id ? 'facility-active' : ''}`} style={{ '--pin-color': facility.color }}>
          <span className="facility-symbol">✚</span><span className="facility-copy"><b>{facility.name}</b><small>{t(`maps.${categoryKeys[facility.category]}`)} · {facility.area}</small><small>{facility.address}</small><small>{facility.phone}</small></span><span className="facility-distance"><b>{facility.distanceKm} km</b><small>{facility.minutes} min*</small></span>
        </button>) : <div className="map-empty">{t('maps.noMatches')}</div>}
        {selected && <div className="map-selected-detail"><span className="demo-tag">{t('maps.routePreview')}</span><h3>{selected.name}</h3><p>{t('maps.distanceTime', { distance: selected.distanceKm, minutes: selected.minutes })}</p><a href={directions(selected)} target="_blank" rel="noreferrer">{t('maps.directions')}</a><small>{t('maps.estimateNote')}</small></div>}
      </aside>
    </div>
    {role === 'doctor' && <section className="panel map-referral-form"><div className="panel-heading"><div><h2>{t('maps.referralTitle')}</h2><p>{t('maps.referralHelp')}</p></div><span className="demo-tag">{t('maps.doctorAction')}</span></div>
      <form onSubmit={refer}><label>{t('maps.patient')}<select value={patientId} required onChange={event => setPatientId(event.target.value)}><option value="">{t('maps.selectPatient')}</option>{patients.map(patient => <option key={patient._id} value={patient._id}>{patient.name} · {patient.patientId}</option>)}</select></label><label>{t('maps.selectedFacility')}<input readOnly value={`${selected.name} — ${t(`maps.${categoryKeys[selected.category]}`)}`} /></label><label>{t('maps.recommendation')}<textarea required maxLength={1500} value={reason} onChange={event => setReason(event.target.value)} placeholder={t('maps.reasonPlaceholder')} /></label><button className="auth-submit" disabled={busy || !patients.length || !selectedHospital}>{busy ? t('maps.savingReferral') : !selectedHospital ? t('maps.demoNotSeeded') : t('maps.saveReferral')}</button></form>
      {message && <p className="api-success" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    </section>}
  </div>;
}
