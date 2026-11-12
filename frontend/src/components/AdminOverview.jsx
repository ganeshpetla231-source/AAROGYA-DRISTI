import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowRight, BarChart3, Building2, CalendarDays, ClipboardCheck, ShieldCheck, Users, Video } from 'lucide-react';
import { getAdminActivity, getAdminTelemedicineOverview, getHealth } from '../services/api.js';
import './admin-overview.css';

const statCards = [
  ['totalPatients', 'totalPatients', Users],
  ['totalDoctors', 'totalDoctors', ShieldCheck],
  ['totalHealthWorkers', 'totalHealthWorkers', Users],
  ['totalHospitals', 'totalHospitals', Building2],
  ['totalAppointments', 'totalAppointments', CalendarDays],
  ['totalVideoAppointments', 'totalVideoAppointments', Video],
  ['pendingDoctorApprovals', 'pendingDoctorApprovals', ClipboardCheck]
];

export function AdminOverview({ dashboard, account, onNavigate }) {
  const { t, i18n } = useTranslation();
  const [activity, setActivity] = useState([]);
  const [telemedicine, setTelemedicine] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const summary = dashboard?.summary || {};
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';

  const load = useCallback(async () => {
    setLoading(true);
    const [activityResult, telemedicineResult, healthResult] = await Promise.allSettled([
      getAdminActivity({ page: 1, limit: 8 }),
      getAdminTelemedicineOverview(),
      getHealth()
    ]);
    setErrors({
      activity: activityResult.status === 'rejected' ? activityResult.reason.message : '',
      telemedicine: telemedicineResult.status === 'rejected' ? telemedicineResult.reason.message : '',
      health: healthResult.status === 'rejected' ? healthResult.reason.message : ''
    });
    if (activityResult.status === 'fulfilled') setActivity(activityResult.value.items || []);
    if (telemedicineResult.status === 'fulfilled') setTelemedicine(telemedicineResult.value);
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
    setLoading(false);
  }, [reloadKey]);

  useEffect(() => { load(); }, [load]);

  const valueFor = key => key === 'totalVideoAppointments'
    ? telemedicine?.summary?.totalVideoAppointments ?? '—'
    : summary[key] ?? '—';

  return <div className="admin-overview">
    <section className="role-dashboard-hero role-admin-hero">
      <div className="role-dashboard-hero-copy">
        <p className="role-dashboard-eyebrow">{t('roleOverview.admin.eyebrow')} <span>·</span> {t('roleOverview.admin.welcome', { name: account?.name || '' })}</p>
        <h1>AAROGYA <span>DRISHTI</span></h1>
        <h2>{t('roleOverview.admin.heroTitle')}</h2>
        <p>{t('roleOverview.admin.heroDescription')}</p>
        <p className="role-dashboard-hero-points">{t('roleOverview.admin.heroHighlights')}</p>
        <button type="button" className="role-dashboard-hero-button" onClick={() => onNavigate('healthcare-workers')}>
          {t('roleOverview.admin.manageCareTeam')} <ArrowRight size={17} aria-hidden="true"/>
        </button>
      </div>
      <div className="role-dashboard-hero-image">
        <img src="/images/dashboard/action-consult.png" alt={t('roleOverview.admin.heroImageAlt')} fetchpriority="high"/>
        <span><ShieldCheck size={19} aria-hidden="true"/>{t('roleOverview.admin.heroImageNote')}</span>
      </div>
    </section>
    <nav className="admin-overview-actions" aria-label={t('roleOverview.admin.quickActions')}>
      {[
        ['patients', 'roleOverview.admin.managePatients', Users, 'mint'],
        ['healthcare-workers', 'roleOverview.admin.manageCareTeam', ShieldCheck, 'blue'],
        ['facility-management', 'roleOverview.admin.manageFacilities', Building2, 'gold'],
        ['reports', 'roleOverview.admin.viewReports', BarChart3, 'lavender']
      ].map(([route, label, Icon, tone]) => <button key={route} className={`role-overview-action tone-${tone}`} type="button" onClick={() => onNavigate(route)}>
        <span><Icon size={22} aria-hidden="true"/></span><strong>{t(label)}</strong><ArrowRight size={17} aria-hidden="true"/>
      </button>)}
    </nav>
    <header className="admin-overview-heading">
      <div><p className="section-overline">{t('roles.admin')}</p><h2>{t('adminDashboard.overviewTitle')}</h2><p>{t('adminDashboard.overviewDescription')}</p></div>
      <button className="role-dashboard-secondary" type="button" disabled={loading} onClick={() => setReloadKey(value => value + 1)}>{t('common.refresh')}</button>
    </header>
    {!dashboard && <div className="role-dashboard-error" role="alert">{t('adminDashboard.overviewUnavailable')}</div>}
    <section className="admin-overview-stats" aria-label={t('adminDashboard.statisticsLabel')}>
      {statCards.map(([label, key, Icon]) => <article className="admin-overview-stat" key={key}>
        <span className="admin-overview-stat-icon"><Icon size={18} aria-hidden="true"/></span>
        <span>{t(`adminDashboard.overviewStats.${label}`)}</span>
        <strong>{valueFor(key) === '—' ? '—' : Number(valueFor(key)).toLocaleString(locale)}</strong>
      </article>)}
    </section>
    <section className="admin-overview-grid">
      <article className="role-dashboard-panel admin-system-monitor">
        <header><span className="admin-overview-panel-icon"><Activity size={18} aria-hidden="true"/></span><div><h3>{t('adminDashboard.systemMonitoring')}</h3><p>{t('adminDashboard.systemMonitoringHelp')}</p></div></header>
        {errors.health
          ? <p className="role-dashboard-error" role="alert">{errors.health}</p>
          : <dl>
              <div><dt>{t('adminDashboard.apiStatus')}</dt><dd className={health ? 'is-healthy' : 'is-unavailable'}>{health ? t('dashboard.online') : '—'}</dd></div>
              <div><dt>{t('adminDashboard.databaseStatus')}</dt><dd className={health?.database === 'connected' ? 'is-healthy' : 'is-unavailable'}>{loading ? t('adminDashboard.checking') : health?.database || '—'}</dd></div>
              <div><dt>{t('adminDashboard.lastChecked')}</dt><dd>{health?.timestamp ? new Date(health.timestamp).toLocaleString(locale) : '—'}</dd></div>
            </dl>}
      </article>
      <article className="role-dashboard-panel admin-appointment-monitor">
        <header><span className="admin-overview-panel-icon"><CalendarDays size={18} aria-hidden="true"/></span><div><h3>{t('adminDashboard.appointmentSummary')}</h3><p>{t('adminDashboard.appointmentMonitoringHelp')}</p></div></header>
        {errors.telemedicine && <p className="role-dashboard-error" role="alert">{errors.telemedicine}</p>}
        {dashboard?.appointmentsByStatus?.length
          ? dashboard.appointmentsByStatus.map(item => <p className="admin-report-row" key={item._id}><span>{item._id}</span><strong>{Number(item.count).toLocaleString(locale)}</strong></p>)
          : <p className="role-dashboard-empty">{t('adminDashboard.noStatusData')}</p>}
        <button className="text-link" type="button" onClick={() => onNavigate('telemedicine-admin')}>{t('navigation.telemedicine-admin')} →</button>
      </article>
    </section>
    <section className="role-dashboard-panel admin-overview-activity">
      <header className="role-dashboard-heading"><div><p className="section-overline">{t('adminDashboard.activityLogs')}</p><h3>{t('adminDashboard.recentActivity')}</h3><p>{t('adminDashboard.activityPrivacyNote')}</p></div><button className="text-link" type="button" onClick={() => onNavigate('admin-management')}>{t('dashboard.viewAll')}</button></header>
      {errors.activity && <p className="role-dashboard-error" role="alert">{errors.activity}</p>}
      {loading && <p>{t('adminDashboard.loading')}</p>}
      {!loading && !errors.activity && activity.length > 0 && <div className="role-dashboard-table-wrap"><table className="role-dashboard-table">
        <thead><tr><th>{t('adminDashboard.activityDate')}</th><th>{t('adminDashboard.actor')}</th><th>{t('adminDashboard.activity')}</th><th>{t('adminDashboard.resource')}</th></tr></thead>
        <tbody>{activity.map(item => <tr key={item.id}><td>{new Date(item.occurredAt).toLocaleString(locale)}</td><td>{item.actor?.name || '—'}</td><td>{item.action}</td><td>{item.resourceType}</td></tr>)}</tbody>
      </table></div>}
      {!loading && !errors.activity && !activity.length && <p className="role-dashboard-empty">{t('adminDashboard.noActivity')}</p>}
    </section>
  </div>;
}
