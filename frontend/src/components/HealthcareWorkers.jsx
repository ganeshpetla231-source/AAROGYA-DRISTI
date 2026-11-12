import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Edit2, Eye, Plus, RefreshCw, Search, UserRound, X } from 'lucide-react';
import { createHealthcareWorker, getHealthcareWorker, getHealthcareWorkerStats, getHealthcareWorkers, getResource, setHealthcareWorkerStatus, updateHealthcareWorker } from '../services/api.js';
import './healthcareWorkers.css';

const blankForm = { staffId: '', name: '', role: 'asha', phone: '', email: '', designation: '', facility: '', mandal: '', village: '', district: '', employmentStatus: 'active', joinedAt: '', photoUrl: '' };
const roleOptions = ['asha', 'anm', 'cho', 'doctor', 'specialist', 'district'];

export function HealthcareWorkers({ role = 'admin', district = '' }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
  const canEdit = ['admin', 'district'].includes(role);
  const [filters, setFilters] = useState({ q: '', role: '', mandal: '', village: '', facility: '', status: '' });
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState('asc');
  const [result, setResult] = useState({ items: [], total: 0, pages: 0 });
  const [stats, setStats] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirming, setConfirming] = useState(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setBusy(true);
    setError('');
    try {
      const params = Object.fromEntries(Object.entries({ ...filters, page, limit: 10, sortBy: 'staffId', sortOrder }).filter(([, value]) => value !== ''));
      const [directory, summary] = await Promise.all([getHealthcareWorkers(params), getHealthcareWorkerStats()]);
      if (requestVersion.current === version) {
        setResult(directory);
        setStats(summary);
      }
    } catch (failure) {
      if (requestVersion.current === version) setError(failure.message);
    } finally { if (requestVersion.current === version) setBusy(false); }
  }, [filters, page, sortOrder]);

  useEffect(() => {
    const timer = window.setTimeout(load, 220);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    getResource('hospitals', { limit: 100 }).then(response => setFacilities(response.items || [])).catch(failure => setError(failure.message));
  }, []);
  useEffect(() => {
    if (!modal && !confirming) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape' && !formBusy) { setModal(null); setConfirming(null); } };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [modal, confirming, formBusy]);

  function changeFilter(key, value) {
    setFilters(current => ({ ...current, [key]: value }));
    setPage(1);
  }
  function openCreate() {
    setForm({ ...blankForm, joinedAt: new Date().toISOString().slice(0, 10), district });
    setFormError('');
    setModal({ type: 'edit' });
  }
  async function openEdit(worker) {
    setForm({
      ...blankForm,
      ...worker,
      facility: worker.facility?._id || worker.facility || '',
      joinedAt: worker.joinedAt ? new Date(worker.joinedAt).toISOString().slice(0, 10) : '',
      photoUrl: worker.photoUrl || ''
    });
    setFormError('');
    setModal({ type: 'edit', worker });
  }
  async function openProfile(worker) {
    setModal({ type: 'profile', worker: null });
    try { setModal({ type: 'profile', worker: await getHealthcareWorker(worker._id) }); }
    catch (failure) { setModal(null); setError(failure.message); }
  }
  async function saveWorker(event) {
    event.preventDefault();
    setFormBusy(true);
    setFormError('');
    const payload = { ...form, facility: form.facility, ...(form.email ? {} : { email: undefined }), ...(form.photoUrl ? {} : { photoUrl: undefined }) };
    try {
      if (modal.worker) await updateHealthcareWorker(modal.worker._id, payload);
      else await createHealthcareWorker(payload);
      setModal(null);
      await load();
    } catch (failure) { setFormError(failure.message); }
    finally { setFormBusy(false); }
  }
  async function changeStatus() {
    if (!confirming) return;
    try {
      await setHealthcareWorkerStatus(confirming._id, confirming.employmentStatus === 'active' ? 'inactive' : 'active');
      setConfirming(null);
      await load();
    } catch (failure) { setError(failure.message); setConfirming(null); }
  }
  function field(key, label, options = {}) {
    return <label className="worker-field" key={key}>{t(`workers.fields.${key}`)}{options.select
      ? <select required={options.required} value={form[key] || ''} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))}><option value="">{t('workers.choose')}</option>{options.select.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      : <input required={options.required} type={options.type || 'text'} maxLength={options.maxLength || 120} value={form[key] || ''} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} placeholder={options.placeholder || label}/>}</label>;
  }

  const roleLabel = value => t(`workers.roles.${value}`, { defaultValue: value });
  return <section className="worker-management" aria-label={t('workers.title')}>
    {stats && <div className="worker-stat-grid">
      {[
        [t('workers.stats.activeWorkers'), stats.totalActiveWorkers],
        [t('workers.stats.villages'), stats.assignedVillages],
        [t('workers.stats.phcs'), stats.activePhcs],
        [t('workers.stats.screened'), stats.patientsScreened],
        [t('workers.stats.review'), stats.awaitingClinicalReview],
        [t('workers.stats.pendingReferrals'), stats.referralsPending],
        [t('workers.stats.completedReferrals'), stats.referralsCompleted],
        [t('workers.stats.followUpsDue'), stats.followUpsDue],
        [t('workers.stats.followUpsCompleted'), stats.followUpsCompleted]
      ].map(([label, count]) => <article className="worker-stat" key={label}><span>{label}</span><strong>{count}</strong></article>)}
    </div>}
    {stats && <div className="worker-role-counts" aria-label={t('workers.workersByRole')}>{roleOptions.map(item => <span key={item}><b>{roleLabel(item)}</b>{stats.workersByRole[item] || 0}</span>)}</div>}
    {stats && <section className="panel worker-coverage"><div className="panel-heading"><div><h2>{t('workers.coverage')}</h2><p>{t('workers.coverageHelp')}</p></div></div>{stats.screeningCoverageByMandal.length ? <div className="worker-coverage-list">{stats.screeningCoverageByMandal.map(item => <div key={item.mandal}><span>{item.mandal}</span><span>{item.screenedPatients} / {item.totalPatients}</span><progress max={Math.max(item.totalPatients, 1)} value={item.screenedPatients}/></div>)}</div> : <p className="worker-muted">{t('workers.noCoverage')}</p>}</section>}
    <section className="panel worker-directory">
      <div className="worker-toolbar"><div><h2>{t('workers.directory')}</h2><p>{t('workers.directoryHelp')}</p></div><div className="worker-toolbar-actions"><button className="worker-secondary" type="button" onClick={load} aria-label={t('common.refresh')}><RefreshCw size={15}/>{t('common.refresh')}</button>{canEdit && <button className="worker-primary" type="button" onClick={openCreate}><Plus size={17}/>{t('workers.add')}</button>}</div></div>
      <div className="worker-filters">
        <label className="worker-search"><Search size={17}/><span className="sr-only">{t('workers.search')}</span><input value={filters.q} onChange={event => changeFilter('q', event.target.value)} placeholder={t('workers.searchPlaceholder')}/></label>
        <select aria-label={t('workers.filters.role')} value={filters.role} onChange={event => changeFilter('role', event.target.value)}><option value="">{t('workers.filters.allRoles')}</option>{roleOptions.map(item => <option key={item} value={item}>{roleLabel(item)}</option>)}</select>
        <input aria-label={t('workers.filters.mandal')} value={filters.mandal} onChange={event => changeFilter('mandal', event.target.value)} placeholder={t('workers.filters.mandal')}/>
        <input aria-label={t('workers.filters.village')} value={filters.village} onChange={event => changeFilter('village', event.target.value)} placeholder={t('workers.filters.village')}/>
        <select aria-label={t('workers.filters.facility')} value={filters.facility} onChange={event => changeFilter('facility', event.target.value)}><option value="">{t('workers.filters.allFacilities')}</option>{facilities.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
        <select aria-label={t('workers.filters.status')} value={filters.status} onChange={event => changeFilter('status', event.target.value)}><option value="">{t('workers.filters.allStatuses')}</option><option value="active">{t('workers.active')}</option><option value="inactive">{t('workers.inactive')}</option></select>
      </div>
      {error && <div className="api-alert" role="alert"><span>{error}</span><button type="button" onClick={load}>{t('common.retry')}</button></div>}
      {busy ? <div className="loading-state"><span className="spinner"/>{t('common.loading')}</div> : result.items.length === 0 ? <div className="worker-empty"><UserRound size={28}/><strong>{t('workers.empty')}</strong><span>{t('workers.emptyHelp')}</span></div> : <div className="worker-table-wrap"><table className="worker-table"><thead><tr>
        <th><button type="button" className="worker-sort" onClick={() => setSortOrder(value => value === 'asc' ? 'desc' : 'asc')}>{t('workers.staffId')} {sortOrder === 'asc' ? <ArrowUp size={13}/> : <ArrowDown size={13}/>}</button></th><th>{t('workers.name')}</th><th>{t('workers.role')}</th><th>{t('workers.phone')}</th><th>{t('workers.facility')}</th><th>{t('workers.mandal')} / {t('workers.village')}</th><th>{t('workers.status')}</th><th>{t('workers.actions')}</th>
      </tr></thead><tbody>{result.items.map(worker => <tr key={worker._id}>
        <td><b>{worker.staffId}</b></td><td>{worker.name}<small>{worker.designation}</small></td><td>{roleLabel(worker.role)}</td><td>{canEdit ? worker.phone : t('workers.restricted')}</td><td>{worker.facility?.name || '—'}</td><td>{worker.mandal} / {worker.village}</td><td><span className={`worker-status worker-status-${worker.employmentStatus}`}>{t(`workers.${worker.employmentStatus}`)}</span></td><td><div className="worker-actions"><button type="button" aria-label={`${t('workers.view')} ${worker.name}`} onClick={() => openProfile(worker)}><Eye size={16}/></button>{canEdit && <><button type="button" aria-label={`${t('workers.edit')} ${worker.name}`} onClick={() => openEdit(worker)}><Edit2 size={16}/></button><button type="button" className="worker-action-text" onClick={() => setConfirming(worker)}>{worker.employmentStatus === 'active' ? t('workers.deactivate') : t('workers.activate')}</button></>}</div></td>
      </tr>)}</tbody></table></div>}
      {!busy && result.total > 0 && <div className="worker-pagination"><span>{t('workers.results', { count: result.total })}</span><div><button type="button" disabled={page <= 1} aria-label={t('workers.previous')} onClick={() => setPage(current => current - 1)}><ChevronLeft size={18}/></button><span>{page} / {Math.max(result.pages, 1)}</span><button type="button" disabled={page >= result.pages} aria-label={t('workers.next')} onClick={() => setPage(current => current + 1)}><ChevronRight size={18}/></button></div></div>}
    </section>
    {modal?.type === 'edit' && <div className="worker-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !formBusy) setModal(null); }}><section className="worker-modal" role="dialog" aria-modal="true" aria-labelledby="worker-form-title"><header><h2 id="worker-form-title">{modal.worker ? t('workers.editTitle') : t('workers.addTitle')}</h2><button type="button" aria-label={t('common.close')} onClick={() => setModal(null)}><X size={20}/></button></header><form onSubmit={saveWorker}><div className="worker-form-grid">
      {field('staffId', t('workers.staffId'), { required: true })}{field('name', t('workers.name'), { required: true })}{field('role', t('workers.role'), { required: true, select: roleOptions.map(value => ({ value, label: roleLabel(value) })) })}{field('phone', t('workers.phone'), { required: true, type: 'tel', maxLength: 20 })}{field('email', t('workers.email'), { type: 'email', maxLength: 254 })}{field('designation', t('workers.designation'), { required: true })}{field('facility', t('workers.facility'), { required: true, select: facilities.map(item => ({ value: item._id, label: `${item.name} · ${item.village}` })) })}{field('mandal', t('workers.mandal'), { required: true })}{field('village', t('workers.village'), { required: true })}{field('district', t('workers.district'), { required: true })}{field('joinedAt', t('workers.joinedAt'), { required: true, type: 'date' })}{field('employmentStatus', t('workers.status'), { required: true, select: statusesForForm(t) })}{field('photoUrl', t('workers.photoUrl'), { type: 'url', maxLength: 2048, placeholder: 'https://…' })}
      </div><p className="worker-muted">{t('workers.photoHelp')}</p>{formError && <p className="form-error" role="alert">{formError}</p>}<footer><button type="button" className="worker-secondary" disabled={formBusy} onClick={() => setModal(null)}>{t('common.cancel')}</button><button className="worker-primary" disabled={formBusy}>{formBusy ? t('common.saving') : t('common.save')}</button></footer></form></section></div>}
    {modal?.type === 'profile' && <div className="worker-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><section className="worker-modal worker-profile" role="dialog" aria-modal="true" aria-labelledby="worker-profile-title"><header><h2 id="worker-profile-title">{t('workers.profile')}</h2><button type="button" aria-label={t('common.close')} onClick={() => setModal(null)}><X size={20}/></button></header>{!modal.worker ? <div className="loading-state"><span className="spinner"/>{t('common.loading')}</div> : <><div className="worker-profile-head">{modal.worker.photoUrl ? <img src={modal.worker.photoUrl} alt={modal.worker.name} onError={event => { event.currentTarget.hidden = true; }}/> : <span className="worker-avatar"><UserRound/></span>}<div><h3 id="worker-profile-title">{modal.worker.name}</h3><span>{roleLabel(modal.worker.role)} · {modal.worker.staffId}</span></div></div><dl>{[['designation', modal.worker.designation], ['phone', modal.worker.phone], ['email', modal.worker.email || '—'], ['facility', modal.worker.facility?.name || '—'], ['mandal', modal.worker.mandal], ['village', modal.worker.village], ['district', modal.worker.district], ['joinedAt', modal.worker.joinedAt ? new Date(modal.worker.joinedAt).toLocaleDateString(locale) : '—'], ['status', t(`workers.${modal.worker.employmentStatus}`)]].map(([key, value]) => <div key={key}><dt>{t(`workers.fields.${key}`, { defaultValue: t(`workers.${key}`, { defaultValue: key }) })}</dt><dd>{value}</dd></div>)}</dl></>}</section></div>}
    {confirming && <div className="worker-modal-backdrop" role="presentation"><section className="worker-modal worker-confirm" role="alertdialog" aria-modal="true" aria-labelledby="worker-confirm-title"><header><h2 id="worker-confirm-title">{confirming.employmentStatus === 'active' ? t('workers.confirmDeactivate') : t('workers.confirmActivate')}</h2><button type="button" aria-label={t('common.close')} onClick={() => setConfirming(null)}><X size={20}/></button></header><p>{confirming.name} · {confirming.staffId}</p><footer><button type="button" className="worker-secondary" onClick={() => setConfirming(null)}>{t('common.cancel')}</button><button type="button" className="worker-primary" onClick={changeStatus}>{confirming.employmentStatus === 'active' ? t('workers.deactivate') : t('workers.activate')}</button></footer></section></div>}
  </section>;
}

function statusesForForm(t) { return [{ value: 'active', label: t('workers.active') }, { value: 'inactive', label: t('workers.inactive') }]; }
