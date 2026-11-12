import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAdminReferrals } from '../services/api.js';
import './admin-referrals.css';

const pageSize = 20;

export function AdminReferrals() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getAdminReferrals({ page, limit: pageSize, ...(status ? { status } : {}), ...(searchQuery ? { q: searchQuery } : {}) })
      .then(data => { if (active) setResult(data); })
      .catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, status, searchQuery, reloadKey]);

  const rows = result?.items || [];
  const pagination = result?.pagination;

  return <section className="panel admin-referrals">
    <header className="panel-heading">
      <div><h2>{t('adminDashboard.referralsByStatus')}</h2><p>{t('adminDashboard.referralsHelp')}</p></div>
      <span className="db-pill">{pagination?.total ?? '—'} {t('navigation.referrals')}</span>
    </header>
    <div className="admin-referrals-controls">
      <label>{t('adminDashboard.searchReferrals')}<input type="search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} placeholder={t('adminDashboard.searchReferralsPlaceholder')}/></label>
      <label>{t('adminDashboard.filterByStatus')}<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="">{t('common.allStatuses')}</option>
        {['Needs review', 'In progress', 'Completed', 'Cancelled'].map(value => <option key={value} value={value}>{t(`statuses.${value}`)}</option>)}
      </select></label>
    </div>
    <p className="admin-referrals-privacy">{t('adminDashboard.referralsPrivacy')}</p>
    {loading && <div className="loading-state"><span className="spinner"/>{t('adminDashboard.loading')}</div>}
    {!loading && error && <div className="api-alert" role="alert">{error}<button type="button" onClick={() => setReloadKey(value => value + 1)}>{t('common.retry')}</button></div>}
    {!loading && !error && rows.length > 0 && <div className="admin-referrals-table-wrap">
      <table className="role-dashboard-table">
        <thead><tr><th>{t('common.patient')}</th><th>{t('adminDashboard.hospital')}</th><th>{t('adminDashboard.actor')}</th><th>{t('adminDashboard.activityDate')}</th><th>{t('dashboard.status')}</th></tr></thead>
        <tbody>{rows.map(item => <tr key={item.id}>
          <td>{item.patient?.name || '—'}{item.patient?.patientId ? <small>{item.patient.patientId}</small> : null}</td>
          <td>{item.hospital?.name || '—'}</td>
          <td>{item.provider?.name || '—'}</td>
          <td>{item.referredAt ? new Date(item.referredAt).toLocaleString(locale) : '—'}</td>
          <td><span className={`status-tag ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{t(`statuses.${item.status}`, { defaultValue: item.status })}</span></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {!loading && !error && !rows.length && <div className="empty-state"><b>{t(search ? 'dashboard.noPatientRecords' : 'adminDashboard.noReferralStats')}</b><p>{t(search ? 'dashboard.tryFilters' : 'adminDashboard.noReferrals')}</p></div>}
    {!loading && !error && pagination?.pages > 1 && <nav className="admin-referrals-pagination" aria-label={t('adminDashboard.referralsPagination')}>
      <button className="role-dashboard-secondary" type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{t('adminDashboard.previousPage')}</button>
      <span>{t('adminDashboard.pageStatus', { page: pagination.page, pages: pagination.pages })}</span>
      <button className="role-dashboard-secondary" type="button" disabled={page >= pagination.pages} onClick={() => setPage(value => value + 1)}>{t('adminDashboard.nextPage')}</button>
    </nav>}
  </section>;
}
