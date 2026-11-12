import axios from 'axios';
import { cachePublishedEducation, readCachedEducation } from './offlineStorage.js';

const configuredApiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? '/api' : 'https://aarogya-dristi.onrender.com')
).replace(/\/+$/, '');
const apiBaseUrl = configuredApiBaseUrl.endsWith('/api')
  ? configuredApiBaseUrl
  : `${configuredApiBaseUrl}/api`;

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

let accessToken = null;
let refreshHandler = null;
let refreshInFlight = null;
export function setAccessToken(token) { accessToken = token || null; }
export function getAccessToken() { return accessToken; }
export function getRealtimeOrigin() { return new URL(api.defaults.baseURL, window.location.origin).origin; }
export function setRefreshHandler(handler) { refreshHandler = handler; }
api.interceptors.request.use(config => { if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`; return config; });
api.interceptors.response.use((response) => response, async (error) => {
  const config = error.config;
  const url = config?.url || '';
  const publicAuthRoute = /\/auth\/(login|register|refresh|logout|forgot-password|reset-password)/.test(url);
  if (error.response?.status === 401 && config && !config._retried && !publicAuthRoute && refreshHandler) {
    config._retried = true;
    try {
      if (!refreshInFlight) refreshInFlight = refreshHandler().finally(() => { refreshInFlight = null; });
      const token = await refreshInFlight;
      config.headers.Authorization = `Bearer ${token}`;
      return api(config);
    }
    catch (refreshError) {
      if (refreshError.response?.status === 401) window.dispatchEvent(new CustomEvent('aarogya:session-expired'));
      else {
        window.dispatchEvent(new CustomEvent('aarogya:session-unavailable'));
        return Promise.reject(refreshError);
      }
    }
  }
  const message = error.response?.data?.message || (error.code === 'ECONNABORTED' ? 'The API request timed out.' : error.message === 'Network Error' ? 'Cannot reach the API. Start the backend and try again.' : error.message);
  const failure = new Error(message);
  failure.statusCode = error.response?.status;
  return Promise.reject(failure);
});

const payload = (response) => response.data.data;
export async function getHealth() { return payload(await api.get('/health')); }
export async function updateLanguagePreference(language) { return payload(await api.put('/auth/language', { language })); }
export async function updateDoctorProfile(data) { return payload(await api.patch('/auth/profile', data)); }
export async function createGeminiLiveToken(language = 'auto') { return payload(await api.post('/assistant/live-token', { language }, { timeout: 20000 })); }
export async function sendAssistantMessage(data) { return payload(await api.post('/assistant/message', data, { timeout: 45000 })); }
export async function createVoiceConversation(language = 'auto') { return payload(await api.post('/assistant/conversations', { language })); }
export async function saveVoiceConversationTurn(id, data) { return payload(await api.post(`/assistant/conversations/${id}/messages`, data)); }
export async function deleteVoiceConversation(id) { return payload(await api.delete(`/assistant/conversations/${id}`)); }
export async function getVoiceConversations(params = {}) { return payload(await api.get('/assistant/conversations', { params })); }
export async function getVoiceConversationMessages(id, params = {}) { return payload(await api.get(`/assistant/conversations/${id}/messages`, { params })); }
export async function getResource(resource, params = {}) { return payload(await api.get(`/${resource}`, { params })); }
export async function getResourceRecord(resource, id) { return payload(await api.get(`/${resource}/${encodeURIComponent(id)}`)); }
export async function createResource(resource, data) { return payload(await api.post(`/${resource}`, data)); }
export async function updateResource(resource, id, data) { return payload(await api.patch(`/${resource}/${id}`, data)); }
export async function deleteResource(resource, id) { return payload(await api.delete(`/${resource}/${id}`)); }
export async function getPatientProfile() { return payload(await api.get('/patients/me')); }
export async function updatePatientProfile(data) { return payload(await api.put('/patients/me', data)); }
export async function getPatientProfilePhoto() { return (await api.get('/patients/me/photo', { responseType: 'blob' })).data; }
export async function uploadPatientProfilePhoto(file) {
  const form = new FormData();
  form.append('photo', file);
  return payload(await api.post('/patients/me/photo', form, { timeout: 30000, headers: { 'Content-Type': 'multipart/form-data' } }));
}
export async function deletePatientProfilePhoto() { return payload(await api.delete('/patients/me/photo')); }
export async function getMyScreenings(params = {}) { return payload(await api.get('/patients/my-screenings', { params })); }
export async function getMyAppointments(params = {}) { return payload(await api.get('/patients/my-appointments', { params })); }
export async function getAdminDashboard() { return payload(await api.get('/admin/dashboard')); }
export async function getAdminFacilities(params = {}) { return payload(await api.get('/facilities/', { params })); }
export async function getAdminFacilitySummary() { return payload(await api.get('/facilities/summary')); }
export async function getAdminFacility(id) { return payload(await api.get(`/facilities/${encodeURIComponent(id)}`)); }
export async function updateAdminFacility(id, data) { return payload(await api.put(`/facilities/${encodeURIComponent(id)}`, data)); }
export async function getAdminActivity(params = {}) { return payload(await api.get('/admin/activity', { params })); }
export async function getAdminHospitals(params = {}) { return payload(await api.get('/admin/hospitals', { params })); }
export async function getAdminHospitalManagers(params = {}) { return payload(await api.get('/admin/hospital-managers', { params })); }
export async function getAdminAccounts(params = {}) { return payload(await api.get('/admin/accounts', { params })); }
export async function createAdminAccount(data) { return payload(await api.post('/admin/accounts', data)); }
export async function getAdminNotificationRecipients(params = {}) { return payload(await api.get('/admin/notification-recipients', { params })); }
export async function getAdminNotifications(params = {}) { return payload(await api.get('/admin/notifications', { params })); }
export async function createAdminNotification(data) { return payload(await api.post('/admin/notifications', data)); }
export async function getAdminReferrals(params = {}) { return payload(await api.get('/admin/referrals', { params })); }
export async function createAdminHospital(data) { return payload(await api.post('/admin/hospitals', data)); }
export async function getAdminDoctors(params = {}) { return payload(await api.get('/admin/doctors', { params })); }
export async function createAdminDoctor(data) { return payload(await api.post('/admin/doctors', data)); }
export async function createAdminStaff(data) { return payload(await api.post('/admin/staff', data)); }
export async function decideAdminDoctor(id, decision) { return payload(await api.put(`/admin/doctors/${encodeURIComponent(id)}/${decision}`)); }
export async function assignAdminDoctorHospital(id, hospitalId) { return payload(await api.put(`/admin/doctors/${encodeURIComponent(id)}/hospital`, { hospitalId })); }
export async function getAdminPatients(params = {}) { return payload(await api.get('/admin/patients', { params })); }
export async function assignPatientDoctor(patientId, doctorId) { return payload(await api.put(`/admin/patients/${encodeURIComponent(patientId)}/assign-doctor`, { doctorId })); }
export async function getPatientHistory(patientId) { return payload(await api.get(`/patients/${patientId}/medical-history`)); }
export async function getPatientQr() { return payload(await api.get('/patient-qr/me')); }
export async function issuePatientQr() { return payload(await api.post('/patient-qr/issue')); }
export async function revokePatientQr() { return payload(await api.post('/patient-qr/revoke')); }
export async function scanPatientQr(token) { return payload(await api.post('/patient-qr/scan', { token })); }
export async function getQrHistory() { return payload(await api.get('/patient-qr/history')); }
export async function getQrConsent() { return payload(await api.get('/patient-qr/consent')); }
export async function setQrConsent(granted) { return payload(await api.put('/patient-qr/consent', { granted })); }
export async function uploadScreening(formData) { return payload(await api.post('/screenings/upload', formData, { timeout: 45000, headers: { 'Content-Type': 'multipart/form-data' } })); }
export async function submitPatientScreening(formData) { return payload(await api.post('/patients/me/screenings', formData, { timeout: 45000, headers: { 'Content-Type': 'multipart/form-data' } })); }
export async function analyzePatientScreening(formData) { return payload(await api.post('/patients/me/screenings/analyze', formData, { timeout: 90000, headers: { 'Content-Type': 'multipart/form-data' } })); }
export async function getScreeningQueue(params = {}) { return payload(await api.get('/screenings/review-queue', { params })); }
export async function reviewScreening(id, data) { return payload(await api.patch(`/screenings/${id}/review`, data)); }
export async function getScreeningImage(id) { return (await api.get(`/screenings/${id}/image`, { responseType: 'blob' })).data; }
export async function transcribeVoice(formData) { return payload(await api.post('/voice-transcripts/voice', formData, { timeout: 65000, headers: { 'Content-Type': 'multipart/form-data' } })); }
export async function saveManualTranscript(data) { return payload(await api.post('/voice-transcripts/manual', data)); }
export async function getVoiceTranscripts(params = {}) { return payload(await api.get('/voice-transcripts', { params })); }
export async function translateTranscript(id, direction) { return payload(await api.post(`/voice-transcripts/${id}/translate`, { direction })); }
export async function reviewTranscript(id, notes) { return payload(await api.patch(`/voice-transcripts/${id}/review`, { notes })); }
export async function synthesizeSpeech(text, language) { return (await api.post('/voice/synthesize', { text, language }, { responseType: 'blob', timeout: 65000 })).data; }
export async function getClinicalPatients(params = {}) { return payload(await api.get('/clinical/patients', { params })); }
export async function getClinicalPatient(patientKey) { return payload(await api.get(`/clinical/patients/${encodeURIComponent(patientKey)}`)); }
export async function createClinicalNote(patientKey, data) { return payload(await api.post(`/clinical/patients/${encodeURIComponent(patientKey)}/notes`, data)); }
export async function createClinicalPrescription(patientKey, data) { return payload(await api.post(`/clinical/patients/${encodeURIComponent(patientKey)}/prescriptions`, data)); }
export async function updateClinicalPrescription(id, data) { return payload(await api.patch(`/clinical/prescriptions/${id}`, data)); }
export async function scheduleClinicalFollowup(patientKey, data) { return payload(await api.post(`/clinical/patients/${encodeURIComponent(patientKey)}/follow-ups`, data)); }
export async function getTelemedicineConfig() { return payload(await api.get('/telemedicine/config')); }
export async function getDoctorAvailability(params = {}) { return payload(await api.get('/telemedicine/availability', { params })); }
export async function getAdminTelemedicineOverview() { return payload(await api.get('/telemedicine/admin/overview')); }
export async function createDoctorAvailability(data) { return payload(await api.post('/telemedicine/availability', data)); }
export async function deleteDoctorAvailability(id) { return payload(await api.delete(`/telemedicine/availability/${id}`)); }
export async function getTelemedicineAppointments() { return payload(await api.get('/telemedicine/appointments')); }
export async function bookTelemedicineAppointment(availabilityId, details) { return payload(await api.post('/telemedicine/appointments', { availabilityId, ...details })); }
export async function bookClinicAppointment(details) { return payload(await api.post('/telemedicine/appointments/clinic', details)); }
export async function recordTelemedicineConsent(id) { return payload(await api.post(`/telemedicine/appointments/${id}/consent`, { granted: true })); }
export async function updateTelemedicineAppointment(id, action, data = {}) { return payload(await api.patch(`/telemedicine/appointments/${id}/${action}`, data)); }
export async function getTelemedicineRoom(id) { return payload(await api.get(`/telemedicine/appointments/${id}/room`)); }
export async function saveConsultationNotes(id, notes) { return payload(await api.patch(`/telemedicine/appointments/${id}/notes`, { notes })); }
export async function getTelemedicinePrescriptions(id) { return payload(await api.get(`/telemedicine/appointments/${id}/prescriptions`)); }
export async function createTelemedicinePrescription(id, data) { return payload(await api.post(`/telemedicine/appointments/${id}/prescriptions`, data)); }
export async function createClinicalReferral(patientKey, data) { return payload(await api.post(`/clinical/patients/${encodeURIComponent(patientKey)}/referrals`, data)); }
export async function uploadClinicalLabReport(patientKey, formData) { return payload(await api.post(`/clinical/patients/${encodeURIComponent(patientKey)}/lab-reports`, formData, { timeout: 30000, headers: { 'Content-Type': 'multipart/form-data' } })); }
export async function downloadClinicalDocument(id) { return (await api.get(`/clinical/documents/${id}`, { responseType: 'blob' })).data; }
export async function getNotifications(params = {}) { return payload(await api.get('/notifications', { params })); }
export async function markNotificationRead(id) { return payload(await api.patch(`/notifications/${id}/read`)); }
export async function markAllNotificationsRead() { return payload(await api.patch('/notifications/read-all')); }
export async function getAnalytics(params = {}) { return payload(await api.get('/analytics', { params })); }
export async function getHealthcareWorkers(params = {}) { return payload(await api.get('/healthcare-workers', { params })); }
export async function getHealthcareWorker(id) { return payload(await api.get(`/healthcare-workers/${encodeURIComponent(id)}`)); }
export async function getHealthcareWorkerStats() { return payload(await api.get('/healthcare-workers/stats')); }
export async function createHealthcareWorker(data) { return payload(await api.post('/healthcare-workers', data)); }
export async function updateHealthcareWorker(id, data) { return payload(await api.patch(`/healthcare-workers/${encodeURIComponent(id)}`, data)); }
export async function setHealthcareWorkerStatus(id, employmentStatus) { return payload(await api.patch(`/healthcare-workers/${encodeURIComponent(id)}/status`, { employmentStatus })); }
export async function getEducationArticles(params = {}) {
  const language = params.language || localStorage.getItem('aarogya-language') || 'en';
  const { language: ignoredLanguage, ...query } = params;
  try {
    const articles = payload(await api.get('/education', { params: query }));
    try { await cachePublishedEducation(articles, language); } catch (error) { console.warn('Could not cache public education articles for offline access.', error); }
    return articles;
  } catch (error) {
    const articles = await readCachedEducation({ language, query: query.q || '', category: query.category || '' });
    if (articles.length || !query.q && !query.category) return articles;
    throw error;
  }
}
export async function getEducationArticle(slug) { return payload(await api.get(`/education/${encodeURIComponent(slug)}`)); }
export async function getEducationVideos(params = {}) { return payload(await api.get('/education/videos', { params })); }
export async function recordEducationVideoView(id) { return payload(await api.post(`/education/videos/${encodeURIComponent(id)}/views`)); }
export async function getEducationVideoHistory(params = {}) { return payload(await api.get('/education/videos/history', { params })); }
export async function getGovernmentDirectory() { return payload(await api.get('/government-directory')); }
export async function getVerifiedProviders(params = {}) { return payload(await api.get('/government-directory/providers', { params })); }
export async function getGovernmentHospitals() { return payload(await api.get('/government-directory/hospitals')); }
export async function getGovernmentHospital(id) { return payload(await api.get(`/government-directory/hospitals/${encodeURIComponent(id)}`)); }
export async function getGovernmentPhcs(params = {}) { return payload(await api.get('/government-directory/phcs', { params })); }
export async function getGovernmentPhcsByMandal(mandalName) { return payload(await api.get(`/government-directory/phcs/mandal/${encodeURIComponent(mandalName)}`)); }
export async function searchGovernmentPhcs(q) { return payload(await api.get('/government-directory/phcs/search', { params: { q } })); }
export async function getGovernmentPhc(id) { return payload(await api.get(`/government-directory/phcs/${encodeURIComponent(id)}`)); }
export async function getFacilityProfile() { return payload(await api.get('/facility/profile')); }
export async function updateFacilityProfile(data) { return payload(await api.patch('/facility/profile', data)); }
export async function getFacilityDoctors() { return payload(await api.get('/facility/doctors')); }
export async function updateAdminDoctorProfessionalProfile(id, data) { return payload(await api.patch(`/facility/doctors/${encodeURIComponent(id)}/professional-profile`, data)); }
export async function uploadProfessionalDocument(doctorId, formData) { return payload(await api.post(`/facility/doctors/${encodeURIComponent(doctorId)}/documents`, formData, { timeout: 30000, headers: { 'Content-Type': 'multipart/form-data' } })); }
export async function verifyProfessionalDocument(id, status) { return payload(await api.patch(`/facility/documents/${encodeURIComponent(id)}/verification`, { status })); }
export async function verifyFacilityDoctor(id) { return payload(await api.post(`/facility/doctors/${encodeURIComponent(id)}/verify`)); }
export async function downloadProfessionalDocument(id) { return (await api.get(`/facility/documents/${encodeURIComponent(id)}/download`, { responseType: 'blob' })).data; }
export async function syncOfflineScreeningMetadata(data) { return payload(await api.post('/screenings/offline-metadata', data)); }
export async function getEducationDrafts(params = {}) { return payload(await api.get('/education/manage', { params })); }
export async function createEducationDraft(data) { return payload(await api.post('/education/manage', data)); }
export async function updateEducationDraft(id, data) { return payload(await api.patch(`/education/manage/${id}`, data)); }
export async function submitEducationDraft(id) { return payload(await api.post(`/education/manage/${id}/submit`)); }
export async function reviewEducationDraft(id, decision, notes = '') { return payload(await api.post(`/education/manage/${id}/review`, { decision, notes })); }
export async function publishEducationArticle(id) { return payload(await api.post(`/education/manage/${id}/publish`)); }
export async function archiveEducationArticle(id) { return payload(await api.post(`/education/manage/${id}/archive`)); }

export async function getDashboardData(role) {
  if (role === 'admin') {
    const [dashboard, patientRecords, hospitals, notifications] = await Promise.all([
      getAdminDashboard(),
      getAdminPatients({ limit: 100 }),
      getResource('hospitals', { limit: 100 }),
      getResource('notifications', { limit: 100 })
    ]);
    return {
      patients: patientRecords.items,
      medicalHistory: [],
      screenings: [],
      appointments: [],
      hospitals: hospitals.items,
      referrals: [],
      notifications: notifications.items,
      adminSummary: dashboard.summary,
      adminDashboard: dashboard,
      referralsByStatus: dashboard.referralsByStatus
    };
  }
  if (role === 'patient') {
    const [profile, screenings, appointments, hospitals, referrals, notifications] = await Promise.all([
      getPatientProfile(),
      getMyScreenings({ limit: 100 }),
      getMyAppointments({ limit: 100 }),
      getResource('hospitals', { limit: 100 }),
      getResource('referrals', { limit: 100 }),
      getResource('notifications', { limit: 100 })
    ]);
    return {
      patients: profile.patient ? [profile.patient] : [],
      medicalHistory: [],
      screenings: screenings.items,
      appointments: appointments.items,
      hospitals: hospitals.items,
      referrals: referrals.items,
      notifications: notifications.items
    };
  }
  const resources = role === 'district'
    ? ['hospitals', 'notifications']
    : role === 'hospital'
      ? ['patients', 'appointments', 'hospitals', 'referrals', 'notifications']
      : ['patients', 'medical-history', 'screenings', 'appointments', 'hospitals', 'referrals', 'notifications'];
  const values = await Promise.all(resources.map((resource) => getResource(resource, { limit: 100 })));
  return { patients: [], medicalHistory: [], screenings: [], appointments: [], hospitals: [], referrals: [], notifications: [], ...Object.fromEntries(resources.map((resource, index) => [resource.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), values[index].items])) };
}

export async function authRequest(path, data = {}) { return payload(await api.post(`/auth/${path}`, data)); }
export async function changePassword(data) {
  const session = payload(await api.post('/auth/change-password', data));
  setAccessToken(session.accessToken);
  return session;
}
export async function requestPatientOtp(data) { return payload(await api.post('/auth/patient-otp/request', data)); }
export async function verifyPatientOtp(data) { return payload(await api.post('/auth/patient-otp/verify', data)); }
export async function fetchRefreshToken() { return payload(await axios.post(`${api.defaults.baseURL}/auth/refresh`, {}, { withCredentials: true })); }

export default api;
