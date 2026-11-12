import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Bell, BookOpen, Building2, CalendarDays, CalendarPlus, Check, ClipboardCheck, ChevronDown,
  ChevronRight, Clock3, Eye, EyeOff, FolderHeart, GitBranch, HeartPulse, Hospital, LayoutDashboard, QrCode,
  LogOut, MapPin, Search, Settings as SettingsIcon, Shield, ShieldCheck, Stethoscope, UserCog, Users,
  Video, Wifi
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { navItems, qrNavItems, screeningNavItems, voiceNavItems, clinicalNavItems, mapsNavItems, notificationNavItems, analyticsNavItems, roles } from '../data/demoData.js';
import { ASR_MANDALS } from '../data/asrMandals.js';
import { departmentForSpecialty, oralHealthDepartments, oralHealthSpecialties, specialtiesForDepartment } from '../data/oralHealthDepartments.js';
import { createResource, getDashboardData, getPatientProfilePhoto, updateResource } from '../services/api.js';
import { indiaTodayDate, patientAgeFromDateOfBirth } from '../utils/patientAge.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PatientQrCard, PatientQrScanner, QrHistory } from './PatientQr.jsx';
import { ScreeningHistory, ScreeningReviewQueue, ScreeningUpload } from './Screenings.jsx';
import { VoiceAssistant, VoiceHistory, VoiceReviewQueue } from './VoiceAssistant.jsx';
import { ClinicalWorkspace } from './ClinicalWorkspace.jsx';
import { TelemedicineAdminOverview } from './TelemedicineAdminOverview.jsx';
import { MapsPage } from './MapsPage.jsx';
import { TelemedicineWorkspace } from './Telemedicine.jsx';
import { PatientAppointments } from './PatientAppointments.jsx';
import { AnalyticsDashboard } from './AnalyticsDashboard.jsx';
import { NotificationBell, NotificationsPage } from './Notifications.jsx';
import { LanguageSelector } from './LanguageSelector.jsx';
import { EducationLibrary } from './EducationLibrary.jsx';
import GovernmentDirectory from './GovernmentDirectory.jsx';
import { EducationVideoLibrary } from './EducationVideoLibrary.jsx';
import { HealthcareWorkers } from './HealthcareWorkers.jsx';
import { SymptomsChecker } from './SymptomsChecker.jsx';
import { PatientDashboard } from './PatientDashboard.jsx';
import { PatientScreening } from './PatientScreening.jsx';
import { FacilityManagement } from './FacilityManagement.jsx';
import { AdminFacilitiesPage } from './AdminFacilities.jsx';
import { AdminDashboard } from './AdminDashboard.jsx';
import { AdminContentManagement } from './AdminContentManagement.jsx';
import { AdminOverview } from './AdminOverview.jsx';
import { AdminReferrals } from './AdminReferrals.jsx';
import { AdminNotifications } from './AdminNotifications.jsx';
import { saveOfflinePatientDraft } from '../services/offlineStorage.js';
import './auth-layout.css';
import './authPassword.css';
import './overview.css';
import './doctor-profile.css';
import './role-dashboard-theme.css';

const adminNavigation = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'patients', icon: Users },
  { id: 'healthcare-workers', icon: UserCog },
  { id: 'referrals', icon: GitBranch },
  { id: 'facility-management', icon: Building2 },
  { id: 'government-directory', icon: Hospital },
  { id: 'telemedicine-admin', icon: Video },
  { id: 'content-management', icon: BookOpen },
  { id: 'reports', icon: BarChart3 },
  { id: 'admin-management', icon: Shield },
  { id: 'notifications', icon: Bell },
  { id: 'settings', icon: SettingsIcon }
];

const patientNavigation = [
  { id: 'overview', icon: LayoutDashboard, labelKey: 'dashboard.patientNavigation.dashboard' },
  { id: 'appointments', icon: CalendarDays, labelKey: 'dashboard.patientNavigation.bookAppointment' },
  { id: 'video-consultation', icon: Video, labelKey: 'dashboard.patientNavigation.videoConsultation' },
  { id: 'patient-screening', icon: Stethoscope, labelKey: 'dashboard.patientNavigation.screening' },
  { id: 'screening-history', icon: FolderHeart, labelKey: 'dashboard.patientNavigation.records' },
  { id: 'notifications', icon: Bell, labelKey: 'dashboard.patientNavigation.notifications' },
  { id: 'settings', icon: SettingsIcon, labelKey: 'dashboard.patientNavigation.settings' }
];
const patientMoreOrder = [
  'patient-profile', 'qr-card', 'education', 'government-directory', 'education-videos',
  'voice-assistant', 'voice-history', 'referrals', 'maps'
];
const isVideoAppointment = appointment => appointment.visitMode === 'Video' ||
  (!appointment.visitMode && String(appointment.type || '').toLowerCase().includes('telemedicine'));

export function DashboardApp({ routeRole, initialPage, initialAction, initialAuthMode, onHome, onAuthenticated, onLogin }) {
  const auth = useAuth();
  const { t: translate, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'en';
  const t = {
    demo: translate('common.database'), login: translate('auth.login'), register: translate('auth.patientRegister'),
    email: translate('auth.email'), password: translate('auth.password'), name: translate('auth.fullName'),
    village: translate('auth.village'), role: translate('auth.role'), continue: translate('auth.continue'),
    create: translate('auth.createAccount'), signUp: translate('auth.signUp'), back: translate('auth.backToLogin'),
    welcome: translate('dashboard.welcome'), overview: translate('dashboard.overview'),
    patients: translate('dashboard.patients'), search: translate('dashboard.searchPatients'),
    all: translate('common.allStatuses'), trend: translate('dashboard.trend'),
    week: translate('dashboard.lastWeek'), signout: translate('dashboard.signOut'),
    empty: translate('common.noRecords'), retry: translate('common.retry'),
    loading: translate('dashboard.loadingRecords')
  };
  useEffect(() => { if (!auth.loading && auth.user && routeRole !== auth.user.role) onAuthenticated(auth.user); }, [auth.loading, auth.user, routeRole, onAuthenticated]);
  if (auth.loading) return <main className="auth-page"><div className="loading-state"><span className="spinner"/>{translate('auth.restoreSession')}</div></main>;
  if (!auth.user) return <Auth auth={auth} initialMode={initialAuthMode} onAuthenticated={onAuthenticated} onHome={onHome} t={t}/>;
  if (auth.user.mustChangePassword) return <TemporaryPasswordChange auth={auth}/>;
  if (routeRole !== auth.user.role) return <main className="auth-page"><div className="loading-state"><span className="spinner"/>{translate('auth.redirectDashboard')}</div></main>;
  const role = roles.find(item => item.id === auth.user.role);
  return <Dashboard role={role} account={auth.user} initialPage={initialPage} initialAction={initialAction} onHome={onHome} onSignOut={async () => { await auth.logout(); onLogin(); }} lang={lang} t={t} sessionStatus={auth.sessionStatus}/>;
}

function TemporaryPasswordChange({ auth }) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!/^[a-z]{10,128}$/.test(newPassword)) return setError(t('auth.passwordInvalid'));
    if (newPassword !== confirmPassword) return setError(t('auth.passwordsDoNotMatch'));
    setBusy(true);
    try { await auth.changePassword({ currentPassword, newPassword }); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <main className="auth-page">
    <header className="auth-top"><span className="back-home">Aarogya <b>Drishti</b></span><LanguageSelector className="lang-toggle dash-lang"/></header>
    <section className="auth-card">
      <div className="auth-symbol">✦</div>
      <p className="demo-label">{t('auth.secureAccess')}</p>
      <h1>{t('auth.changeTemporaryPassword')}</h1>
      <p className="auth-intro">{t('auth.passwordHint')}</p>
      <form onSubmit={submit}>
        <label>{t('auth.currentPassword')}<input type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)}/></label>
        <label>{t('auth.newPassword')}<input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={newPassword} onChange={event => setNewPassword(event.target.value)}/></label>
        <label>{t('auth.confirmPassword')}<input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}/></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? t('auth.pleaseWait') : t('auth.changePassword')}</button>
      </form>
    </section>
  </main>;
}

function Auth({ auth, initialMode, onAuthenticated, onHome, t }) {
  const { t: translate } = useTranslation();
  const [mode, setMode] = useState(['register', 'forgot'].includes(initialMode) ? initialMode : 'login'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [resetToken, setResetToken] = useState('');
  const [loginType, setLoginType] = useState('patient'), [otpSent, setOtpSent] = useState(false), [phone, setPhone] = useState(''), [dateOfBirth, setDateOfBirth] = useState(''), [registrationDetails, setRegistrationDetails] = useState(null);
  const [password, setPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false), [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const register = mode === 'register';
  const loginMethods = [
    ['patient', 'auth.patientOtp'],
    ['doctor', 'auth.doctorLogin'],
    ['admin', 'auth.adminLogin'],
    ['staff', 'auth.staffLogin']
  ];

  function changeMode(nextMode) {
    setMode(nextMode);
    if (nextMode === 'register') setLoginType('patient');
    setPassword('');
    setConfirmPassword('');
    setPasswordVisible(false);
    setConfirmPasswordVisible(false);
    setOtpSent(false);
    setPhone('');
    setDateOfBirth('');
    setRegistrationDetails(null);
    setMessage('');
    setError('');
  }
  function patientRegistrationPayload(form) {
    return {
      purpose: 'register',
      phone,
      name: form.get('name'),
      email: form.get('email'),
      address: form.get('address'),
      village: form.get('village'),
      mandal: form.get('mandal'),
      aadhaar: form.get('aadhaar'),
      dateOfBirth: form.get('dateOfBirth'),
      age: form.get('age')
    };
  }
  function editRegistrationDetails() {
    setOtpSent(false);
    setRegistrationDetails(null);
    setMessage('');
    setError('');
  }
  useEffect(() => {
    if (initialMode === 'register' && mode === 'login') setMode('register');
  }, [initialMode, mode]);

  async function submit(event) {
    event.preventDefault();
    const reset = mode === 'reset';
    if (reset && !isValidPassword(password)) {
      setError(translate('auth.passwordInvalid'));
      return;
    }
    if (reset && password !== confirmPassword) {
      setError(translate('auth.passwordsDoNotMatch'));
      return;
    }
    setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      if (mode === 'login' && loginType === 'patient') {
        if (otpSent) onAuthenticated(await auth.verifyPatientOtp({ purpose: 'login', phone, code: form.get('otp') }));
        else {
          const result = await auth.requestPatientOtp({ purpose: 'login', phone });
          setOtpSent(true);
          setMessage(result.developmentCode
            ? translate('auth.otpDevCode', { code: result.developmentCode })
            : translate('auth.otpSent'));
        }
      }
      else if (mode === 'login') {
        const authenticatedUser = await auth.login({ identifier: form.get('identifier'), password: form.get('password'), expectedRole: loginType });
        onAuthenticated(authenticatedUser);
      }
      else if (register && otpSent) onAuthenticated(await auth.verifyPatientOtp({ purpose: 'register', phone, code: form.get('otp') }));
      else if (register) {
        const details = patientRegistrationPayload(form);
        const result = await auth.requestPatientOtp(details);
        setRegistrationDetails(details);
        setOtpSent(true);
        setMessage(result.developmentCode
          ? translate('auth.otpDevCode', { code: result.developmentCode })
          : translate('auth.otpSent'));
      }
      else if (mode === 'forgot') { const result = await auth.forgotPassword(form.get('email')); setResetToken(result.developmentResetToken || ''); setMessage(result.developmentResetToken ? translate('auth.resetTokenHelp') : translate('auth.resetSent')); setMode('reset'); }
      else { await auth.resetPassword({ email: form.get('email'), token: form.get('token'), password: form.get('password') }); setResetToken(''); setPassword(''); setConfirmPassword(''); setPasswordVisible(false); setConfirmPasswordVisible(false); setError(''); setMessage(translate('auth.resetSuccess')); setMode('login'); }
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function resendOtp(event) {
    const form = new FormData(event.currentTarget.form);
    setBusy(true);
    setError('');
    try {
      const result = await auth.requestPatientOtp(register ? registrationDetails : { purpose: 'login', phone });
      setMessage(result.developmentCode
        ? translate('auth.otpDevCode', { code: result.developmentCode })
        : translate('auth.otpResent'));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const reset = mode === 'reset';
  const derivedAge = patientAgeFromDateOfBirth(dateOfBirth);
  const maximumBirthDate = indiaTodayDate();
  const passwordFields = (mode === 'login' && loginType !== 'patient') || reset;
  const passwordValid = isValidPassword(password);
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = !busy && (!reset || (passwordValid && confirmPassword.length > 0 && password === confirmPassword));
  return (
    <main className="auth-page auth-page-split">
      <div className="auth-glow"/>
      <div className="auth-layout">
      <aside className="auth-brand-panel">
        <div className="auth-brand-top"><button className="back-home" onClick={onHome}>← {translate('auth.backHome')}</button></div>
        <div className="auth-brand-message"><h2>Aarogyadrishti</h2><p>{translate('auth.brandTagline')}</p></div>
        <div className="auth-hero-art">
          <img src="/images/dashboard/login-healthcare-illustration.png" alt={translate('auth.healthcareIllustrationAlt')}/>
        </div>
        <div className="auth-trust-row">
          <span><ShieldCheck size={18} aria-hidden="true"/>{translate('auth.trustSecure')}</span>
          <span><Shield size={18} aria-hidden="true"/>{translate('auth.trustPrivate')}</span>
          <span><HeartPulse size={18} aria-hidden="true"/>{translate('auth.trustCare')}</span>
        </div>
      </aside>
      <section className="auth-card">
        <div className="auth-card-brand"><span><Eye size={22} aria-hidden="true"/></span><b>Aarogyadrishti</b><LanguageSelector className="lang-toggle dash-lang auth-card-language"/></div>
        <p className="demo-label">{translate('auth.secureAccess')}</p>
        <h1>{register ? translate('auth.register') : reset ? translate('auth.resetTitle') : mode === 'forgot' ? translate('auth.forgotTitle') : t.login}</h1>
        <p className="auth-intro">{register ? translate('auth.registerIntro') : translate('auth.loginIntro')}</p>
        {auth.sessionStatus && <p className="auth-session-alert" role="alert">{translate(`auth.session${auth.sessionStatus === 'expired' ? 'Expired' : 'Unavailable'}`)}</p>}
        {message && <p className="api-success" role="status">{message}</p>}
        {resetToken && <p className="reset-token">{translate('auth.developmentToken')} <code>{resetToken}</code></p>}
        {mode === 'login' && <div className="auth-switch-group" role="group" aria-label={translate('auth.loginMethod')}>
          {loginMethods.map(([type, labelKey]) => <button key={type} type="button" className={`auth-switch ${loginType === type ? 'active' : ''}`} aria-pressed={loginType === type} onClick={() => { setLoginType(type); setOtpSent(false); setPhone(''); setMessage(''); setError(''); }}>{translate(labelKey)}</button>)}
        </div>}
        <form onSubmit={submit}>
          {register && <>
            <input type="hidden" name="role" value="patient"/>
            <label>{t.name}<input name="name" required disabled={otpSent} maxLength="120" placeholder={translate('auth.fullNamePlaceholder')}/></label>
            <label>{translate('auth.address')}<input name="address" required disabled={otpSent} maxLength="500" placeholder={translate('auth.addressPlaceholder')}/></label>
            <label>{translate('auth.mandal')}<select name="mandal" required disabled={otpSent} defaultValue=""><option value="">{translate('auth.selectMandal')}</option>{ASR_MANDALS.map(mandal => <option key={mandal} value={mandal}>{mandal}</option>)}</select></label>
            <label>{t.village}<input name="village" required disabled={otpSent} maxLength="120" placeholder={translate('auth.village')}/></label>
            <small className="form-hint">{translate('auth.asrLocationHelp')}</small>
            <label>{translate('auth.aadhaar')}<input name="aadhaar" type="text" inputMode="numeric" autoComplete="off" disabled={otpSent} maxLength="14" pattern="[0-9 -]{12,14}" placeholder={translate('auth.aadhaarPlaceholder')}/></label>
            <small className="form-hint">{translate('auth.aadhaarHelp')}</small>
            <label>{translate('auth.dateOfBirth')}<input name="dateOfBirth" type="date" max={maximumBirthDate} disabled={otpSent} value={dateOfBirth} onChange={event => setDateOfBirth(event.target.value)}/></label>
            {dateOfBirth && derivedAge !== null ? <small className="form-hint">{translate('auth.ageDerivedHelp', { age: translate('clinical.years', { count: derivedAge }) })}</small> : <label>{translate('auth.age')}<input name="age" type="number" min="0" max="120" step="1" disabled={otpSent} placeholder={translate('auth.agePlaceholder')}/></label>}
            <label>{translate('auth.phone')}<input name="phone" type="tel" inputMode="tel" required maxLength="24" autoComplete="tel" value={phone} disabled={otpSent} onChange={event => setPhone(event.target.value)} placeholder={translate('auth.phonePlaceholder')}/></label>
          </>}
          {register && otpSent && <label>{translate('auth.otpCode')}<input name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" required autoFocus placeholder={translate('auth.otpPlaceholder')}/></label>}
          {mode === 'login' && loginType === 'patient' && <>
            <label>{translate('auth.phone')}<input name="phone" type="tel" inputMode="tel" required maxLength="24" autoComplete="tel" value={phone} disabled={otpSent} onChange={event => setPhone(event.target.value)} placeholder={translate('auth.phonePlaceholder')}/></label>
            {otpSent && <label>{translate('auth.otpCode')}<input name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" required placeholder={translate('auth.otpPlaceholder')}/></label>}
          </>}
          {mode === 'login' && loginType !== 'patient' && <label>{translate(`auth.${loginType}Identifier`)}<input name="identifier" required autoComplete="username" placeholder={translate(`auth.${loginType}IdentifierPlaceholder`)}/></label>}
          {(register || mode === 'forgot' || mode === 'reset') && <label>{t.email}<input name="email" type="email" required disabled={register && otpSent} placeholder={translate('auth.emailPlaceholder')}/></label>}
          {reset && <>
            <label>{translate('auth.resetToken')}<input name="token" required defaultValue={resetToken}/></label>
          </>}
          {passwordFields && <>
            <label htmlFor="auth-password">
              {reset ? translate('auth.newPassword') : t.password}
              <span className="password-input-wrap">
                <input
                  id="auth-password"
                  name="password"
                  type={passwordVisible ? 'text' : 'password'}
                  value={password}
                  minLength={reset ? 10 : 1}
                  maxLength={reset ? 128 : undefined}
                  pattern={reset ? '[a-z]{10,128}' : undefined}
                  required
                  placeholder={reset ? translate('auth.passwordHint') : translate('auth.passwordPlaceholder')}
                  autoComplete={reset ? 'new-password' : 'current-password'}
                  onChange={event => setPassword(event.target.value)}
                  aria-label={reset ? translate('auth.newPassword') : t.password}
                  aria-invalid={reset && password.length > 0 && !passwordValid}
                  aria-describedby={reset ? password.length > 0 && !passwordValid ? 'password-hint password-validation' : 'password-hint' : undefined}
                />
                <button className="password-visibility" type="button" aria-label={translate(passwordVisible ? 'auth.hidePassword' : 'auth.showPassword')} aria-pressed={passwordVisible} onClick={() => setPasswordVisible(visible => !visible)}>
                  {passwordVisible ? <EyeOff aria-hidden="true" size={17}/> : <Eye aria-hidden="true" size={17}/>}
                </button>
              </span>
              {reset && <>
                <small id="password-hint" className="password-hint">{translate('auth.passwordHint')}</small>
                {password.length > 0 && !passwordValid && <small id="password-validation" className="password-validation" role="status">{translate('auth.passwordInvalid')}</small>}
              </>}
            </label>
            {reset && <label htmlFor="auth-confirm-password">
              {translate('auth.confirmPassword')}
              <span className="password-input-wrap">
                <input
                  id="auth-confirm-password"
                  name="confirmPassword"
                  type={confirmPasswordVisible ? 'text' : 'password'}
                  value={confirmPassword}
                  required
                  autoComplete="new-password"
                  onChange={event => setConfirmPassword(event.target.value)}
                  aria-label={translate('auth.confirmPassword')}
                  aria-invalid={passwordMismatch}
                  aria-describedby={confirmPassword.length > 0 ? 'password-match-status' : undefined}
                />
                <button className="password-visibility" type="button" aria-label={translate(confirmPasswordVisible ? 'auth.hidePassword' : 'auth.showPassword')} aria-pressed={confirmPasswordVisible} onClick={() => setConfirmPasswordVisible(visible => !visible)}>
                  {confirmPasswordVisible ? <EyeOff aria-hidden="true" size={17}/> : <Eye aria-hidden="true" size={17}/>}
                </button>
              </span>
              {confirmPassword.length > 0 && <small id="password-match-status" className={passwordMismatch ? 'password-validation' : 'password-match'} role="status">{translate(passwordMismatch ? 'auth.passwordsDoNotMatch' : 'auth.passwordsMatch')}</small>}
            </label>}
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={!canSubmit}>
            {busy ? translate('auth.pleaseWait') : register ? (otpSent ? translate('auth.verifyOtp') : translate('auth.sendOtp')) : mode === 'forgot' ? translate('auth.sendReset') : reset ? translate('auth.resetPassword') : mode === 'login' && loginType === 'patient' ? (otpSent ? translate('auth.verifyOtp') : translate('auth.sendOtp')) : translate('auth.signIn')} →
          </button>
          {otpSent && (mode === 'login' || register) && <button className="auth-switch" type="button" disabled={busy} onClick={resendOtp}>{translate('auth.resendOtp')}</button>}
          {register && otpSent && <button className="auth-switch" type="button" disabled={busy} onClick={editRegistrationDetails}>{translate('auth.editRegistrationDetails')}</button>}
        </form>
        {mode === 'login' && loginType !== 'patient' && <button className="auth-switch" onClick={() => changeMode('forgot')}>{translate('auth.forgotPassword')}</button>}
        {mode !== 'login' && <button className="auth-switch" onClick={() => changeMode('login')}>{translate('auth.backToLogin')}</button>}
        {mode === 'login' && <button className="auth-switch auth-register-link" onClick={() => changeMode('register')}>{t.signUp}</button>}
        <footer className="auth-card-footer">
          <p className="auth-footnote">{translate('auth.secureSession')}</p>
          <Link to="/appointment">{translate('auth.bookAppointment')} →</Link>
        </footer>
      </section>
      </div>
    </main>
  );
}

function isValidPassword(password) {
  return /^[a-z]{10,128}$/.test(password);
}

function Dashboard({ role, account, initialPage, initialAction, onHome, onSignOut, lang, t, sessionStatus }) {
  const { t: translate } = useTranslation();
  const { search } = useLocation();
  const auth = useAuth();
  const roleLabel = translate(`roles.${role.id}`);
  const roleDashboard = ['doctor', 'admin'].includes(role.id);
  const permittedStartPages = {
    patient: ['overview', 'patient-profile', 'appointments', 'video-consultation', 'patient-screening', 'qr-card', 'screening-history', 'education', 'government-directory', 'education-videos', 'voice-assistant', 'voice-history', 'referrals', 'maps', 'notifications', 'settings'],
    asha: ['overview', 'patients', 'education', 'government-directory', 'symptoms-checker', 'facilities', 'maps', 'voice-assistant', 'voice-history', 'screening-upload', 'screening-history', 'qr-scanner', 'qr-history', 'notifications', 'analytics', 'reports'],
    doctor: ['overview', 'patients', 'appointments', 'referrals', 'screening-review', 'screening-history', 'qr-scanner', 'clinical-workspace', 'reports', 'settings'],
    specialist: ['overview', 'education', 'government-directory', 'symptoms-checker', 'facilities', 'notifications', 'analytics'],
    hospital: ['overview', 'facilities', 'facility-management', 'education', 'government-directory', 'symptoms-checker', 'notifications', 'analytics'],
    district: ['analytics', 'facilities', 'maps', 'education', 'government-directory', 'symptoms-checker', 'notifications', 'healthcare-workers'],
    admin: ['overview', 'patients', 'healthcare-workers', 'referrals', 'facility-management', 'government-directory', 'telemedicine-admin', 'content-management', 'reports', 'admin-management', 'notifications', 'settings']
  };
  const legacyAdminPages = {
    facilities: 'government-directory',
    education: 'content-management',
    'education-videos': 'content-management',
    analytics: 'reports'
  };
  const rawRequestedPage = new URLSearchParams(search).get('voicePage') || initialPage;
  const requestedPage = role.id === 'admin' ? legacyAdminPages[rawRequestedPage] || rawRequestedPage : rawRequestedPage;
  const requestedAction = new URLSearchParams(search).get('voiceAction') || initialAction;
  const startPage = permittedStartPages[role.id]?.includes(requestedPage) ? requestedPage : role.id === 'district' ? 'analytics' : 'overview';
  const [page, setPage] = useState(startPage), [query, setQuery] = useState(''), [filter, setFilter] = useState('All');
  const [voiceFormStart, setVoiceFormStart] = useState(requestedAction === 'add-patient' && ['asha', 'doctor', 'admin'].includes(role.id));
  useEffect(() => {
    if (permittedStartPages[role.id]?.includes(requestedPage)) setPage(requestedPage);
    setVoiceFormStart(requestedAction === 'add-patient' && ['asha', 'doctor', 'admin'].includes(role.id));
  }, [requestedPage, requestedAction, role.id]);
  const [records, setRecords] = useState({ patients: [], medicalHistory: [], screenings: [], appointments: [], hospitals: [], referrals: [], notifications: [], adminSummary: null, referralsByStatus: [] });
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [profileOpen, setProfileOpen] = useState(false), [mobileOpen, setMobileOpen] = useState(false), [patientMoreOpen, setPatientMoreOpen] = useState(false);
  const refresh = async () => { setLoading(true); setError(''); try { setRecords(await getDashboardData(role.id)); } catch (failure) { setError(failure.message); } finally { setLoading(false); } };
  useEffect(() => { refresh(); }, []);
  const patients = useMemo(() => records.patients.filter(item => `${item.name} ${item.patientId} ${item.village} ${item.district || ''}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'All' || item.status === filter)), [records.patients, query, filter]);
  const reviewed = records.screenings.filter(item => item.status === 'Reviewed').length;
  const pending = records.screenings.filter(item => item.status === 'Needs review').length;
  const openReferrals = role.id === 'admin'
    ? (records.referralsByStatus || []).filter(item => !['Completed', 'Cancelled'].includes(item._id)).reduce((total, item) => total + item.count, 0)
    : records.referrals.filter(item => !['Completed', 'Cancelled'].includes(item.status)).length;
  const adminSummary = records.adminSummary || {};
  const statValues = role.id === 'patient' ? [records.screenings.length, records.appointments.length, records.notifications.length, records.referrals.length]
    : role.id === 'asha' ? [records.patients.length, reviewed, records.appointments.filter(item => item.status === 'Upcoming').length, openReferrals]
      : role.id === 'doctor' ? [pending, reviewed, records.appointments.length, openReferrals]
        : role.id === 'specialist' ? [records.referrals.length, reviewed, records.appointments.length, openReferrals]
          : role.id === 'hospital' ? [records.appointments.length, openReferrals, records.patients.length, records.hospitals.length]
            : role.id === 'district' ? [records.patients.length, records.hospitals.length, reviewed, openReferrals]
              : role.id === 'admin'
                ? [adminSummary.totalPatients || 0, adminSummary.totalHospitals || 0, adminSummary.totalScreenings || 0, openReferrals]
                : [records.patients.length, records.hospitals.length, records.screenings.length, openReferrals];
  const statLabels = translate(`dashboard.stats.${role.id}`, { returnObjects: true });
  const stats = statLabels.map((label, index) => [label, statValues[index]]);
  const chartData = records.screenings.reduce((days, item) => {
    const date = new Date(item.screenedAt || item.createdAt); if (Number.isNaN(date.getTime())) return days;
    const day = date.toLocaleDateString('en-US', { weekday: 'short' }); let current = days.find(entry => entry.day === day);
    if (!current) { current = { day, screened: 0, reviewed: 0 }; days.push(current); }
    current.screened += 1; if (item.status === 'Reviewed') current.reviewed += 1; return days;
  }, []);
  const createPatient = async data => { const result = await createResource('patients', data); setNotice(translate('dashboard.patientSaved')); await refresh(); return result; };
  const updatePatient = async (id, data) => { try { await updateResource('patients', id, data); setNotice(translate('dashboard.patientUpdated')); await refresh(); } catch (failure) { setError(failure.message); } };
  const canManagePatients = ['asha', 'doctor', 'admin'].includes(role.id);
  const allNavItems = [...navItems.filter(item => (item.id !== 'appointments' || ['patient', 'doctor'].includes(role.id)) && !(role.id === 'district' && ['patients', 'referrals'].includes(item.id))), { id: 'education', icon: '✚' }, { id: 'government-directory', icon: '⌂' }, { id: 'education-videos', icon: '▶' }, ...(role.id === 'patient' ? [{ id: 'patient-profile', icon: '♙' }, { id: 'patient-screening', icon: '◉' }] : []), ...(['admin', 'hospital'].includes(role.id) ? [{ id: 'facility-management', icon: '▦' }] : []), ...(role.id === 'admin' ? [{ id: 'admin-management', icon: '⚙' }, { id: 'telemedicine-admin', icon: '▣' }] : []), ...(['admin', 'district'].includes(role.id) ? [{ id: 'healthcare-workers', icon: '♙' }] : []), ...(qrNavItems[role.id] || []), ...(screeningNavItems[role.id] || []), ...(voiceNavItems[role.id] || []), ...(clinicalNavItems[role.id] || []), ...(mapsNavItems[role.id] || []), ...(notificationNavItems[role.id] || []), ...(analyticsNavItems[role.id] || [])];
  const doctorNavOrder = ['overview', 'patients', 'appointments', 'referrals', 'screening-review', 'screening-history', 'qr-scanner', 'clinical-workspace', 'reports', 'settings'];
  const patientMoreItems = patientMoreOrder.map(id => allNavItems.find(item => item.id === id)).filter(Boolean);
  const visibleNavItems = role.id === 'admin'
    ? adminNavigation
    : role.id === 'doctor'
    ? doctorNavOrder.map(id => allNavItems.find(item => item.id === id)).filter(Boolean)
    : role.id === 'patient'
      ? patientNavigation
      : allNavItems;
  const availableOverviewPages = [...new Set([...(permittedStartPages[role.id] || []), ...visibleNavItems.map(item => item.id)])];
  useEffect(() => {
    if (role.id === 'patient' && patientMoreItems.some(item => item.id === page)) setPatientMoreOpen(true);
  }, [page, role.id]);
  const title = role.id === 'admin'
    ? translate(`adminDashboard.navigation.${page}`)
    : role.id === 'patient' && page === 'video-consultation'
      ? translate('dashboard.patientNavigation.videoConsultation')
      : translate(role.id === 'patient' && page === 'referrals'
        ? 'navigation.my-referrals'
        : role.id === 'patient' && page === 'voice-history'
          ? 'navigation.my-transcripts'
          : role.id === 'patient' && page === 'screening-history'
            ? 'navigation.patient-screening-history'
            : `navigation.${page}`);
  const renderNavItem = item => {
    const Icon = item.icon;
    const label = item.labelKey
      ? translate(item.labelKey)
      : role.id === 'admin'
        ? translate(`adminDashboard.navigation.${item.id}`)
        : translate(role.id === 'patient' && item.id === 'referrals' ? 'navigation.my-referrals' : role.id === 'patient' && item.id === 'voice-history' ? 'navigation.my-transcripts' : role.id === 'patient' && item.id === 'screening-history' ? 'navigation.patient-screening-history' : `navigation.${item.id}`);
    return <button key={item.id} aria-current={page === item.id ? 'page' : undefined} className={page === item.id ? 'nav-current' : ''} onClick={() => { setPage(item.id); setMobileOpen(false); }}>
      <span className="nav-icon">{typeof Icon === 'string' ? Icon : <Icon size={18} aria-hidden="true"/>}</span>{label}
      {role.id !== 'admin' && item.id === 'referrals' && <i className="nav-count">{openReferrals}</i>}
    </button>;
  };
  return <main className={`dashboard-shell ${role.id === 'patient' ? 'patient-dashboard-shell' : roleDashboard ? `role-dashboard-shell role-${role.id}-dashboard-shell` : ''}`}>
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <button className="sidebar-brand" onClick={onHome}>
        {role.id === 'patient' ? <img className="patient-sidebar-logo" src="/icons/aarogya.svg" alt="" width="44" height="44"/> : roleDashboard ? <img className="role-dashboard-sidebar-logo" src="/icons/aarogya.svg" alt="" width="44" height="44"/> : <span className="sidebar-mark">✦</span>}
        <span>AAROGYA<br/><b>DRISHTI</b>{role.id === 'patient' && <small>{translate('dashboard.patientNavigation.brandTagline')}</small>}</span>
        <span className="close-sidebar" onClick={event => { event.stopPropagation(); setMobileOpen(false); }}>×</span>
      </button>
      <div className="workspace-label">{role.id === 'patient' ? translate('dashboard.patientNavigation.portal') : translate('dashboard.workspace')}</div>
      <nav aria-label={translate('dashboard.workspace')}>
        {visibleNavItems.map(renderNavItem)}
        {role.id === 'patient' && <>
          <button className={`patient-more-toggle ${patientMoreOpen ? 'is-open' : ''}`} type="button" aria-expanded={patientMoreOpen} onClick={() => setPatientMoreOpen(value => !value)}>
            <span className="nav-icon"><ChevronRight size={18} aria-hidden="true"/></span>{translate('dashboard.patientNavigation.moreCare')}
            <ChevronDown className="patient-more-chevron" size={15} aria-hidden="true"/>
          </button>
          {patientMoreOpen && <div className="patient-more-links">{patientMoreItems.map(renderNavItem)}</div>}
        </>}
      </nav>
      <div className="sidebar-bottom">
        {role.id === 'patient'
          ? <button className="patient-sidebar-logout" type="button" onClick={onSignOut}><LogOut size={18} aria-hidden="true"/>{translate('dashboard.patientNavigation.logout')}</button>
          : <><div className="sidebar-demo">◉ <span>{translate('dashboard.demo')}<br/><b>{translate('dashboard.mongoSynthetic')}</b></span></div><button className={`role-switch ${roleDashboard ? 'role-dashboard-logout' : ''}`} onClick={onSignOut}>{roleDashboard ? <LogOut size={17} aria-hidden="true"/> : '⇄'} {roleDashboard ? t.signout : translate('dashboard.switchRole')}</button></>}
      </div>
    </aside>
    {mobileOpen && <button className="sidebar-backdrop" type="button" aria-label={translate('dashboard.toggleNavigation')} onClick={() => setMobileOpen(false)}/>}
    <section className="dashboard-main">
      <header className={`topbar ${page === 'overview' ? 'overview-topbar' : ''}`}>
        <button className="mobile-menu" aria-label={translate('dashboard.toggleNavigation')} aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>☰</button>
        {page === 'overview' && role.id === 'patient'
          ? <div className="patient-topbar-greeting"><h2>{translate('patientOverview.welcome', { name: account.name })} <span aria-hidden="true">👋</span></h2><p>{translate('dashboard.patientNavigation.healthPriority')}</p></div>
          : page === 'overview' && roleDashboard
            ? <div className="role-dashboard-greeting"><h2>{translate('roleOverview.welcome', { name: account.name })} <span aria-hidden="true">👋</span></h2><p>{translate(`roleOverview.${role.id}.headerNote`)}</p></div>
          : page === 'overview'
          ? <div className="overview-brand"><img src="/icons/aarogya.svg" alt="" width="42" height="42"/><span><b>Aarogya Drishti</b><small>{translate('dashboard.oralCancerDetection')}</small></span></div>
          : <div className="breadcrumb">{translate('dashboard.workspace')} <span>/</span> {title}</div>}
        {page === 'overview' && role.id !== 'patient' && <p className="overview-tagline">{translate('dashboard.tagline')}</p>}
        {['admin', 'doctor', 'asha'].includes(role.id) && <label className="workspace-search"><Search size={16}/><input aria-label={translate('dashboard.searchPatients')} placeholder={translate('dashboard.searchPatients')} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') setPage('patients'); }}/></label>}
        <div className="top-actions">
          {role.id === 'patient' && page === 'overview'
            ? <span className="patient-role-badge"><ShieldCheck size={16} aria-hidden="true"/>{roleLabel}</span>
            : roleDashboard && page === 'overview'
              ? <span className="patient-role-badge role-workspace-badge"><ShieldCheck size={16} aria-hidden="true"/>{roleLabel}</span>
            : <span className={`db-pill ${page === 'overview' ? `overview-status-pill ${loading || error ? 'is-offline' : 'is-online'}` : ''}`}>{page === 'overview' ? <><i aria-hidden="true"/>{loading ? translate('dashboard.connecting') : error ? translate('dashboard.offline') : translate('dashboard.online')}</> : <>● {t.demo}</>}</span>}
          {roleDashboard && page === 'overview' && <span className={`db-pill overview-status-pill ${loading || error ? 'is-offline' : 'is-online'}`}><i aria-hidden="true"/>{loading ? translate('dashboard.connecting') : error ? translate('dashboard.offline') : translate('dashboard.online')}</span>}
          <NotificationBell onViewAll={() => setPage('notifications')}/>
          <LanguageSelector className="lang-toggle dash-lang"/>
          <div className="profile-wrap"><button className="profile-button" aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>
            {role.id === 'patient' ? <PatientAvatar patient={records.patients[0]} name={account.name}/> : <span className="avatar">{page === 'overview' ? (account.name || roleLabel)[0] : roleLabel[0]}</span>}
            <span className="profile-text"><b>{page === 'overview' ? account.name : roleLabel.split('/')[0].trim()}</b><small>{roleLabel}</small></span><ChevronDown size={15} aria-hidden="true"/>
          </button>{profileOpen && <div className="profile-menu"><strong>{roleLabel}</strong><button onClick={() => { setPage('settings'); setProfileOpen(false); }}>{translate('dashboard.profileSettings')}</button><button onClick={onSignOut}>{t.signout}</button></div>}</div>
        </div>
      </header>
      <div className={`content-area ${page === 'overview' ? 'overview-content-area' : ''}`}>
        {page !== 'overview' && <div className="page-heading"><div><p className="section-overline">{roleLabel.toUpperCase()} {translate('dashboard.workspace')} <span>·</span> {t.demo}</p><h1>{title}</h1><p className="page-subtitle">{page === 'education' ? translate('education.pageDescription') : page === 'education-videos' ? translate('educationVideos.pageDescription') : page === 'healthcare-workers' ? translate('workers.pageDescription') : page === 'content-management' ? translate('adminDashboard.contentDescription') : page.startsWith('qr-') ? translate('qr.scanDescription') : pageDescription(page, role, translate)}</p></div>{page !== 'education' && page !== 'education-videos' && page !== 'healthcare-workers' && page !== 'content-management' && !(role.id === 'admin' && page === 'facilities') && <button className="date-chip" onClick={refresh}>↻ &nbsp; {translate('common.refresh')}</button>}</div>}
        {sessionStatus && <div className="api-alert" role="alert">{translate(`auth.session${sessionStatus === 'expired' ? 'Expired' : 'Unavailable'}`)}</div>}
        {error && <div className="api-alert" role="alert"><span>{translate('dashboard.apiError')} {error}</span><button onClick={refresh}>{t.retry}</button></div>}
        {notice && <div className="api-success" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
        {page === 'telemedicine-admin' && role.id === 'admin' ? <TelemedicineAdminOverview onManageDoctors={() => setPage('healthcare-workers')}/>
          : page === 'facilities' && role.id === 'admin' ? <AdminFacilitiesPage/>
          : page === 'government-directory' && role.id === 'admin' ? <AdminFacilitiesPage/>
          : page === 'government-directory' ? <GovernmentDirectory/>
          : page === 'patient-profile' ? <PatientDashboard/>
          : page === 'appointments' && role.id === 'patient' ? <PatientAppointments/>
          : page === 'patient-screening' && role.id === 'patient' ? <PatientScreening onNavigate={setPage}/>
          : page === 'facility-management' && ['admin', 'hospital'].includes(role.id) ? <FacilityManagement role={role.id}/>
          : page === 'admin-management' && role.id === 'admin' ? <AdminDashboard sections={['users', 'hospitalAdmins', 'permissions', 'activity']} initialSection="users"/>
          : page === 'healthcare-workers' && role.id === 'admin' ? <AdminDashboard sections={['doctors', 'staff']} initialSection="doctors"/>
          : page === 'referrals' && role.id === 'admin' ? <AdminReferrals/>
          : page === 'content-management' && role.id === 'admin' ? <AdminContentManagement language={lang}/>
          : page === 'education-videos' ? <EducationVideoLibrary language={lang}/>
          : page === 'education' ? <EducationLibrary role={role.id} language={lang}/>
          : page === 'symptoms-checker' ? <SymptomsChecker/>
            : page === 'healthcare-workers' ? <HealthcareWorkers role={role.id} district={account.district}/>
              : page === 'qr-card' ? <PatientQrCard auth={auth}/>
                : page === 'qr-scanner' ? <PatientQrScanner/>
                  : page === 'qr-history' ? <QrHistory/>
                    : page === 'screening-upload' ? <ScreeningUpload patients={records.patients} onUploaded={refresh}/>
                      : page === 'screening-review' ? <ScreeningReviewQueue/>
                        : page === 'screening-history' ? role.id === 'patient' ? <PatientScreening historyOnly/> : <ScreeningHistory records={records.screenings} patients={records.patients} onRefresh={refresh}/>
                          : page === 'voice-assistant' ? <VoiceAssistant role={role.id} patients={records.patients}/>
                            : page === 'voice-history' ? <VoiceHistory/>
                              : page === 'voice-review' ? <VoiceReviewQueue/>
                                : page === 'clinical-workspace' ? <ClinicalWorkspace/>
                                  : page === 'maps' ? <MapsPage role={role.id} patients={records.patients} hospitals={records.hospitals} onReferralSaved={refresh}/>
                                    : page === 'video-consultation' && role.id === 'patient' ? <TelemedicineWorkspace language={lang} mode="video"/>
                                      : page === 'appointments' ? <TelemedicineWorkspace language={lang}/>
                                      : page === 'reports' && role.id === 'admin' ? <AnalyticsDashboard role="admin"/>
                                        : page === 'analytics' || (role.id === 'district' && page === 'overview') ? <AnalyticsDashboard role={role.id}/>
                                        : page === 'notifications' && role.id === 'admin' ? <AdminNotifications/>
                                          : page === 'notifications' ? <NotificationsPage/>
                                          : loading ? <div className="loading-state"><span className="spinner"/>{t.loading}</div>
                                            : page === 'settings' ? <Settings role={role} account={account} onUpdateProfile={auth.updateProfile}/>
                                              : page === 'overview' ? role.id === 'admin'
                                                                                    ? <AdminOverview dashboard={records.adminDashboard} account={account} onNavigate={setPage}/>
                                                : role.id === 'patient'
                                                ? <PatientOverview account={account} records={records} loading={loading} error={error} onNavigate={setPage} onRefresh={refresh}/>
                                                                                    : <><Overview roleId={role.id} account={account} records={records} loading={loading} stats={stats} chartData={chartData} rows={patients} t={t} lang={lang} availablePages={availableOverviewPages} connected={!loading && !error} connectionLabel={loading ? 'Connecting' : error ? 'Offline' : 'Live Data'} onNavigate={setPage} onPatients={() => setPage('patients')} onRefresh={refresh} onUpdatePatient={canManagePatients ? updatePatient : undefined}/>{mapsNavItems[role.id] && <MapsPage role={role.id} mini onExplore={() => setPage('maps')}/>}</>
                                                : <DataPage page={page} roleId={role.id} records={records} patients={patients} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} t={t} onCreatePatient={canManagePatients ? createPatient : undefined} onUpdatePatient={canManagePatients ? updatePatient : undefined} voiceStart={voiceFormStart} accountId={account.id}/>}
        <footer className="demo-footer">AAROGYA DRISHTI <span>?</span> {page === 'education' ? translate('education.safetyNotice') : translate('common.notForClinicalUse')}</footer>
      </div>
    </section>
  </main>;
}

function pageDescription(page, role, translate) {
  return translate(`dashboard.pageDescriptions.${page}`, {
    role: translate(`roles.${role.id}`),
    defaultValue: translate('dashboard.pageDescriptions.overview')
  });
}
function statusClass(value = '') { return value.toLowerCase().replaceAll(' ', '-'); }

function Overview({ roleId, account, records, loading, stats, chartData, rows, t, lang, availablePages, connected, connectionLabel, onNavigate, onPatients, onRefresh, onUpdatePatient }) {
  const { t: translate, i18n } = useTranslation();
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
  const isDoctor = roleId === 'doctor';
  const chartRows = weekDays.map((day, index) => ({
    ...(chartData.find(entry => entry.day === day) || { screened: 0, reviewed: 0 }),
    day: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, index + 1)))
  }));
  const doctorAppointments = (records?.appointments || [])
    .filter(item => ['upcoming', 'confirmed', 'scheduled'].includes((item.status || '').toLowerCase()) && new Date(item.scheduledAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const nextDoctorAppointment = doctorAppointments[0];
  const pendingDoctorScreenings = (records?.screenings || [])
    .filter(item => ['needs review', 'needs-review', 'pending', 'flagged'].includes((item.status || '').toLowerCase()))
    .slice(0, 3);
  const screenRoute = ['screening-upload', 'screening-review', 'screening-history'].find(route => availablePages.includes(route));
  const followupRoute = ['clinical-workspace', 'referrals', 'patients'].find(route => availablePages.includes(route));
  const actions = [
    { route: screenRoute, labelKey: screenRoute === 'screening-upload' ? 'uploadMouthImage' : screenRoute === 'screening-review' ? 'reviewScreenings' : 'screeningHistory', icon: '↑', tone: 'pink', image: '/images/dashboard/action-history.png' },
    { route: availablePages.includes('appointments') ? 'appointments' : undefined, labelKey: 'consultDoctor', icon: '⚕', tone: 'green', image: '/images/dashboard/action-consult.png' },
    { route: availablePages.includes('appointments') ? 'appointments' : undefined, labelKey: 'bookAppointment', icon: '▦', tone: 'purple', image: '/images/dashboard/action-appointment.png' },
    { route: followupRoute, labelKey: followupRoute === 'clinical-workspace' ? 'trackTreatment' : followupRoute === 'referrals' ? 'viewReferrals' : 'patientRecords', icon: '✓', tone: 'orange', image: '/images/dashboard/action-referrals.png' },
    { route: availablePages.includes('education') ? 'education' : undefined, labelKey: 'healthAwareness', icon: '◖', tone: 'sky', image: '/images/dashboard/action-awareness.png' }
  ].filter(action => action.route);
  return <>
    {isDoctor
      ? <section className="role-dashboard-hero role-doctor-hero">
          <div className="role-dashboard-hero-copy">
            <p className="role-dashboard-eyebrow">{translate('roleOverview.doctor.eyebrow')}</p>
            <h1>AAROGYA <span>DRISHTI</span></h1>
            <h2>{translate('roleOverview.doctor.heroTitle')}</h2>
            <p>{translate('roleOverview.doctor.heroDescription')}</p>
            <p className="role-dashboard-hero-points">{translate('roleOverview.doctor.heroHighlights')}</p>
            <button type="button" className="role-dashboard-hero-button" onClick={() => onNavigate('screening-review')}>
              {translate('roleOverview.doctor.reviewQueue')} <ArrowRight size={17} aria-hidden="true"/>
            </button>
          </div>
          <div className="role-dashboard-hero-image">
            <img src="/images/dashboard/action-consult.png" alt={translate('roleOverview.doctor.heroImageAlt')} fetchpriority="high"/>
            <span><HeartPulse size={19} aria-hidden="true"/>{translate('roleOverview.doctor.heroImageNote')}</span>
          </div>
          <button className="role-dashboard-refresh" type="button" onClick={onRefresh} aria-label={translate('common.refresh')} title={translate('common.refresh')}>↻</button>
        </section>
      : <section className="overview-hero" aria-hidden="true"/>}
    <section className="overview-stats" aria-label={translate('dashboard.workspace')}>
      {stats.map(([label, value], index) => {
        const cards = [
          { img: '/images/dashboard/screenings.png', tone: 'purple', icon: '◉' },
          { img: '/images/dashboard/visits.png', tone: 'blue', icon: '✓' },
          { img: '/images/dashboard/care-updates.png', tone: 'green', icon: '◷' },
          { img: '/images/dashboard/referrals.png', tone: 'red', icon: '↗' }
        ];
        return <PhotoStatCard key={label} label={label} value={value} note={translate('dashboard.fromCurrentDatabase')} {...cards[index % cards.length]}/>;
      })}
    </section>
    {isDoctor && <>
      <nav className="overview-quick-actions role-overview-quick-actions" aria-label={translate('dashboard.quickActions')}>
        {[
          { route: 'screening-review', label: translate('navigation.screening-review'), Icon: Stethoscope, tone: 'mint' },
          { route: 'appointments', label: translate('navigation.appointments'), Icon: CalendarDays, tone: 'blue' },
          { route: 'qr-scanner', label: translate('qr.scanTitle'), Icon: QrCode, tone: 'gold' },
          { route: 'clinical-workspace', label: translate('navigation.clinical-workspace'), Icon: FolderHeart, tone: 'lavender' }
        ].map(({ route, label, Icon, tone }) => <button key={route} className={`role-overview-action tone-${tone}`} type="button" onClick={() => onNavigate(route)}>
          <span><Icon size={22} aria-hidden="true"/></span><strong>{label}</strong><ArrowRight size={17} aria-hidden="true"/>
        </button>)}
      </nav>
      <section className="doctor-overview-panels" aria-label={translate('roleOverview.doctor.workspaceSummary')}>
        <article className="doctor-overview-card doctor-next-appointment">
          <header><span className="doctor-overview-icon"><CalendarDays size={18} aria-hidden="true"/></span><div><h2>{translate('roleOverview.doctor.upcomingAppointment')}</h2><p>{translate('roleOverview.doctor.appointmentHelp')}</p></div><button className="role-overview-text-link" type="button" onClick={() => onNavigate('appointments')}>{translate('dashboard.viewAll')} <ArrowRight size={14}/></button></header>
          {loading
            ? <p className="role-overview-loading"><span className="spinner"/>{translate('dashboard.loadingRecords')}</p>
            : nextDoctorAppointment
              ? <div className="doctor-appointment-detail">
                  <span className="doctor-patient-avatar"><Users size={20} aria-hidden="true"/></span>
                  <div className="doctor-appointment-patient"><strong>{nextDoctorAppointment.patient?.name || nextDoctorAppointment.patientName || translate('screening.patientFallback')}</strong><small>{nextDoctorAppointment.patient?.patientId || nextDoctorAppointment.patientId || translate('roleOverview.doctor.patientAppointment')}</small></div>
                  <span className={`patient-appointment-status ${statusClass(nextDoctorAppointment.status)}`}>{translate(`statuses.${nextDoctorAppointment.status}`, { defaultValue: nextDoctorAppointment.status })}</span>
                  <div className="doctor-appointment-time"><span><CalendarDays size={15}/>{new Date(nextDoctorAppointment.scheduledAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span><Clock3 size={15}/>{new Date(nextDoctorAppointment.scheduledAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</span></div>
                  <button type="button" className="role-dashboard-primary" onClick={() => onNavigate('appointments')}>{translate('roleOverview.doctor.openAppointments')}</button>
                </div>
              : <div className="role-overview-empty"><strong>{translate('roleOverview.doctor.noUpcomingAppointments')}</strong><p>{translate('roleOverview.doctor.noUpcomingHelp')}</p><button type="button" className="role-dashboard-primary" onClick={() => onNavigate('appointments')}>{translate('roleOverview.doctor.openAppointments')}</button></div>}
        </article>
        <article className="doctor-overview-card doctor-screening-queue">
          <header><span className="doctor-overview-icon"><ClipboardCheck size={18} aria-hidden="true"/></span><div><h2>{translate('roleOverview.doctor.screeningQueue')}</h2><p>{translate('roleOverview.doctor.screeningQueueHelp')}</p></div><span className="doctor-queue-count">{loading ? '—' : stats[0]?.[1] ?? pendingDoctorScreenings.length}</span></header>
          {loading
            ? <p className="role-overview-loading"><span className="spinner"/>{translate('dashboard.loadingRecords')}</p>
            : pendingDoctorScreenings.length
              ? <ul className="doctor-screening-list">{pendingDoctorScreenings.map((item, index) => <li key={item._id || item.id || index}><span><strong>{item.patient?.name || item.patientName || translate('screening.patientFallback')}</strong><small>{new Date(item.screenedAt || item.createdAt).toLocaleDateString(locale)}</small></span><span className="patient-appointment-status needs-review">{translate('screening.needsReview')}</span></li>)}</ul>
              : <div className="role-overview-empty"><strong>{translate('roleOverview.doctor.noPendingCases')}</strong><p>{translate('roleOverview.doctor.noPendingCasesHelp')}</p></div>}
          <button className="role-overview-text-link" type="button" onClick={() => onNavigate('screening-review')}>{translate('roleOverview.doctor.openReviewQueue')} <ArrowRight size={14}/></button>
        </article>
        <article className="doctor-overview-card doctor-care-card">
          <header><span className="doctor-overview-icon doctor-video-icon"><Video size={18} aria-hidden="true"/></span><div><h2>{translate('roleOverview.doctor.careCoordination')}</h2><p>{translate('roleOverview.doctor.careCoordinationHelp')}</p></div></header>
          <div className="doctor-care-illustration" aria-hidden="true"><div><Video size={27}/></div><span><Wifi size={20}/></span></div>
          <p>{translate('roleOverview.doctor.careCoordinationMessage')}</p>
          <button type="button" className="role-dashboard-primary" onClick={() => onNavigate('clinical-workspace')}>{translate('roleOverview.doctor.openClinicalWorkspace')} <ArrowRight size={15}/></button>
        </article>
      </section>
    </>}
    <section className="overview-main-grid">
      <article className="panel overview-activity-panel">
        <header className="overview-panel-heading">
          <div><h2>{t.trend}</h2><p>{translate('dashboard.databaseActivity')}</p></div>
          <div className="overview-panel-actions"><button className="overview-refresh-button" onClick={onRefresh}>↻ {translate('common.refresh')}</button><span className={`overview-live-pill ${connected ? 'is-online' : ''}`}><i aria-hidden="true"/>{connected ? translate('dashboard.liveData') : connectionLabel === 'Connecting' ? translate('dashboard.connecting') : translate('dashboard.offline')}</span></div>
        </header>
        <div className="overview-chart-legend"><span><i className="legend-screened"/>{translate('dashboard.screened')}</span><span><i className="legend-reviewed"/>{translate('dashboard.doctorReviewed')}</span></div>
        <div className="overview-chart-wrap">
          {chartData.length ? <div className="chart-area overview-chart-area"><ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartRows} margin={{ top: 14, right: 14, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="overview-screen-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={isDoctor ? '#00a878' : '#22d3ee'} stopOpacity={.26}/><stop offset="98%" stopColor={isDoctor ? '#00a878' : '#22d3ee'} stopOpacity={0}/></linearGradient>
                <filter id="overview-line-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              </defs>
              <CartesianGrid stroke={isDoctor ? '#e2eee6' : '#24456d'} strokeDasharray="3 6" vertical/>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: isDoctor ? '#71867a' : '#bdd2e8', fontSize: 11 }}/>
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: isDoctor ? '#71867a' : '#bdd2e8', fontSize: 11 }}/>
              <Tooltip contentStyle={{ background: isDoctor ? '#ffffff' : '#092048', border: `1px solid ${isDoctor ? '#cfe3d5' : '#2b5b8d'}`, borderRadius: 10, color: isDoctor ? '#315c47' : '#f1f8ff' }}/>
              <Area className="overview-screening-line" type="monotone" dataKey="screened" name={translate('dashboard.screened')} stroke={isDoctor ? '#00a878' : '#22d3ee'} strokeWidth={3} fill="url(#overview-screen-fill)" dot={{ r: 3, fill: isDoctor ? '#fff' : '#e7fcff', stroke: isDoctor ? '#00a878' : '#22d3ee', strokeWidth: 2 }} activeDot={{ r: 5 }}/>
              <Area type="monotone" dataKey="reviewed" name={translate('dashboard.doctorReviewed')} stroke={isDoctor ? '#7eb8d9' : '#8ab8ff'} strokeWidth={2} fill="none" dot={{ r: 2, fill: isDoctor ? '#fff' : '#dcecff', stroke: isDoctor ? '#7eb8d9' : '#8ab8ff', strokeWidth: 2 }}/>
            </AreaChart>
          </ResponsiveContainer></div> : <div className="overview-chart-empty" role="status">{translate('dashboard.noScreeningActivity')}</div>}
        </div>
      </article>
      <article className="panel overview-recent-panel">
        <header className="overview-panel-heading"><div><h2>{translate('dashboard.recentPatients')}</h2><p>{translate('dashboard.latestRecords')}</p></div><button className="text-link" onClick={onPatients}>{translate('dashboard.viewAll')}</button></header>
        <PatientList rows={rows} lang={lang} onUpdatePatient={onUpdatePatient}/>
        {availablePages.includes('appointments') && <button className="overview-schedule-button" onClick={() => onNavigate('appointments')}>▣ &nbsp; {translate('dashboard.scheduleNextAppointment')}</button>}
        <div className="overview-care-strip"><img src="/images/dashboard/community-map.png" alt="" loading="lazy" decoding="async"/><span>{translate('dashboard.communityCareLocations')}</span></div>
      </article>
    </section>
    {!isDoctor && <nav className="overview-quick-actions" aria-label={translate('dashboard.quickActions')}>
      {actions.map(action => <button key={`${action.route}-${action.labelKey}`} className={`overview-action-card tone-${action.tone}`} onClick={() => onNavigate(action.route)}>
          <img className="overview-action-image" src={action.image} alt="" loading="lazy" decoding="async"/>
          <span className="overview-action-icon" aria-hidden="true">{action.icon}</span><span>{translate(`dashboard.actions.${action.labelKey}`)}</span><b aria-hidden="true">↗</b>
        </button>)}
    </nav>}
    {isDoctor
      ? <section className="doctor-overview-highlights" aria-label={translate('roleOverview.doctor.highlightsLabel')}>
          {[ShieldCheck, HeartPulse, Users, Video].map((Icon, index) => <article key={index}><span><Icon size={22} aria-hidden="true"/></span><p>{translate(`roleOverview.doctor.highlights.${index}`)}</p></article>)}
        </section>
      : <section className="overview-bottom-banner"><span className="overview-banner-shield" aria-hidden="true">✚</span><p>{translate('dashboard.cancerFreeMotto')} <strong>{translate('dashboard.cancerFreeIndia')}</strong></p><img src="/images/topics/analytics-reminders.svg" alt="" loading="lazy" decoding="async"/></section>}
    <PatientTable rows={rows} compact t={t} onPatients={onPatients} onUpdatePatient={onUpdatePatient}/>
  </>;
}

function PatientOverview({ account, records, loading, error, onNavigate, onRefresh }) {
  const { t: translate, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
  const now = Date.now();
  const upcoming = records.appointments
    .filter(item => ['Upcoming', 'Confirmed'].includes(item.status) && new Date(item.scheduledAt).getTime() >= now)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const nextAppointment = upcoming[0];
  const nextVideoAppointment = upcoming.find(isVideoAppointment);
  const latest = [...records.screenings].sort((a, b) => new Date(b.screenedAt || b.createdAt) - new Date(a.screenedAt || a.createdAt))[0];
  const notifications = [...records.notifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3);
  const latestCategory = latest?.aiResult?.category || latest?.category;
  const latestFinding = latestCategory
    ? translate(`patientScreening.categories.${latestCategory}`, { defaultValue: latestCategory.replaceAll('-', ' ') })
    : '';
  const latestStatus = latest?.doctorAssessment
    ? translate('statuses.Reviewed')
    : latest?.status
      ? translate(`statuses.${latest.status}`, { defaultValue: latest.status })
      : translate('patientOverview.noScreening');
  const stats = [
    { label: translate('patientOverview.totalScreenings'), value: records.screenings.length, note: translate('patientOverview.screeningCountNote'), Icon: Stethoscope },
    { label: translate('patientOverview.upcomingAppointments'), value: upcoming.length, note: translate('patientOverview.appointmentCountNote'), Icon: CalendarDays },
    { label: translate('patientOverview.notifications'), value: records.notifications.length, note: translate('patientOverview.notificationCountNote'), Icon: Bell },
    { label: translate('patientOverview.myReferrals'), value: records.referrals.length, note: translate('patientOverview.referralCountNote'), Icon: GitBranch }
  ];
  const actions = [
    { route: 'appointments', label: translate('dashboard.patientNavigation.bookAppointment'), Icon: CalendarPlus, tone: 'mint' },
    { route: 'video-consultation', label: translate('patientOverview.startVideoCall'), Icon: Video, tone: 'blue' },
    { route: 'patient-screening', label: translate('patientOverview.uploadScreeningImage'), Icon: Stethoscope, tone: 'gold' },
    { route: 'screening-history', label: translate('patientOverview.viewMyRecords'), Icon: FolderHeart, tone: 'lavender' }
  ];
  const specialist = nextAppointment?.provider?.doctorProfile?.specialization || nextAppointment?.provider?.specialization || nextAppointment?.provider?.specialty || nextAppointment?.provider?.qualification || translate('telemedicine.generalDoctor');
  const appointmentDate = nextAppointment ? new Date(nextAppointment.scheduledAt) : null;
  const canJoinNextAppointment = nextAppointment && isVideoAppointment(nextAppointment) && nextAppointment.status === 'Confirmed';
  const appointmentStatus = nextAppointment
    ? translate(`statuses.${nextAppointment.status}`, { defaultValue: nextAppointment.status })
    : '';

  return <div className="patient-dashboard-overview">
    <section className="patient-hero-banner">
      <div className="patient-hero-copy">
        <p className="patient-hero-eyebrow">{translate('dashboard.patientNavigation.brandTagline')}</p>
        <h1>AAROGYA <span>DRISHTI</span></h1>
        <h2>{translate('patientOverview.heroTitle')}</h2>
        <p className="patient-hero-description">{translate('patientOverview.heroDescription')}</p>
        <p className="patient-hero-points">{translate('patientOverview.heroHighlights')}</p>
        <button className="patient-hero-button" type="button" onClick={() => onNavigate('appointments')}>
          {translate('patientOverview.bookConsultation')} <ArrowRight size={17} aria-hidden="true"/>
        </button>
      </div>
      <div className="patient-hero-image">
        <img src="/images/dashboard/action-consult.png" alt={translate('patientOverview.heroImageAlt')} fetchpriority="high"/>
        <div className="patient-hero-image-note"><HeartPulse size={19} aria-hidden="true"/><span>{translate('patientOverview.heroImageNote')}</span></div>
      </div>
      <button className="patient-dashboard-refresh" type="button" onClick={onRefresh} aria-label={translate('common.refresh')} title={translate('common.refresh')}>↻</button>
    </section>
    <section className="patient-dashboard-stats" aria-label={translate('dashboard.patientNavigation.healthSummary')}>
      {stats.map(({ label, value, note, Icon }) => <article className="patient-dashboard-stat" key={label}>
        <span className="patient-dashboard-stat-icon"><Icon size={19} aria-hidden="true"/></span>
        <span className="patient-dashboard-stat-copy"><b>{label}</b><strong>{loading ? '—' : value}</strong><small>{note}</small></span>
      </article>)}
    </section>
    <nav className="patient-quick-actions" aria-label={translate('dashboard.quickActions')}>
      {actions.map(({ route, label, Icon, tone }) => <button className={`patient-quick-action tone-${tone}`} key={route} type="button" onClick={() => onNavigate(route)}>
        <span className="patient-quick-icon"><Icon size={24} aria-hidden="true"/></span><span>{label}</span><ArrowRight className="patient-quick-arrow" size={18} aria-hidden="true"/>
      </button>)}
    </nav>
    <section className="patient-dashboard-panels">
      <article className="patient-dashboard-card patient-appointment-card">
        <header className="patient-card-heading">
          <div className="patient-card-title"><span className="patient-card-heading-icon"><CalendarDays size={19} aria-hidden="true"/></span><div><h2>{translate('patientOverview.upcomingAppointments')}</h2><p>{translate('patientOverview.appointmentCountNote')}</p></div></div>
          <button className="patient-text-link" type="button" onClick={() => onNavigate('appointments')}>{translate('dashboard.viewAll')} <ArrowRight size={15} aria-hidden="true"/></button>
        </header>
        {loading
          ? <div className="patient-card-loading"><span className="spinner"/>{translate('dashboard.loadingRecords')}</div>
          : nextAppointment
            ? <div className="patient-next-appointment">
                <span className="patient-doctor-avatar" aria-hidden="true"><Stethoscope size={25}/></span>
                <div className="patient-doctor-details"><strong>{nextAppointment.provider?.name || translate('telemedicine.doctor')}</strong><span>{specialist}</span></div>
                <span className={`patient-appointment-status ${statusClass(nextAppointment.status)}`}>{appointmentStatus}</span>
                <div className="patient-appointment-time">
                  <span><CalendarDays size={16} aria-hidden="true"/><time dateTime={nextAppointment.scheduledAt}>{appointmentDate.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</time></span>
                  <span><Clock3 size={16} aria-hidden="true"/><time dateTime={nextAppointment.scheduledAt}>{appointmentDate.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</time></span>
                </div>
                <button className="patient-appointment-cta" type="button" onClick={() => onNavigate(isVideoAppointment(nextAppointment) ? 'video-consultation' : 'appointments')}>
                  <Video size={18} aria-hidden="true"/>{canJoinNextAppointment ? translate('patientOverview.joinVideoCall') : translate('patientOverview.manageAppointment')}
                </button>
              </div>
            : <div className="patient-empty-appointment"><b>{translate('patientOverview.noAppointments')}</b><p>{translate('patientOverview.noAppointmentsHelp')}</p><button className="patient-appointment-cta" type="button" onClick={() => onNavigate('appointments')}>{translate('patientOverview.bookConsultation')} <ArrowRight size={16}/></button></div>}
      </article>
      <article className="patient-dashboard-card patient-video-card">
        <header className="patient-card-heading">
          <div className="patient-card-title"><span className="patient-card-heading-icon"><Video size={19} aria-hidden="true"/></span><div><h2>{translate('patientOverview.videoConsultation')}</h2><p>{translate('patientOverview.videoConsultationHelp')}</p></div></div>
          <span className={`patient-video-status ${loading || error ? 'is-pending' : ''}`}><i aria-hidden="true"/>{loading ? translate('dashboard.connecting') : error ? translate('dashboard.offline') : translate(nextVideoAppointment?.status === 'Confirmed' ? 'patientOverview.confirmedVisit' : 'patientOverview.secureVisits')}</span>
        </header>
        <div className="patient-video-illustration" aria-hidden="true">
          <div className="patient-video-device"><span><Video size={32}/></span><i><Wifi size={24}/></i></div>
          <span className="patient-video-sparkle">✦</span>
          <span className="patient-video-cross">✚</span>
        </div>
        <p className="patient-video-message">{nextVideoAppointment?.status === 'Confirmed' ? translate('patientOverview.videoReadyMessage') : translate('patientOverview.videoEmptyMessage')}</p>
        <button className="patient-video-cta" type="button" onClick={() => onNavigate('video-consultation')}>{translate(nextVideoAppointment?.status === 'Confirmed' ? 'patientOverview.joinNow' : 'patientOverview.bookVideo')} <ArrowRight size={16} aria-hidden="true"/></button>
      </article>
      <article className="patient-dashboard-card patient-health-tips">
        <header className="patient-card-heading">
          <div className="patient-card-title"><span className="patient-card-heading-icon patient-tip-bulb" aria-hidden="true">✦</span><div><h2>{translate('patientOverview.healthTips')}</h2><p>{translate('patientOverview.healthTipsHelp')}</p></div></div>
        </header>
        <img className="patient-tips-image" src="/images/oral-hygiene-brushing-guide.png" alt={translate('patientOverview.healthTipsImageAlt')} loading="lazy" decoding="async"/>
        <p className="patient-tips-title">{translate('patientOverview.healthyMouth')}</p>
        <ul className="patient-tips-list">
          {['brush', 'avoidTobacco', 'regularCheckups'].map(key => <li key={key}><Check size={15} aria-hidden="true"/>{translate(`patientOverview.tips.${key}`)}</li>)}
        </ul>
        <button className="patient-text-link patient-learn-more" type="button" onClick={() => onNavigate('education')}>{translate('patientOverview.learnMore')} <ArrowRight size={15} aria-hidden="true"/></button>
      </article>
    </section>
    <section className="patient-health-highlights" aria-label={translate('patientOverview.healthHighlights')}>
      {[
        [MapPin, 'remoteAccess'],
        [ShieldCheck, 'secureCare'],
        [HeartPulse, 'aiDetection'],
        [Users, 'healthyCommunity']
      ].map(([Icon, key]) => <article key={key}><span><Icon size={24} aria-hidden="true"/></span><p>{translate(`patientOverview.highlights.${key}`)}</p></article>)}
    </section>
    <section className="patient-overview-lower">
      <article className="patient-dashboard-card patient-latest-screening">
        <header className="patient-card-heading">
          <div className="patient-card-title"><span className="patient-card-heading-icon"><Stethoscope size={18} aria-hidden="true"/></span><div><h2>{translate('patientOverview.latestScreening')}</h2><p>{translate('patientOverview.latestScreeningHelp')}</p></div></div>
          <button className="patient-text-link" type="button" onClick={() => onNavigate('screening-history')}>{translate('dashboard.viewAll')} <ArrowRight size={15}/></button>
        </header>
        {loading
          ? <div className="patient-card-loading"><span className="spinner"/>{translate('dashboard.loadingRecords')}</div>
          : latest
            ? <div className="patient-latest-result"><span className={`patient-appointment-status ${statusClass(latest.status || 'Analyzed')}`}>{latestStatus}</span><strong>{latestFinding || translate('patientOverview.latestScreening')}</strong><time dateTime={latest.screenedAt || latest.createdAt}>{new Date(latest.screenedAt || latest.createdAt).toLocaleString(locale)}</time></div>
            : <div className="patient-empty-copy"><b>{translate('patientOverview.noScreening')}</b><p>{translate('patientOverview.noScreeningHelp')}</p></div>}
      </article>
      <article className="patient-dashboard-card patient-recent-notifications">
        <header className="patient-card-heading">
          <div className="patient-card-title"><span className="patient-card-heading-icon"><Bell size={18} aria-hidden="true"/></span><div><h2>{translate('patientOverview.recentNotifications')}</h2><p>{translate('patientOverview.notificationCountNote')}</p></div></div>
          <button className="patient-text-link" type="button" onClick={() => onNavigate('notifications')}>{translate('dashboard.viewAll')} <ArrowRight size={15}/></button>
        </header>
        {notifications.length
          ? <div className="patient-notification-list">{notifications.map(item => <article key={item._id}>
              <span className="patient-notification-icon">{item.type === 'referral' ? <GitBranch size={16}/> : item.type === 'reminder' ? <Clock3 size={16}/> : <Bell size={16}/>}</span>
              <span><b>{item.title}</b><small>{item.message}</small><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(locale)}</time></span>
              <i className={item.readAt ? 'is-read' : ''} title={translate(item.readAt ? 'patientOverview.read' : 'patientOverview.unread')}/>
            </article>)}</div>
          : <div className="patient-empty-copy"><b>{translate('patientOverview.noNotifications')}</b></div>}
      </article>
    </section>
  </div>;
}

function PatientAvatar({ patient, name }) {
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoError, setPhotoError] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setPhotoError('');
    if (!patient?.hasProfilePhoto) {
      setPhotoUrl('');
      return () => { active = false; };
    }
    getPatientProfilePhoto()
      .then(blob => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setPhotoUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(failure => { if (active) setPhotoError(failure.message); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [patient?._id, patient?.hasProfilePhoto]);
  const initials = (name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  return photoUrl
    ? <img className="patient-avatar-image" src={photoUrl} alt={`${name} profile`}/>
    : <span className="avatar patient-avatar-fallback" title={photoError || name}>{initials}</span>;
}

function PhotoStatCard({ tone, label, value, note, img, icon }) {
  return <article className={`overview-photo-stat tone-${tone}`}>
    <img src={img} alt="" loading="lazy" decoding="async"/>
    <div className="overview-stat-content"><div className="overview-stat-label"><span>{label}</span><i aria-hidden="true">{icon}</i></div><strong>{value}</strong><small>{note}</small></div>
  </article>;
}

function PatientList({ rows, lang, onUpdatePatient }) {
  const { t: translate } = useTranslation();
  return <div className="overview-patient-list">{rows.slice(0, 3).map((patient, index) => {
    const initials = (patient.name || '?').split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
    const image = [patient.avatarUrl, patient.photoUrl].find(source => typeof source === 'string' && source.startsWith('/'));
    return <article className="overview-patient-row" key={patient._id}>
      {image ? <img className="overview-patient-avatar" src={image} alt={patient.name} loading="lazy"/> : <span className={`overview-patient-avatar initials-avatar q-${index}`} aria-hidden="true">{initials}</span>}
      <span className="overview-patient-copy"><b>{patient.name}</b><small>{patient.patientId} · {patient.village}</small><small>{patient.updatedAt ? formatTimeAgo(patient.updatedAt, translate, lang) : translate('dashboard.recentRecord')} · {patient.status ? translate(`statuses.${patient.status}`) : translate('dashboard.statusUnavailable')}</small></span>
      {onUpdatePatient ? <select className="inline-status overview-status-select" aria-label={translate('dashboard.updatePatientStatus', { name: patient.name })} value={patient.status} onChange={event => onUpdatePatient(patient._id, { status: event.target.value })}>{['Needs review', 'Follow-up', 'Reviewed', 'Referred', 'Screened'].map(status => <option key={status} value={status}>{translate(`statuses.${status}`)}</option>)}</select> : <span className={`status-tag overview-status-tag ${statusClass(patient.status)}`}>{translate(`statuses.${patient.status}`)}</span>}
    </article>;
  })}{!rows.length && <div className="overview-recent-empty">{translate('dashboard.noPatientRecords')}</div>}</div>;
}

function formatTimeAgo(value, translate, language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate('dashboard.recentRecord');
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return translate('dashboard.justNow');
  if (minutes < 60) return translate('dashboard.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return translate('dashboard.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  const locale = language === 'te' ? 'te-IN' : language === 'hi' ? 'hi-IN' : 'en-US';
  return days < 7 ? translate('dashboard.daysAgo', { count: days }) : date.toLocaleDateString(locale);
}

function DataPage({ page, roleId, records, patients, query, setQuery, filter, setFilter, t, onCreatePatient, onUpdatePatient, voiceStart, accountId }) {
  const { t: translate, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  if (page === 'patients') return <PatientTable rows={patients} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} t={t} onCreatePatient={onCreatePatient} onUpdatePatient={onUpdatePatient} voiceStart={voiceStart} accountId={accountId}/>;
  if (page === 'reports') {
    const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
    const chartData = records.screenings.reduce((days, item) => { const day = new Date(item.screenedAt || item.createdAt).toLocaleDateString(locale, { weekday: 'short' }); let current = days.find(row => row.day === day); if (!current) { current = { day, screened: 0, reviewed: 0 }; days.push(current); } current.screened++; if (item.status === 'Reviewed') current.reviewed++; return days; }, []);
    return <div className="panel standalone-report"><div className="panel-heading"><div><h2>{t.trend}</h2><p>{translate('dashboard.reportActivity')}</p></div><span className="db-pill">{translate('common.connected').toUpperCase()}</span></div><div className="chart-area report-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid stroke="#20334a" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="day"/><YAxis/><Tooltip/><Area type="monotone" dataKey="screened" stroke="#4bd3c1" fill="#43d2c022"/><Area type="monotone" dataKey="reviewed" stroke="#7199ff" fill="#7199ff22"/></AreaChart></ResponsiveContainer></div></div>;
  }
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
  const patientName = id => records.patients.find(item => item._id === id)?.name || translate('dashboard.patientRecord');
  const hospitalName = id => records.hospitals.find(item => item._id === id)?.name || translate('dashboard.careFacility');
  if (page === 'referrals' && roleId === 'patient') {
    return <section className="panel list-panel patient-referrals-panel">
      <div className="panel-heading"><div><h2>{translate('navigation.my-referrals')}</h2><p>{translate('patientOverview.referralsHelp')}</p></div></div>
      {records.referrals.length
        ? <div className="content-list">{records.referrals.map(item => <article key={item._id}>
            <span className="list-marker">↗</span>
            <span className="list-main"><b>{hospitalName(item.hospital)}</b><small>{new Date(item.referredAt || item.createdAt).toLocaleString(locale)}</small><small>{item.reason}</small></span>
            <span className={`status-tag ${statusClass(item.status)}`}>{translate(`statuses.${item.status}`, { defaultValue: item.status })}</span>
          </article>)}</div>
        : <div className="empty-state"><span>↗</span><b>{t.empty}</b><p>{translate('patientOverview.noReferrals')}</p></div>}
    </section>;
  }
  if (page === 'facilities') return <section className="panel list-panel"><div className="panel-heading"><div><h2>{translate('navigation.facilities')}</h2><p>{pageDescription(page, roleId, translate)}</p></div><span className="db-pill">{translate('common.connected').toUpperCase()}</span></div>{records.hospitals.length ? <div className="content-list">{records.hospitals.map(facility => <article className="facility-list-row" key={facility._id}><span className="list-marker" aria-hidden="true">⌖</span><span className="list-main"><b>{facility.name}</b><small>{[facility.village, facility.facilityType, facility.district].filter(Boolean).join(' · ')}</small></span><span className={`status-tag ${statusClass(translate(`statuses.${facility.isActive ? 'Open' : 'Closed'}`))}`}>{translate(`statuses.${facility.isActive ? 'Open' : 'Closed'}`)}</span><button className="facility-list-view" type="button" onClick={() => navigate(roleId === 'admin' ? `/admin/facilities/${encodeURIComponent(facility._id)}` : `/facilities/${encodeURIComponent(facility._id)}`, { state: { from: `${location.pathname}${location.search}` } })}>{translate('common.viewDetails')} →</button></article>)}</div> : <div className="empty-state"><span>▤</span><b>{t.empty}</b><p>{translate('dashboard.noSavedRecords')}</p></div>}</section>;
  const data = page === 'appointments' ? records.appointments.map(item => [new Date(item.scheduledAt).toLocaleString(locale), patientName(item.patient), item.type, translate(`statuses.${item.status}`, { defaultValue: item.status })])
    : page === 'referrals' ? records.referrals.map(item => [item._id.slice(-6).toUpperCase(), patientName(item.patient), hospitalName(item.hospital), translate(`statuses.${item.status}`, { defaultValue: item.status })])
      : page === 'facilities' ? records.hospitals.map(item => [item.name, item.village, `${item.facilityType} · ${(item.services || []).join(', ')}`, translate(`statuses.${item.isActive ? 'Open' : 'Closed'}`)]) : [];
  return <section className="panel list-panel"><div className="panel-heading"><div><h2>{translate(`navigation.${page}`)}</h2><p>{pageDescription(page, roles[0], translate)}</p></div><span className="db-pill">{translate('common.connected').toUpperCase()}</span></div>{data.length ? <div className="content-list">{data.map((row, i) => <article key={i}><span className="list-marker">{page === 'appointments' ? '▣' : page === 'facilities' ? '⌖' : '↗'}</span><span className="list-main"><b>{row[1]}</b><small>{row[0]} · {row[2]}</small></span><span className={`status-tag ${statusClass(row[3])}`}>{row[3]}</span></article>)}</div> : <div className="empty-state"><span>▤</span><b>{t.empty}</b><p>{translate('dashboard.noSavedRecords')}</p></div>}</section>;
}

function PatientTable({ rows, t, compact = false, onPatients, onCreatePatient, onUpdatePatient, query = '', setQuery = () => {}, filter = 'All', setFilter = () => {}, voiceStart = false, accountId }) {
  const { t: translate, i18n } = useTranslation();
  const [showForm, setShowForm] = useState(voiceStart), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => { if (voiceStart) setShowForm(true); }, [voiceStart]);
  async function submit(event) { event.preventDefault(); setSaving(true); setError(''); const form = new FormData(event.currentTarget); const patient = { name: form.get('name'), patientId: form.get('patientId'), village: form.get('village'), district: form.get('district'), status: 'Screened' }; try { if (!online) { if (form.get('offlineConsent') !== 'on') throw new Error(translate('offline.consentRequired')); await saveOfflinePatientDraft({ userId: accountId, patient, consentGranted: true }); } else { await onCreatePatient(patient); } setShowForm(false); } catch (failure) { setError(failure.message); } finally { setSaving(false); } }
  const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
  return <section className={`panel patient-panel ${compact ? 'compact-table' : ''}`}><div className="panel-heading"><div><h2>{t.patients}</h2><p>{translate('dashboard.patientRecords')}</p></div>{compact ? <button className="text-link" onClick={onPatients}>{translate('dashboard.viewAll')}</button> : <div className="table-heading-actions"><span className="db-pill">{online ? translate('common.connected').toUpperCase() : translate('offline.offline').toUpperCase()}</span><button className="export-button" onClick={() => onCreatePatient && setShowForm(!showForm)}>{showForm ? translate('common.cancel') : translate('dashboard.addPatient')}</button></div>}</div>{showForm && <form className="patient-create" onSubmit={submit}><label>{translate('auth.fullName')}<input name="name" required placeholder={translate('dashboard.patientName')} maxLength="120"/></label><label>{translate('dashboard.patientId')}<input name="patientId" required placeholder={translate('dashboard.patientId')} maxLength="40"/></label><label>{translate('auth.village')}<input name="village" required placeholder={translate('auth.village')} maxLength="120"/></label><label>{translate('qr.district')}<input name="district" placeholder={translate('qr.district')} maxLength="120"/></label>{!online && <label className="offline-consent"><input type="checkbox" name="offlineConsent" required/><span>{translate('offline.registrationConsent')}</span></label>}<button disabled={saving}>{saving ? translate('common.saving') : online ? translate('common.save') : translate('offline.saveDraft')}</button>{error && <span className="form-error" role="alert">{error}</span>}</form>}{!compact && <div className="table-controls"><label className="search-input"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search}/></label><select value={filter} onChange={event => setFilter(event.target.value)}><option value="All">{t.all}</option>{['Needs review', 'Follow-up', 'Reviewed', 'Referred', 'Screened'].map(status => <option key={status} value={status}>{translate(`statuses.${status}`)}</option>)}</select></div>}<div className="table-scroll"><table><thead><tr><th>{translate('common.patient').toUpperCase()}</th><th>{translate('dashboard.patientId').toUpperCase()}</th><th>{translate('dashboard.community').toUpperCase()}</th><th>{translate('dashboard.status').toUpperCase()}</th><th>{translate('dashboard.lastUpdated').toUpperCase()}</th></tr></thead><tbody>{rows.map(patient => <tr key={patient._id}><td data-label={translate('common.patient')}><span className="table-person"><i>{patient.name.split(' ').map(part => part[0]).join('')}</i><b>{patient.name}</b></span></td><td data-label={translate('dashboard.patientId')} className="muted-cell">{patient.patientId}</td><td data-label={translate('dashboard.community')} className="muted-cell">{patient.village}</td><td data-label={translate('dashboard.status')}>{onUpdatePatient ? <select className="inline-status" aria-label={translate('dashboard.updateStatus', { name: patient.name })} value={patient.status} onChange={event => onUpdatePatient(patient._id, { status: event.target.value })}>{['Needs review', 'Follow-up', 'Reviewed', 'Referred', 'Screened'].map(status => <option key={status} value={status}>{translate(`statuses.${status}`)}</option>)}</select> : <span className={`status-tag ${statusClass(patient.status)}`}>{translate(`statuses.${patient.status}`)}</span>}</td><td data-label={translate('dashboard.lastUpdated')} className="muted-cell">{patient.updatedAt ? new Date(patient.updatedAt).toLocaleString(locale) : '—'}</td></tr>)}</tbody></table>{!rows.length && <div className="empty-state"><span>⌕</span><b>{t.empty}</b><p>{translate('dashboard.tryFilters')}</p></div>}</div></section>;
}

function Settings({ role, account, onUpdateProfile }) {
  const { t: translate, i18n } = useTranslation();
  const language = ['en', 'te', 'hi'].includes(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
  return <>
    {role.id === 'doctor' && <DoctorProfileSettings account={account} onUpdateProfile={onUpdateProfile}/>}
    <section className="panel settings-panel"><div className="panel-heading"><div><h2>{translate('dashboard.preferences')}</h2><p>{translate('dashboard.currentRole')}</p></div></div><div className="setting-row"><span><b>{translate('dashboard.accountRole')}</b><small>{translate('dashboard.roleDemo')}</small></span><span className="setting-value">{translate(`roles.${role.id}`)}</span></div><div className="setting-row"><span><b>{translate('dashboard.language')}</b><small>{translate('dashboard.languageHint')}</small></span><span className="setting-value">{translate(`language.${language}`)}</span></div><div className="setting-row"><span><b>{translate('dashboard.data')}</b><small>{translate('dashboard.syntheticData')}</small></span><span className="db-pill">MONGODB</span></div></section>
  </>;
}

function DoctorProfileSettings({ account, onUpdateProfile }) {
  const { t: translate } = useTranslation();
  const profile = account.doctorProfile || {};
  const initialDepartment = profile.department || departmentForSpecialty(profile.specialization || '');
  const [form, setForm] = useState(() => ({
    name: account.name || '',
    department: initialDepartment,
    specialization: profile.specialization || '',
    yearsExperience: profile.yearsExperience == null ? '' : String(profile.yearsExperience),
    expertise: profile.expertise || [],
    consultationFee: profile.consultationFee == null ? '' : String(profile.consultationFee),
    biography: profile.biography || ''
  }));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  useEffect(() => {
    const currentProfile = account.doctorProfile || {};
    const currentDepartment = currentProfile.department || departmentForSpecialty(currentProfile.specialization || '');
    setForm({
      name: account.name || '',
      department: currentDepartment,
      specialization: currentProfile.specialization || '',
      yearsExperience: currentProfile.yearsExperience == null ? '' : String(currentProfile.yearsExperience),
      expertise: currentProfile.expertise || [],
      consultationFee: currentProfile.consultationFee == null ? '' : String(currentProfile.consultationFee),
      biography: currentProfile.biography || ''
    });
  }, [account]);
  function updateField(event) {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
    setSaved(false);
  }
  function updateDepartment(event) {
    const department = event.target.value;
    const options = specialtiesForDepartment(department);
    setForm(current => ({
      ...current,
      department,
      specialization: options.includes(current.specialization) ? current.specialization : options[0] || ''
    }));
    setSaved(false);
  }
  function updateExpertise(value, checked) {
    setForm(current => ({
      ...current,
      expertise: checked
        ? [...new Set([...current.expertise, value])]
        : current.expertise.filter(item => item !== value)
    }));
    setSaved(false);
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await onUpdateProfile({
        name: form.name,
        doctorProfile: {
          department: form.department,
          specialization: form.specialization,
          yearsExperience: form.yearsExperience === '' ? null : Number(form.yearsExperience),
          expertise: form.expertise,
          consultationFee: form.consultationFee === '' ? null : Number(form.consultationFee),
          biography: form.biography
        }
      });
      setSaved(true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return <section className="panel settings-panel doctor-profile-panel">
    <div className="panel-heading"><div><h2>{translate('doctorProfile.title')}</h2><p>{translate('doctorProfile.description')}</p></div></div>
    <form className="doctor-profile-form" onSubmit={submit}>
      <div className="doctor-profile-fields">
        <label>{translate('doctorProfile.name')}<input name="name" value={form.name} onChange={updateField} required maxLength={120}/></label>
        <label>{translate('doctorProfile.department')}<select name="department" value={form.department} onChange={updateDepartment} required>
          <option value="">{translate('doctorProfile.selectDepartment')}</option>
          {form.department && !oralHealthDepartments.some(item => item.name === form.department) && <option value={form.department}>{form.department}</option>}
          {oralHealthDepartments.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select></label>
        <label>{translate('doctorProfile.specialization')}<select name="specialization" value={form.specialization} onChange={updateField} required disabled={!form.department}>
          <option value="">{translate('doctorProfile.selectSpecialization')}</option>
          {form.specialization && !specialtiesForDepartment(form.department).includes(form.specialization) && <option value={form.specialization}>{form.specialization}</option>}
          {specialtiesForDepartment(form.department).map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label>{translate('doctorProfile.yearsExperience')}<input name="yearsExperience" type="number" value={form.yearsExperience} onChange={updateField} min="0" max="80" step="1"/></label>
        <label>{translate('doctorProfile.consultationFee')}<input name="consultationFee" type="number" value={form.consultationFee} onChange={updateField} min="0" max="1000000" step="0.01"/></label>
        <fieldset className="doctor-profile-wide doctor-profile-expertise">
          <legend>{translate('doctorProfile.expertise')}</legend>
          <div className="doctor-profile-expertise-list">
            {[...new Set([...form.expertise, ...oralHealthSpecialties])].map(value => <label key={value}>
              <input type="checkbox" checked={form.expertise.includes(value)} onChange={event => updateExpertise(value, event.target.checked)}/>
              <span>{value}</span>
            </label>)}
          </div>
        </fieldset>
        <label className="doctor-profile-wide">{translate('doctorProfile.biography')}<textarea name="biography" value={form.biography} onChange={updateField} maxLength={2000} rows={4}/></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {saved && <p className="doctor-profile-saved" role="status">{translate('doctorProfile.saved')}</p>}
      <button className="date-chip doctor-profile-submit" disabled={busy}>{busy ? translate('doctorProfile.saving') : translate('doctorProfile.save')}</button>
    </form>
  </section>;
}
