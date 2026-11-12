const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const models = require('../src/models');
const msg91 = require('../src/services/msg91Service');
const { authLimiter } = require('../src/middleware/rateLimits');
const fileStorage = require('../src/services/fileStorageService');

let server, base;
const sessions = new Map();
let testAdminEmail;
const testPatientIds = [];
const testScreeningIds = [];
const testAppointmentIds = [];
const testReferralIds = [];
const testUserIds = [];
const patientOtpPhones = [];
const patientOtpCodes = new Map();
const testQrIds = [];
const testConsentIds = [];
const testAuditIds = [];
const demoPassword = process.env.DEMO_PASSWORD || 'aarogyadrishti';

async function login(email) {
  if (sessions.has(email)) return sessions.get(email);
  let response;
  const account = await models.User.findOne({ email }).select('phone role').lean();
  if (account?.role === 'patient') {
    assert.ok(account.phone, 'test patient must have a phone number');
    if (!patientOtpPhones.includes(account.phone)) patientOtpPhones.push(account.phone);
    const requested = await fetch(`${base}/api/auth/patient-otp/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'login', phone: account.phone })
    });
    assert.equal(requested.status, 202);
    response = await fetch(`${base}/api/auth/patient-otp/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'login', phone: account.phone, code: patientOtpCodes.get(account.phone) })
    });
  } else {
    response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: demoPassword }) });
  }
  assert.equal(response.status, 200, `login failed for ${email}`);
  const payload = await response.json();
  const refreshCookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  const refreshToken = decodeURIComponent(refreshCookie?.slice('refreshToken='.length) || '');
  const session = { token: payload.data.accessToken, cookie: refreshCookie, user: payload.data.user, refreshJti: jwt.decode(refreshToken)?.jti };
  sessions.set(email, session);
  return session;
}
const authHeaders = session => ({ authorization: `Bearer ${session.token}` });

test('security API and QR integration', async t => {
  await connectDB();
  const previousOtpSender = msg91.sendPatientOtp;
  patientOtpCodes.clear();
  msg91.sendPatientOtp = async (phone, code) => { patientOtpCodes.set(phone, code); patientOtpPhones.push(phone); return null; };
  t.after(() => { msg91.sendPatientOtp = previousOtpSender; });
  testAdminEmail = `security-admin-${crypto.randomUUID()}@test.invalid`;
  const testAdmin = await models.User.create({
    name: 'Security Test Administrator', email: testAdminEmail, staffId: `TEST-ADMIN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    role: 'admin', passwordHash: await bcrypt.hash(demoPassword, 12), approvalStatus: 'approved', isActive: true
  });
  testUserIds.push(testAdmin._id);
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    if (testAuditIds.length) await models.AuditLog.deleteMany({ _id: { $in: testAuditIds } });
    if (testQrIds.length) await models.PatientQR.deleteMany({ _id: { $in: testQrIds } });
    const profilePhotoAuditIds = await models.AuditLog.find({
      resourceId: { $in: testPatientIds },
      action: { $in: ['patient.profile_photo_updated', 'patient.profile_photo_removed'] }
    }).distinct('_id');
    if (profilePhotoAuditIds.length) await models.AuditLog.deleteMany({ _id: { $in: profilePhotoAuditIds } });
    if (testScreeningIds.length) await models.OralScreening.deleteMany({ _id: { $in: testScreeningIds } });
    if (testReferralIds.length) {
      await models.Notification.deleteMany({ 'metadata.referralId': { $in: testReferralIds.map(String) } });
      await models.Referral.deleteMany({ _id: { $in: testReferralIds } });
    }
    if (testAppointmentIds.length) await models.Appointment.deleteMany({ _id: { $in: testAppointmentIds } });
    if (testConsentIds.length) await models.Consent.deleteMany({ _id: { $in: testConsentIds } });
    if (testUserIds.length) {
      await models.Notification.deleteMany({ user: { $in: testUserIds } });
      await models.RefreshSession.deleteMany({ user: { $in: testUserIds } });
      const adminActions = await models.AuditLog.find({ resourceId: { $in: [...testUserIds, ...testPatientIds] }, action: /^admin\./ }).distinct('_id');
      if (adminActions.length) await models.AuditLog.deleteMany({ _id: { $in: adminActions } });
    }
    if (patientOtpPhones.length) await models.PatientOtpChallenge.deleteMany({ phone: { $in: patientOtpPhones } });
    if (testScreeningIds.length) await models.AuditLog.deleteMany({ resourceId: { $in: testScreeningIds }, action: 'screening.doctor_reviewed' });
    if (testPatientIds.length) await models.Patient.deleteMany({ _id: { $in: testPatientIds } });
    if (testUserIds.length) await models.User.deleteMany({ _id: { $in: testUserIds } });
    for (const session of sessions.values()) if (session.refreshJti) await models.RefreshSession.deleteOne({ tokenIdHash: crypto.createHash('sha256').update(session.refreshJti).digest('hex') });
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  });

  await t.test('security headers, strict CORS, district privacy, and booking authorization', async () => {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    const unauthenticatedAssistant = await fetch(`${base}/api/assistant/live-token`, { method: 'POST' });
    assert.equal(unauthenticatedAssistant.status, 401);
    const rejectedOrigin = await fetch(`${base}/api/health`, { headers: { origin: 'https://untrusted.example.test' } });
    assert.equal(rejectedOrigin.status, 403);

    const district = await login('district.demo@aarogya.test');
    const patientApi = await fetch(`${base}/api/patients`, { headers: authHeaders(district) });
    assert.equal(patientApi.status, 403);
    const analytics = await fetch(`${base}/api/analytics`, { headers: authHeaders(district) });
    assert.equal(analytics.status, 200);
    const aggregate = (await analytics.json()).data;
    assert.equal(aggregate.summary.registeredPatients, 5);
    const encoded = JSON.stringify(aggregate);
    assert.doesNotMatch(encoded, /patientId|email|phone|dateOfBirth/);

    const patient = await login('patient.demo@aarogya.test');
    const geminiApiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const unconfiguredAssistant = await fetch(`${base}/api/assistant/live-token`, { method: 'POST', headers: authHeaders(patient) });
      assert.equal(unconfiguredAssistant.status, 503);
      assert.match((await unconfiguredAssistant.json()).message, /GEMINI_API_KEY/);
    } finally {
      if (geminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = geminiApiKey;
    }
    const originalLanguage = patient.user.language || 'en';
    const languageRead = await fetch(`${base}/api/auth/language`, { headers: authHeaders(patient) });
    assert.equal(languageRead.status, 200);
    assert.equal((await languageRead.json()).data.language, originalLanguage);
    const languageUpdate = await fetch(`${base}/api/auth/language`, { method: 'PUT', headers: { ...authHeaders(patient), 'content-type': 'application/json' }, body: JSON.stringify({ language: 'te' }) });
    assert.equal(languageUpdate.status, 200);
    assert.equal((await languageUpdate.json()).data.user.language, 'te');
    assert.equal((await models.User.findById(patient.user.id).select('language')).language, 'te');
    const unsupportedLanguage = await fetch(`${base}/api/auth/language`, { method: 'PUT', headers: { ...authHeaders(patient), 'content-type': 'application/json' }, body: JSON.stringify({ language: 'fr' }) });
    assert.equal(unsupportedLanguage.status, 400);
    const restoreLanguage = await fetch(`${base}/api/auth/language`, { method: 'PUT', headers: { ...authHeaders(patient), 'content-type': 'application/json' }, body: JSON.stringify({ language: originalLanguage }) });
    assert.equal(restoreLanguage.status, 200);
    const bypass = await fetch(`${base}/api/appointments`, { method: 'POST', headers: { ...authHeaders(patient), 'content-type': 'application/json' }, body: JSON.stringify({ patient: '000000000000000000000000', provider: '000000000000000000000000', scheduledAt: new Date().toISOString(), status: 'Confirmed', visitMode: 'Video' }) });
    assert.equal(bypass.status, 403);
    const injection = await fetch(`${base}/api/patients?status%5B%24ne%5D=Screened`, { headers: authHeaders(patient) });
    assert.equal(injection.status, 400);

    const demoAccounts = [
      ['patient.demo@aarogya.test', 'patient'], ['lakshmi.demo@aarogya.test', 'asha'],
      ['ananya.demo@aarogya.test', 'doctor'], ['kiran.demo@aarogya.test', 'specialist'],
      ['hospital.demo@aarogya.test', 'hospital'], ['district.demo@aarogya.test', 'district']
    ];
    for (const [email, role] of demoAccounts) assert.equal((await login(email)).user.role, role);
    const staffIdLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'demo-doctor-001', password: demoPassword })
    });
    assert.equal(staffIdLogin.status, 200);
    assert.equal((await staffIdLogin.json()).data.user.staffId, 'DEMO-DOCTOR-001');

    const categoryLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'DEMO-ASHA-001', password: demoPassword, expectedRole: 'staff' })
    });
    assert.equal(categoryLogin.status, 200);
    assert.equal((await categoryLogin.json()).data.user.role, 'asha');
    const staffCannotUseDoctorLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'DEMO-ASHA-001', password: demoPassword, expectedRole: 'doctor' })
    });
    assert.equal(staffCannotUseDoctorLogin.status, 401);
    const doctorCannotUseStaffLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'DEMO-DOCTOR-001', password: demoPassword, expectedRole: 'staff' })
    });
    assert.equal(doctorCannotUseStaffLogin.status, 401);
    const adminCategoryLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: testAdmin.staffId, password: demoPassword, expectedRole: 'admin' })
    });
    assert.equal(adminCategoryLogin.status, 200);
    assert.equal((await adminCategoryLogin.json()).data.user.role, 'admin');
    const patientPasswordLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'patient.demo@aarogya.test', password: demoPassword })
    });
    assert.equal(patientPasswordLogin.status, 401);
    const invalidCategoryLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'DEMO-ASHA-001', password: demoPassword, expectedRole: 'other' })
    });
    assert.equal(invalidCategoryLogin.status, 400);
  });

  await t.test('role account provisioning and patient/doctor data isolation', async () => {
    authLimiter.resetKey('127.0.0.1');
    authLimiter.resetKey('::ffff:127.0.0.1');
    const publicDoctorRegistration = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Public Doctor', email: `public-${crypto.randomUUID()}@test.invalid`, password: demoPassword, role: 'doctor' })
    });
    assert.equal(publicDoctorRegistration.status, 403);

    const patient = await login('patient.demo@aarogya.test');
    const ownPatient = await models.Patient.findOne({ user: patient.user.id }).lean();
    assert.ok(ownPatient);
    const profileResponse = await fetch(`${base}/api/patients/me`, { headers: authHeaders(patient) });
    assert.equal(profileResponse.status, 200);
    assert.equal((await profileResponse.json()).data.patient._id, String(ownPatient._id));
    const otherPatient = await models.Patient.findOne({ user: { $ne: patient.user.id } }).select('_id').lean();
    if (otherPatient) {
      const forbiddenProfile = await fetch(`${base}/api/patients/${otherPatient._id}`, { headers: authHeaders(patient) });
      assert.equal(forbiddenProfile.status, 403);
    }
    const protectedProfileUpdate = await fetch(`${base}/api/patients/me`, {
      method: 'PUT',
      headers: { ...authHeaders(patient), 'content-type': 'application/json' },
      body: JSON.stringify({ assignedDoctor: '000000000000000000000000' })
    });
    assert.equal(protectedProfileUpdate.status, 400);
    const myScreenings = await fetch(`${base}/api/patients/my-screenings`, { headers: authHeaders(patient) });
    assert.equal(myScreenings.status, 200);
    const screenings = (await myScreenings.json()).data.items;
    assert.ok(screenings.every(item => String(item.patient) === String(ownPatient._id)));
    const myAppointments = await fetch(`${base}/api/patients/my-appointments`, { headers: authHeaders(patient) });
    assert.equal(myAppointments.status, 200);
    const appointments = (await myAppointments.json()).data.items;
    assert.ok(appointments.every(item => String(item.patient) === String(ownPatient._id)));
    const myReferrals = await fetch(`${base}/api/referrals`, { headers: authHeaders(patient) });
    assert.equal(myReferrals.status, 200);
    const referralPayload = await myReferrals.json();
    assert.ok(referralPayload.data.items.every(item => String(item.patient) === String(ownPatient._id)));
    const deniedAdminDashboard = await fetch(`${base}/api/admin/dashboard`, { headers: authHeaders(patient) });
    assert.equal(deniedAdminDashboard.status, 403);

    const admin = await login(testAdminEmail);
    const adminDashboard = await fetch(`${base}/api/admin/dashboard`, { headers: authHeaders(admin) });
    assert.equal(adminDashboard.status, 200);
    assert.ok((await adminDashboard.json()).data.summary.totalPatients >= 1);
    const suffix = crypto.randomUUID();
    const genericUserCreation = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: { ...authHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Unprovisioned Account', email: `unprovisioned-${suffix}@test.invalid` })
    });
    assert.equal(genericUserCreation.status, 403);
    const genericRoleChange = await fetch(`${base}/api/users/${testAdmin._id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'asha' })
    });
    assert.equal(genericRoleChange.status, 403);
    assert.equal((await models.User.findById(testAdmin._id).select('role')).role, 'admin');

    const staffResponse = await fetch(`${base}/api/admin/staff`, {
      method: 'POST',
      headers: { ...authHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Role Test ASHA', email: `staff-${suffix}@test.invalid`, password: demoPassword, staffId: `TEST-ASHA-${suffix.slice(0, 8)}`, role: 'asha' })
    });
    assert.equal(staffResponse.status, 201);
    const createdStaff = (await staffResponse.json()).data;
    testUserIds.push(createdStaff.id);
    assert.equal(createdStaff.role, 'asha');
    const staffSessionResponse = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: createdStaff.staffId, password: demoPassword, expectedRole: 'staff' })
    });
    assert.equal(staffSessionResponse.status, 200);
    assert.equal((await staffSessionResponse.json()).data.user.id, createdStaff.id);
    const duplicateStaffResponse = await fetch(`${base}/api/admin/staff`, {
      method: 'POST',
      headers: { ...authHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Role Test ASHA', email: `staff-${suffix}@test.invalid`, password: demoPassword, staffId: createdStaff.staffId, role: 'asha' })
    });
    assert.equal(duplicateStaffResponse.status, 409);
    const patientCannotProvisionStaff = await fetch(`${base}/api/admin/staff`, {
      method: 'POST',
      headers: { ...authHeaders(patient), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Unauthorized Staff', email: `unauthorized-${suffix}@test.invalid`, password: demoPassword, role: 'asha' })
    });
    assert.equal(patientCannotProvisionStaff.status, 403);

    const doctorResponse = await fetch(`${base}/api/admin/doctors`, {
      method: 'POST',
      headers: { ...authHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Role Test Doctor', email: `doctor-${suffix}@test.invalid`, password: demoPassword, district: 'Synthetic district' })
    });
    assert.equal(doctorResponse.status, 201);
    const createdDoctor = (await doctorResponse.json()).data;
    testUserIds.push(createdDoctor.id);
    assert.equal(createdDoctor.approvalStatus, 'pending');
    const pendingLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `doctor-${suffix}@test.invalid`, password: demoPassword, expectedRole: 'doctor' })
    });
    assert.equal(pendingLogin.status, 403);

    const assignedAccount = await models.User.create({ name: 'Assigned Test Patient', email: `assigned-${suffix}@test.invalid`, role: 'patient', passwordHash: await bcrypt.hash(demoPassword, 4) });
    const unrelatedAccount = await models.User.create({ name: 'Unassigned Test Patient', email: `unassigned-${suffix}@test.invalid`, role: 'patient', passwordHash: await bcrypt.hash(demoPassword, 4) });
    testUserIds.push(assignedAccount._id, unrelatedAccount._id);
    const assignedPatient = await models.Patient.create({ user: assignedAccount._id, patientId: `AD-ASSIGNED-${suffix.slice(0, 8)}`, name: assignedAccount.name, village: 'Synthetic village' });
    const unrelatedPatient = await models.Patient.create({ user: unrelatedAccount._id, patientId: `AD-UNASSIGNED-${suffix.slice(0, 8)}`, name: unrelatedAccount.name, village: 'Synthetic village' });
    testPatientIds.push(assignedPatient._id, unrelatedPatient._id);
    const priorDoctor = await models.User.findOne({ email: 'ananya.demo@aarogya.test' }).select('_id');
    const priorAppointment = await models.Appointment.create({ patient: assignedPatient._id, provider: priorDoctor._id, scheduledAt: new Date(Date.now() + 86400000), status: 'Upcoming' });
    testAppointmentIds.push(priorAppointment._id);
    const approved = await fetch(`${base}/api/admin/doctors/${createdDoctor.id}/approve`, { method: 'PUT', headers: authHeaders(admin) });
    assert.equal(approved.status, 200);
    const assignResponse = await fetch(`${base}/api/admin/patients/${assignedPatient._id}/assign-doctor`, {
      method: 'PUT',
      headers: { ...authHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ doctorId: createdDoctor.id })
    });
    assert.equal(assignResponse.status, 200);
    const doctor = await login(`doctor-${suffix}@test.invalid`);
    const allowedDetail = await fetch(`${base}/api/clinical/patients/${assignedPatient._id}`, { headers: authHeaders(doctor) });
    assert.equal(allowedDetail.status, 200);
    const deniedDetail = await fetch(`${base}/api/clinical/patients/${unrelatedPatient._id}`, { headers: authHeaders(doctor) });
    assert.equal(deniedDetail.status, 403);
    const priorDoctorSession = await login('ananya.demo@aarogya.test');
    const formerProviderDetail = await fetch(`${base}/api/clinical/patients/${assignedPatient._id}`, { headers: authHeaders(priorDoctorSession) });
    assert.equal(formerProviderDetail.status, 403);
    const assignedScreening = await models.OralScreening.create({ patient: assignedPatient._id, category: 'possible-ulcer', status: 'Needs review' });
    const unrelatedScreening = await models.OralScreening.create({ patient: unrelatedPatient._id, category: 'possible-ulcer', status: 'Needs review' });
    testScreeningIds.push(assignedScreening._id, unrelatedScreening._id);
    const allowedScreening = await fetch(`${base}/api/screenings/${assignedScreening._id}`, { headers: authHeaders(doctor) });
    const deniedScreening = await fetch(`${base}/api/screenings/${unrelatedScreening._id}`, { headers: authHeaders(doctor) });
    assert.equal(allowedScreening.status, 200);
    assert.equal(deniedScreening.status, 403);

    const pendingQueue = await fetch(`${base}/api/screenings/review-queue?reviewStatus=pending&q=${assignedPatient.patientId}`, { headers: authHeaders(doctor) });
    assert.equal(pendingQueue.status, 200);
    assert.deepEqual((await pendingQueue.json()).data.items.map(item => String(item._id)), [String(assignedScreening._id)]);
    const invalidQueueFilter = await fetch(`${base}/api/screenings/review-queue?reviewStatus=unknown`, { headers: authHeaders(doctor) });
    assert.equal(invalidQueueFilter.status, 400);

    const savedReview = await fetch(`${base}/api/screenings/${assignedScreening._id}/review`, {
      method: 'PATCH',
      headers: { ...authHeaders(doctor), 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'possible-ulcer', decision: 'needs-further-examination', diagnosisNotes: 'Synthetic clinician observation', treatmentRecommendations: 'Arrange an in-person examination.' })
    });
    const savedReviewPayload = await savedReview.json();
    assert.equal(savedReview.status, 200, JSON.stringify(savedReviewPayload));
    const savedScreening = savedReviewPayload.data;
    assert.equal(savedScreening.reviews.length, 1);
    assert.equal(savedScreening.doctorAssessment.decision, 'needs-further-examination');
    const followupQueue = await fetch(`${base}/api/screenings/review-queue?reviewStatus=needs-further-examination`, { headers: authHeaders(doctor) });
    assert.equal(followupQueue.status, 200);
    assert.ok((await followupQueue.json()).data.items.some(item => String(item._id) === String(assignedScreening._id)));
    const reviewedDetail = await fetch(`${base}/api/clinical/patients/${assignedPatient._id}`, { headers: authHeaders(doctor) });
    assert.equal(reviewedDetail.status, 200);
    const patientReviews = (await reviewedDetail.json()).data.screenings.find(item => String(item._id) === String(assignedScreening._id)).reviews;
    assert.equal(patientReviews[0].diagnosisNotes, 'Synthetic clinician observation');

    const hospital = await models.Hospital.findOne({ isActive: true }).select('_id').lean();
    assert.ok(hospital);
    const referredReview = await fetch(`${base}/api/screenings/${assignedScreening._id}/review`, {
      method: 'PATCH',
      headers: { ...authHeaders(doctor), 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'possible-ulcer', decision: 'approved', referral: { hospital: String(hospital._id), reason: 'Synthetic referral integration test.' } })
    });
    assert.equal(referredReview.status, 200);
    const referredScreening = (await referredReview.json()).data;
    const referralId = referredScreening.doctorAssessment.referral;
    testReferralIds.push(referralId);
    const referral = await models.Referral.findById(referralId).lean();
    assert.equal(String(referral.screening), String(assignedScreening._id));
    const referralQueue = await fetch(`${base}/api/screenings/review-queue?reviewStatus=referred`, { headers: authHeaders(doctor) });
    assert.equal(referralQueue.status, 200);
    assert.ok((await referralQueue.json()).data.items.some(item => String(item._id) === String(assignedScreening._id)));
  });

  await t.test('patient profile photos are private, validated, and removable', async () => {
    const storage = { put: fileStorage.put, get: fileStorage.get, remove: fileStorage.remove };
    const stored = new Map();
    fileStorage.put = async (key, bytes) => stored.set(key, Buffer.from(bytes));
    fileStorage.get = async key => {
      if (!stored.has(key)) throw new Error('Stored profile photo not found');
      return Buffer.from(stored.get(key));
    };
    fileStorage.remove = async key => { stored.delete(key); };
    try {
      const suffix = crypto.randomUUID();
      const email = `photo-${suffix}@test.invalid`;
      const phone = `+919${String(crypto.randomInt(100000000, 999999999))}`;
      const user = await models.User.create({
        name: 'Profile Photo Test Patient', email, phone, role: 'patient',
        approvalStatus: 'approved', isActive: true
      });
      testUserIds.push(user._id);
      const record = await models.Patient.create({
        user: user._id, patientId: `PHOTO-${suffix.slice(0, 8)}`,
        name: user.name, email, phone, village: 'Test Village'
      });
      testPatientIds.push(record._id);
      const photoPatient = await login(email);
      const patient = await login('patient.demo@aarogya.test');
      const invalidForm = new FormData();
      invalidForm.append('photo', new Blob(['not an image'], { type: 'image/png' }), 'invalid.png');
      const invalidUpload = await fetch(`${base}/api/patients/me/photo`, {
        method: 'POST', headers: authHeaders(photoPatient), body: invalidForm
      });
      assert.equal(invalidUpload.status, 415);

      const form = new FormData();
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
      form.append('photo', new Blob([png], { type: 'image/png' }), 'profile.png');
      const uploaded = await fetch(`${base}/api/patients/me/photo`, {
        method: 'POST', headers: authHeaders(photoPatient), body: form
      });
      assert.equal(uploaded.status, 201);
      assert.equal((await uploaded.json()).data.hasProfilePhoto, true);
      const profile = await fetch(`${base}/api/patients/me`, { headers: authHeaders(photoPatient) });
      assert.equal((await profile.json()).data.patient.hasProfilePhoto, true);

      const image = await fetch(`${base}/api/patients/me/photo`, { headers: authHeaders(photoPatient) });
      assert.equal(image.status, 200);
      assert.equal(image.headers.get('content-type'), 'image/png');
      assert.equal(image.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);

      const otherPatientPhoto = await fetch(`${base}/api/patients/me/photo`, { headers: authHeaders(patient) });
      assert.equal(otherPatientPhoto.status, 404);
      const doctor = await login('ananya.demo@aarogya.test');
      const deniedDoctorPhoto = await fetch(`${base}/api/patients/me/photo`, { headers: authHeaders(doctor) });
      assert.equal(deniedDoctorPhoto.status, 403);

      const removed = await fetch(`${base}/api/patients/me/photo`, {
        method: 'DELETE', headers: authHeaders(photoPatient)
      });
      assert.equal(removed.status, 200);
      assert.equal((await removed.json()).data.hasProfilePhoto, false);
      assert.equal(stored.size, 0);
      const missing = await fetch(`${base}/api/patients/me/photo`, { headers: authHeaders(photoPatient) });
      assert.equal(missing.status, 404);
    } finally {
      fileStorage.put = storage.put;
      fileStorage.get = storage.get;
      fileStorage.remove = storage.remove;
    }
  });

  await t.test('doctor profile updates are self-only and restricted to professional fields', async () => {
    const suffix = crypto.randomUUID();
    const email = `doctor-profile-${suffix}@test.invalid`;
    const doctor = await models.User.create({
      name: 'Profile Test Doctor', email, staffId: `PROFILE-${suffix.slice(0, 8).toUpperCase()}`,
      role: 'doctor', passwordHash: await bcrypt.hash(demoPassword, 4), isActive: true,
      doctorProfile: { specialization: 'Dentistry', yearsExperience: 3, expertise: [], consultationFee: 0, biography: '' }
    });
    testUserIds.push(doctor._id);
    const session = await login(email);
    const updated = await fetch(`${base}/api/auth/profile`, {
      method: 'PATCH',
      headers: { ...authHeaders(session), 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Profile Test Doctor Updated',
        doctorProfile: { department: 'Oral Medicine and Radiology', specialization: 'Oral Medicine', yearsExperience: 8, expertise: ['Oral lesions'], consultationFee: 250, biography: 'A short profile.' }
      })
    });
    assert.equal(updated.status, 200);
    const payload = await updated.json();
    assert.equal(payload.data.user.name, 'Profile Test Doctor Updated');
    assert.equal(payload.data.user.doctorProfile.department, 'Oral Medicine and Radiology');
    assert.equal(payload.data.user.doctorProfile.specialization, 'Oral Medicine');
    assert.deepEqual(payload.data.user.doctorProfile.expertise, ['Oral lesions']);
    const savedDoctor = await models.User.findById(doctor._id).select('name doctorProfile').lean();
    assert.equal(savedDoctor.doctorProfile.yearsExperience, 8);
    assert.equal(savedDoctor.doctorProfile.department, 'Oral Medicine and Radiology');
    testAuditIds.push(...await models.AuditLog.find({ resourceId: doctor._id, action: 'doctor.profile_updated' }).distinct('_id'));

    const protectedField = await fetch(`${base}/api/auth/profile`, {
      method: 'PATCH',
      headers: { ...authHeaders(session), 'content-type': 'application/json' },
      body: JSON.stringify({ doctorProfile: { profileVerifiedAt: new Date().toISOString() } })
    });
    assert.equal(protectedField.status, 400);
    const admin = await login(testAdminEmail);
    const deniedAdminUpdate = await fetch(`${base}/api/auth/profile`, {
      method: 'PATCH',
      headers: { ...authHeaders(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Not a doctor' })
    });
    assert.equal(deniedAdminUpdate.status, 403);
  });

  await t.test('QR consent, care relationship, audit record, and revocation are enforced', async () => {
    authLimiter.resetKey('127.0.0.1');
    authLimiter.resetKey('::ffff:127.0.0.1');
    const suffix = crypto.randomUUID();
    const phone = `+919${String(crypto.randomInt(100000000, 999999999))}`;
    const [asha, patientUser] = await Promise.all([
      models.User.findOne({ email: 'lakshmi.demo@aarogya.test' }),
      models.User.create({ name: 'QR Test Patient', email: `qr-${suffix}@test.invalid`, role: 'patient', phone })
    ]);
    testUserIds.push(patientUser._id);
    const patient = await models.Patient.create({ user: patientUser._id, patientId: `AD-TEST-${suffix.slice(0, 8)}`, name: patientUser.name, village: 'Synthetic test village', assignedWorker: asha._id, consentGiven: true });
    testPatientIds.push(patient._id);
    const consent = await models.Consent.create({ patient: patient._id, grantedBy: patientUser._id, purpose: 'qr-scan', granted: true, grantedAt: new Date() });
    testConsentIds.push(consent._id);
    const patientSession = await login(patientUser.email);
    const ashaSession = await login('lakshmi.demo@aarogya.test');
    const issued = await fetch(`${base}/api/patient-qr/issue`, { method: 'POST', headers: authHeaders(patientSession) });
    assert.equal(issued.status, 200);
    const { data: issuedData } = await issued.json();
    const qr = await models.PatientQR.findOne({ patient: patient._id }).sort({ createdAt: -1 });
    testQrIds.push(qr._id);

    const scanned = await fetch(`${base}/api/patient-qr/scan`, { method: 'POST', headers: { ...authHeaders(ashaSession), 'content-type': 'application/json' }, body: JSON.stringify({ token: issuedData.token }) });
    assert.equal(scanned.status, 200);
    assert.equal((await scanned.json()).data.patient.patientId, patient.patientId);
    const audit = await models.AuditLog.find({ action: 'patient_qr.scan', resourceId: qr._id }).select('_id');
    testAuditIds.push(...audit.map(item => item._id));
    assert.ok(audit.length >= 1);

    const revoked = await fetch(`${base}/api/patient-qr/revoke`, { method: 'POST', headers: authHeaders(patientSession) });
    assert.equal(revoked.status, 200);
    const failedScan = await fetch(`${base}/api/patient-qr/scan`, { method: 'POST', headers: { ...authHeaders(ashaSession), 'content-type': 'application/json' }, body: JSON.stringify({ token: issuedData.token }) });
    assert.equal(failedScan.status, 410);
    const allAudit = await models.AuditLog.find({ action: 'patient_qr.scan', resourceId: qr._id }).select('_id');
    for (const item of allAudit) if (!testAuditIds.some(id => String(id) === String(item._id))) testAuditIds.push(item._id);
  });

  await t.test('individual-record route access remains relationship scoped', async () => {
    authLimiter.resetKey('127.0.0.1');
    authLimiter.resetKey('::ffff:127.0.0.1');
    const suffix = crypto.randomUUID();
    const patient = await models.Patient.create({ patientId: `AD-ISOLATED-${suffix.slice(0, 8)}`, name: 'Unassigned Synthetic Record', village: 'Synthetic village', status: 'Screened' });
    testPatientIds.push(patient._id);
    const screening = await models.OralScreening.create({ patient: patient._id, category: 'no-visible-abnormality', status: 'Analyzed', demonstration: true });
    testScreeningIds.push(screening._id);
    const asha = await login('lakshmi.demo@aarogya.test');
    const direct = await fetch(`${base}/api/screenings/${screening._id}`, { headers: authHeaders(asha) });
    assert.equal(direct.status, 403);

    const specialist = await login('kiran.demo@aarogya.test');
    const referrals = await models.Referral.findOne({}).select('_id').lean();
    const unrelated = await fetch(`${base}/api/referrals/${referrals._id}`, { headers: authHeaders(specialist) });
    assert.equal(unrelated.status, 403);
  });
});
