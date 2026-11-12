require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const connectDB = require('./config/db');
const { validatePassword } = require('./services/authService');
const models = require('./models');

async function upsert(model, key, value) {
  const result = await model.findOneAndUpdate({ [key]: value[key] }, { $set: value }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  return result;
}

async function seed() {
  if (process.env.NODE_ENV === 'production') throw new Error('The synthetic demo seed must not run in production');
  if (!process.env.DEMO_PASSWORD) throw new Error('Set DEMO_PASSWORD explicitly before seeding development demo data');
  await connectDB();
  const users = {};
  const demoPassword = process.env.DEMO_PASSWORD;
  validatePassword(demoPassword);
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  for (const [key, name, role, email, staffId, phone] of [
    ['asha', 'Lakshmi Devi', 'asha', 'lakshmi.demo@aarogya.test', 'DEMO-ASHA-001', null], ['doctor', 'Dr. Ananya Rao', 'doctor', 'ananya.demo@aarogya.test', 'DEMO-DOCTOR-001', null],
    ['specialist', 'Dr. Kiran Varma', 'specialist', 'kiran.demo@aarogya.test', 'DEMO-SPECIALIST-001', null], ['hospital', 'Hospital Coordinator', 'hospital', 'hospital.demo@aarogya.test', 'DEMO-HOSPITAL-001', null],
    ['district', 'District Coordinator', 'district', 'district.demo@aarogya.test', 'DEMO-DISTRICT-001', null],
    ['patient', 'Ananya Reddy', 'patient', 'patient.demo@aarogya.test', null, '+919876543210']
  ]) users[key] = await upsert(models.User, 'email', { name, role, email, passwordHash, isActive: true, ...(phone ? { phone } : {}), ...(staffId ? { staffId } : {}) });

  if (process.env.NODE_ENV !== 'production') {
    await models.User.updateOne({ _id: users.doctor._id }, {
      $set: {
        approvalStatus: 'approved',
        'doctorProfile.specialization': 'General oral health (demo)',
        'doctorProfile.qualifications': ['Demonstration profile only'],
        'doctorProfile.registrationNumber': 'DEMO-DOCTOR-001',
        'doctorProfile.profileVerifiedAt': users.doctor.doctorProfile?.profileVerifiedAt || new Date()
      }
    });
  }

  const hospitals = {};
  for (const facility of [
    ['phc-kothapalli', 'Primary Health Centre', 'Primary Health Centre', 'Kothapalli', 'Krishna', ['General care', 'Oral screening']],
    ['chc-nandigama', 'Community Health Centre', 'Community Health Centre', 'Nandigama', 'Krishna', ['Dental care', 'Diagnostics']],
    ['district-vijayawada', 'District Dental Clinic', 'District Hospital', 'Vijayawada', 'Krishna', ['Dental specialist', 'Diagnostics']],
    ['demo-map-phc-a', 'Demonstration PHC A', 'PHC', 'Sample Village North', 'Demo District', ['General care']],
    ['demo-map-phc-b', 'Demonstration PHC B', 'PHC', 'Sample Village East', 'Demo District', ['General care']],
    ['demo-map-chc-a', 'Demonstration CHC A', 'CHC', 'Sample Mandal Center', 'Demo District', ['General care']],
    ['demo-map-gov-a', 'Demonstration Government Hospital', 'Government hospital', 'Sample District Center', 'Demo District', ['General care']],
    ['demo-map-specialist-a', 'Demonstration Specialist Hospital', 'Specialist hospital', 'Sample Mandal West', 'Demo District', ['Specialist care']],
    ['demo-map-dental-a', 'Demonstration Dental Service', 'Dental service', 'Sample Village South', 'Demo District', ['Dental care']]
  ]) {
    const [slug, name, facilityType, village, district, services] = facility;
    hospitals[slug] = await upsert(models.Hospital, 'name', { name, facilityType, village, mandal: village, district, services, isActive: true });
  }
  await models.User.updateOne({ _id: users.hospital._id }, { $set: { hospital: hospitals['phc-kothapalli']._id } });
  await models.User.updateOne({ _id: users.district._id }, { $set: { district: 'Krishna' } });
  const availabilityStart = new Date(Date.now() + 86400000); availabilityStart.setHours(10, 0, 0, 0);
  for (let index = 0; index < 6; index += 1) {
    const startsAt = new Date(availabilityStart.getTime() + index * 30 * 60000);
    await models.DoctorAvailability.findOneAndUpdate({ doctor: users.doctor._id, startsAt }, { $set: { doctor: users.doctor._id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60000), slotMinutes: 30 }, $setOnInsert: { status: 'Open' } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  }

  const patientInfo = [
    ['AD-2025-0142', 'Ananya Reddy', 'Kothapalli', 'Needs review'], ['AD-2025-0138', 'Ravi Kumar', 'Lakshmipuram', 'Follow-up'],
    ['AD-2025-0129', 'Meena Devi', 'Nandigama', 'Reviewed'], ['AD-2025-0117', 'Suresh Naidu', 'Kothapalli', 'Referred'],
    ['AD-2025-0104', 'Lakshmi Rao', 'Pedda Gudem', 'Screened']
  ];
  const patients = [];
  for (const [i, [patientId, name, village, status]] of patientInfo.entries()) {
    patients.push(await upsert(models.Patient, 'patientId', { patientId, name, village, mandal: 'Demo Mandal', district: 'Krishna', primaryHospital: hospitals['phc-kothapalli']._id, status, assignedWorker: users.asha._id, ...(i === 0 ? { user: users.patient._id, email: users.patient.email, phone: users.patient.phone } : {}), consentGiven: true }));
  }
  const now = Date.now();
  for (let i = 0; i < patients.length; i += 1) {
    const patient = patients[i];
    const screenedAt = new Date(now - i * 86400000);
    await models.OralScreening.findOneAndUpdate({ patient: patient._id }, { $set: { patient: patient._id, screenedBy: users.asha._id, screenedAt, category: ['possible-ulcer', 'possible-gingivitis', 'no-visible-abnormality', 'other-abnormality', 'insufficient-quality'][i], status: patient.status === 'Reviewed' ? 'Reviewed' : patient.status === 'Referred' ? 'Referred' : 'Needs review', notes: 'Demonstration screening record. Clinical review required.', demonstration: true } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
    await models.MedicalRecord.findOneAndUpdate({ patient: patient._id, title: 'Demonstration care history' }, { $set: { patient: patient._id, author: users.doctor._id, recordType: 'history', title: 'Demonstration care history', notes: 'Synthetic sample record created for the Phase 3 demo.' } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
    await models.Appointment.findOneAndUpdate({ patient: patient._id, type: 'Oral health review' }, { $set: { patient: patient._id, provider: users.doctor._id, hospital: hospitals['phc-kothapalli']._id, type: 'Oral health review', scheduledAt: new Date(now + (i + 1) * 86400000), status: i % 2 ? 'Upcoming' : 'Confirmed' } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  }
  await models.Appointment.findOneAndUpdate({ patient: patients[1]._id, type: 'Telemedicine follow-up' }, { $set: { patient: patients[1]._id, provider: users.doctor._id, hospital: hospitals['phc-kothapalli']._id, type: 'Telemedicine follow-up', scheduledAt: new Date(now + 3 * 86400000), status: 'Upcoming', visitMode: 'Clinic' } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  await models.Referral.findOneAndUpdate({ patient: patients[3]._id, reason: 'Specialist oral health review' }, { $set: { patient: patients[3]._id, fromProvider: users.doctor._id, hospital: hospitals['district-vijayawada']._id, reason: 'Specialist oral health review', status: 'In progress' } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  await models.Notification.findOneAndUpdate({ title: 'Demonstration follow-up reminder', patient: patients[1]._id }, { $set: { user: users.asha._id, patient: patients[1]._id, title: 'Demonstration follow-up reminder', message: 'A sample patient follow-up is scheduled.', type: 'follow-up' } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  await models.Prescription.findOneAndUpdate({ patient: patients[2]._id, medication: 'Sample oral care guidance' }, { $set: { patient: patients[2]._id, prescribedBy: users.doctor._id, medication: 'Sample oral care guidance', instructions: 'Demonstration only. Not a real prescription.' } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  const appt = await models.Appointment.findOne({ patient: patients[0]._id, type: 'Oral health review' });
  await models.Consultation.findOneAndUpdate({ appointment: appt._id }, { $set: { appointment: appt._id, patient: patients[0]._id, provider: users.doctor._id, status: 'Scheduled' }, $setOnInsert: { roomId: crypto.randomBytes(24).toString('hex') } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  await models.Consent.findOneAndUpdate({ patient: patients[0]._id, purpose: 'Demonstration care coordination' }, { $set: { patient: patients[0]._id, grantedBy: users.asha._id, purpose: 'Demonstration care coordination', granted: true, grantedAt: new Date() } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  for (const patient of patients) await models.Consent.findOneAndUpdate({ patient: patient._id, purpose: 'qr-scan' }, { $setOnInsert: { patient: patient._id, grantedBy: patient.user || users.asha._id, purpose: 'qr-scan', granted: true, grantedAt: new Date() } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  await models.AuditLog.findOneAndUpdate({ 'metadata.seedKey': 'phase3-seed' }, { $set: { actor: users.asha._id, action: 'seeded', resourceType: 'demonstration', resourceId: patients[0]._id, metadata: { seedKey: 'phase3-seed' }, occurredAt: new Date() } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  console.log(`Seed complete: ${patients.length} patients, ${Object.keys(hospitals).length} hospitals, and related demonstration records.`);
}

seed().catch((error) => { console.error('Seed failed:', error.name || 'Error', error.code || ''); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
