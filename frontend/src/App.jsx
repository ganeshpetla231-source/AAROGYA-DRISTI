import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardApp } from './components/DashboardApp.jsx';
import { AdminFacilityDetailsPage } from './components/AdminFacilities.jsx';
import { FacilityRecordDetailsPage } from './components/FacilityRecordDetailsPage.jsx';
import { FloatingWidgets } from './components/FloatingWidgets.jsx';
import { LanguageGate } from './components/LanguageGate.jsx';
import { TopicDetail, TopicHome } from './components/TopicNavigation.jsx';
import { MarketingHome, MarketingInfoPage } from './components/MarketingPage.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useLanguage } from './context/LanguageContext.jsx';
import './styles.css';
import './interaction-motion.css';

export default function App() {
  const { hasPreference } = useLanguage();
  if (!hasPreference) return <LanguageGate/>;
  return <>
    <InteractionEffects/>
    <Routes>
      <Route path="/" element={<MarketingHome/>}/>
      <Route path="/explore" element={<RoadmapRoute/>}/>
      <Route path="/services" element={<MarketingInfoPage/>}/>
      <Route path="/about" element={<MarketingInfoPage/>}/>
      <Route path="/contact" element={<MarketingInfoPage/>}/>
      <Route path="/appointment" element={<MarketingInfoPage/>}/>
      <Route path="/topics/:slug" element={<TopicDetail/>}/>
      <Route path="/login" element={<LoginRoute/>}/>
      <Route path="/register" element={<Navigate to="/login?mode=register" replace/>}/>
      <Route path="/signup" element={<Navigate to="/login?mode=register" replace/>}/>
      <Route path="/forgot-password" element={<Navigate to="/login?mode=forgot" replace/>}/>
      <Route path="/app/:role/*" element={<ProtectedDashboard/>}/>
      <Route path="/patient/dashboard" element={<RoleDashboardAlias expectedRole="patient"/>}/>
      <Route path="/doctor/dashboard" element={<RoleDashboardAlias expectedRole="doctor"/>}/>
      <Route path="/admin/dashboard" element={<RoleDashboardAlias expectedRole="admin"/>}/>
      <Route path="/admin/facilities/:facilityId" element={<AdminFacilityRoute/>}/>
      <Route path="/facilities/:facilityId" element={<FacilityRecordRoute/>}/>
      <Route path="/healthcare-workers" element={<HealthcareWorkersRoute/>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
    <FloatingWidgets/>
  </>;
}

function InteractionEffects() {
  const location = useLocation();

  useEffect(() => {
    const runAnimation = (element, className, duration = 700) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (typeof element.animate === 'function') {
        element.animate(
          [{ filter: 'brightness(1)' }, { filter: 'brightness(1.16)' }, { filter: 'brightness(1.04)' }, { filter: 'brightness(1)' }],
          { duration, easing: 'ease-out' }
        );
        return;
      }
      element.classList.remove(className);
      void element.offsetWidth;
      element.classList.add(className);
      window.setTimeout(() => element.classList.remove(className), duration);
    };

    const onClick = event => {
      const target = event.target instanceof Element
        ? event.target.closest('button, a, [role="button"], [role="menuitem"], summary')
        : null;
      if (target) runAnimation(target, 'interaction-feedback');

      if (target?.closest('.sidebar nav')) {
        const content = document.querySelector('.content-area');
        if (content) runAnimation(content, 'interaction-content-enter', 500);
      }
    };

    const observeOpenedContent = node => {
      if (!(node instanceof Element)) return;
      const selectors = [
        '[role="dialog"]', '.profile-menu', '.notification-popover',
        '.offline-accessibility-panel',
        '.worker-modal-backdrop', '.video-room-backdrop', '.topic-panel'
      ].join(',');
      if (node.matches(selectors)) runAnimation(node, 'interaction-open', 500);
      node.querySelectorAll(selectors).forEach(element => runAnimation(element, 'interaction-open', 500));
    };

    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(observeOpenedContent));
    });
    document.addEventListener('click', onClick, true);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('click', onClick, true);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const main = document.querySelector('#root > main');
    if (!main) return undefined;
    main.classList.remove('route-content-enter');
    void main.offsetWidth;
    main.classList.add('route-content-enter');
    const timer = window.setTimeout(() => main.classList.remove('route-content-enter'), 500);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search, location.key]);

  return null;
}

function RoadmapRoute() { return <TopicHome/>; }
function LoginRoute() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const toDashboard = user => {
    const module = new URLSearchParams(search).get('module');
    const page = module ? resolveModulePage(module, user.role) : undefined;
    navigate(`${dashboardPath(user.role)}${page ? `?voicePage=${encodeURIComponent(page)}` : ''}`, { replace: true });
  };
  return <DashboardApp routeRole={null} initialAuthMode={new URLSearchParams(search).get('mode')} onAuthenticated={toDashboard} onHome={() => navigate('/')} onLogin={() => navigate('/login', { replace: true })}/>;
}

function dashboardPath(role) {
  if (['patient', 'doctor', 'admin'].includes(role)) return `/${role}/dashboard`;
  return `/app/${role}`;
}

function RoleDashboardAlias({ expectedRole }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { t } = useTranslation();
  if (loading) return <main className="auth-page"><div className="loading-state"><span className="spinner"/>{t('auth.restoreSession')}</div></main>;
  if (!user) return <Navigate to="/login" replace/>;
  if (user.role !== expectedRole) return <Navigate to={dashboardPath(user.role)} replace/>;
  const query = new URLSearchParams(search);
  return <DashboardApp routeRole={expectedRole} initialPage={query.get('voicePage')} initialAction={query.get('voiceAction')} onAuthenticated={() => {}} onHome={() => navigate('/')} onLogin={() => navigate('/login', { replace: true })}/>;
}

function AdminFacilityRoute() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  if (loading) return <main className="auth-page"><div className="loading-state"><span className="spinner"/>{t('auth.restoreSession')}</div></main>;
  if (!user) return <Navigate to="/login" replace/>;
  if (user.role !== 'admin') return <Navigate to={dashboardPath(user.role)} replace/>;
  return <AdminFacilityDetailsPage/>;
}

function FacilityRecordRoute() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  if (loading) return <main className="auth-page"><div className="loading-state"><span className="spinner"/>{t('auth.restoreSession')}</div></main>;
  if (!user) return <Navigate to="/login" replace/>;
  if (!['patient', 'asha', 'doctor', 'specialist', 'hospital', 'district', 'admin'].includes(user.role)) return <Navigate to={dashboardPath(user.role)} replace/>;
  return <FacilityRecordDetailsPage/>;
}

function resolveModulePage(module, role) {
  const modulePages = {
    'mouth-scan': { asha: 'screening-upload', doctor: 'screening-review', patient: 'screening-history' },
    'symptoms-checker': { all: 'symptoms-checker' },
    'oral-diseases': { all: 'education' },
    'ai-screening': { asha: 'screening-upload', doctor: 'screening-review', patient: 'screening-history' },
    'doctor-consultation': { patient: 'appointments', doctor: 'appointments' },
    appointments: { patient: 'appointments', doctor: 'appointments' },
    'patient-history': { patient: 'screening-history', asha: 'screening-history', doctor: 'clinical-workspace' },
    'health-tips': { all: 'education' },
    'screening-reports': { patient: 'screening-history', asha: 'screening-history', doctor: 'reports', admin: 'reports', district: 'analytics', specialist: 'analytics', hospital: 'analytics' },
    'nearby-facilities': { patient: 'maps', asha: 'maps', doctor: 'maps', district: 'maps', specialist: 'facilities', hospital: 'facilities', admin: 'facilities' }
  };
  const choices = modulePages[module];
  return choices?.[role] || choices?.all || (['asha', 'doctor'].includes(role) ? 'education' : undefined);
}
function ProtectedDashboard() {
  const { user, loading } = useAuth(); const { role } = useParams(); const navigate = useNavigate();
  const { search } = useLocation();
  const { t } = useTranslation();
  if (loading) return <main className="auth-page"><div className="loading-state"><span className="spinner"/>{t('auth.restoreSession')}</div></main>;
  if (!user) return <Navigate to="/login" replace/>;
  if (role !== user.role) return <Navigate to={dashboardPath(user.role)} replace/>;
  const query = new URLSearchParams(search);
  return <DashboardApp routeRole={role} initialPage={query.get('voicePage')} initialAction={query.get('voiceAction')} onAuthenticated={() => {}} onHome={() => navigate('/')} onLogin={() => navigate('/login', { replace: true })}/>;
}
function HealthcareWorkersRoute() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  if (loading) return <main className="auth-page"><div className="loading-state"><span className="spinner"/>{t('auth.restoreSession')}</div></main>;
  if (!user) return <Navigate to="/login" replace/>;
  if (!['admin', 'district'].includes(user.role)) return <Navigate to={dashboardPath(user.role)} replace/>;
  return <DashboardApp routeRole={user.role} initialPage="healthcare-workers" onAuthenticated={() => {}} onHome={() => navigate('/')} onLogin={() => navigate('/login', { replace: true })}/>;
}
