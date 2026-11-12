import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import i18n, { supportedLanguages } from '../i18n/index.js';
import { authRequest, changePassword as submitPasswordChange, fetchRefreshToken, requestPatientOtp as requestOtp, setAccessToken, setRefreshHandler, updateDoctorProfile as saveDoctorProfile, updateLanguagePreference, verifyPatientOtp as verifyOtp } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true), [qrToken, setQrToken] = useState(null), [sessionStatus, setSessionStatus] = useState(null);
  const refresh = useCallback(async () => {
    const session = await fetchRefreshToken();
    setAccessToken(session.accessToken); setUser(session.user);
    setSessionStatus(null);
    return session.accessToken;
  }, []);
  const clear = useCallback(() => { setAccessToken(null); setUser(null); setQrToken(null); setSessionStatus(null); }, []);

  useEffect(() => {
    setRefreshHandler(refresh);
    const expired = () => {
      setAccessToken(null); setUser(null); setQrToken(null); setSessionStatus('expired');
    };
    const unavailable = () => setSessionStatus('unavailable');
    window.addEventListener('aarogya:session-expired', expired);
    window.addEventListener('aarogya:session-unavailable', unavailable);
    refresh().catch(error => {
      clear();
      if (error.response?.status !== 401) setSessionStatus('unavailable');
    }).finally(() => setLoading(false));
    return () => {
      setRefreshHandler(null);
      window.removeEventListener('aarogya:session-expired', expired);
      window.removeEventListener('aarogya:session-unavailable', unavailable);
    };
  }, [refresh, clear]);

  useEffect(() => {
    if (!user || !supportedLanguages.includes(user.language) || i18n.resolvedLanguage === user.language) return;
    try {
      if (supportedLanguages.includes(window.localStorage.getItem('aarogya-language'))) return;
    } catch {
      // The account language is used when browser preference storage is unavailable.
    }
    i18n.changeLanguage(user.language).catch(error => {
      console.error('Could not apply the account language preference.', error);
    });
  }, [user]);

  const login = async credentials => {
    const session = await authRequest('login', credentials);
    setAccessToken(session.accessToken); setUser(session.user); setQrToken(null); setSessionStatus(null); return session.user;
  };
  const requestPatientOtp = data => requestOtp(data);
  const verifyPatientOtp = async data => {
    const session = await verifyOtp(data);
    setAccessToken(session.accessToken); setUser(session.user); setQrToken(session.qrToken || null); setSessionStatus(null); return session.user;
  };
  const register = async details => {
    const language = supportedLanguages.includes(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
    const session = await authRequest('register', { ...details, language });
    setAccessToken(session.accessToken); setUser(session.user); setQrToken(session.qrToken || null); setSessionStatus(null); return session.user;
  };
  const updateLanguage = useCallback(async language => {
    const result = await updateLanguagePreference(language);
    setUser(current => current ? { ...current, ...result.user } : current);
    return result.user.language;
  }, []);
  const updateProfile = useCallback(async details => {
    const result = await saveDoctorProfile(details);
    setUser(current => current ? { ...current, ...result.user } : current);
    return result.user;
  }, []);
  const changePassword = useCallback(async details => {
    const session = await submitPasswordChange(details);
    setUser(session.user);
    setSessionStatus(null);
    return session.user;
  }, []);
  const logout = async () => { try { await authRequest('logout'); } finally { clear(); } };
  const forgotPassword = email => authRequest('forgot-password', { email });
  const resetPassword = details => authRequest('reset-password', details);
  const value = useMemo(() => ({ user, loading, qrToken, sessionStatus, setQrToken, login, register, requestPatientOtp, verifyPatientOtp, updateLanguage, updateProfile, changePassword, logout, forgotPassword, resetPassword }), [user, loading, qrToken, sessionStatus, updateLanguage, updateProfile, changePassword]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
