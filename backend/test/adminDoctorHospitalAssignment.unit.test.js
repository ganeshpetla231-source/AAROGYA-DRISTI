const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const admin = require('../src/services/adminService');
const auth = require('../src/services/authService');
const facility = require('../src/services/facilityService');
const fileStorage = require('../src/services/fileStorageService');
const { Hospital, User, AuditLog, DoctorAvailability, RefreshSession, ProfessionalDocument } = require('../src/models');

function query(value) {
  return {
    select() { return this; },
    async lean() { return value; }
  };
}

test('admin hospital assignment requires valid doctor and hospital IDs', async () => {
  await assert.rejects(
    admin.assignDoctorHospital('invalid', new mongoose.Types.ObjectId().toString(), { _id: 'admin-id' }),
    error => error.statusCode === 400
  );
  await assert.rejects(
    admin.assignDoctorHospital(new mongoose.Types.ObjectId().toString(), 'invalid', { _id: 'admin-id' }),
    error => error.statusCode === 400
  );
});

test('assigning an active doctor to a hospital leaves professional verification pending', async () => {
  const doctorId = new mongoose.Types.ObjectId();
  const hospitalId = new mongoose.Types.ObjectId();
  const hospital = { _id: hospitalId, name: 'District Hospital', hospitalId: 'H-001' };
  const originalHospitalFindOne = Hospital.findOne;
  const originalUserFindOne = User.findOne;
  const originalUserFindOneAndUpdate = User.findOneAndUpdate;
  const originalAuditCreate = AuditLog.create;
  let update;
  let audit;

  Hospital.findOne = () => query(hospital);
  User.findOne = () => query({
    approvalStatus: 'approved',
    isActive: true,
    hospital: null,
    doctorProfile: { profileVerifiedAt: new Date() }
  });
  User.findOneAndUpdate = (filter, changes) => {
    assert.equal(String(filter._id), String(doctorId));
    assert.equal(filter.role, 'doctor');
    assert.equal(filter.approvalStatus, 'approved');
    assert.equal(filter.isActive, true);
    assert.equal(filter.hospital, null);
    update = changes;
    return query({ _id: doctorId });
  };
  AuditLog.create = async entry => { audit = entry; };

  try {
    const result = await admin.assignDoctorHospital(
      String(doctorId),
      String(hospitalId),
      { _id: new mongoose.Types.ObjectId() }
    );
    assert.deepEqual(update, {
      $set: { hospital: hospitalId },
      $unset: { 'doctorProfile.profileVerifiedAt': 1 }
    });
    assert.deepEqual(result.hospital, { id: hospitalId, name: hospital.name, hospitalId: hospital.hospitalId });
    assert.equal(result.profileVerified, false);
    assert.equal(audit.action, 'admin.doctor_hospital_assigned');
  } finally {
    Hospital.findOne = originalHospitalFindOne;
    User.findOne = originalUserFindOne;
    User.findOneAndUpdate = originalUserFindOneAndUpdate;
    AuditLog.create = originalAuditCreate;
  }
});

test('inactive or missing hospitals cannot be assigned to a doctor', async () => {
  const originalHospitalFindOne = Hospital.findOne;
  const originalUserFindOneAndUpdate = User.findOneAndUpdate;
  Hospital.findOne = () => query(null);
  User.findOneAndUpdate = () => {
    assert.fail('Doctor assignment must not run when the hospital is unavailable');
  };

  try {
    await assert.rejects(
      admin.assignDoctorHospital(
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId().toString(),
        { _id: new mongoose.Types.ObjectId() }
      ),
      error => error.statusCode === 400 && error.message === 'Choose an active hospital'
    );
  } finally {
    Hospital.findOne = originalHospitalFindOne;
    User.findOneAndUpdate = originalUserFindOneAndUpdate;
  }
});

test('reassignment keeps the doctor active, clears verification, and cancels open slots', async () => {
  const hospitalId = new mongoose.Types.ObjectId();
  const previousHospitalId = new mongoose.Types.ObjectId();
  const doctorId = new mongoose.Types.ObjectId();
  const originalHospitalFindOne = Hospital.findOne;
  const originalUserFindOne = User.findOne;
  const originalUserFindOneAndUpdate = User.findOneAndUpdate;
  const originalAvailabilityUpdateMany = DoctorAvailability.updateMany;
  const originalAuditCreate = AuditLog.create;
  let update;
  let audit;
  Hospital.findOne = () => query({ _id: hospitalId, name: 'New Hospital' });
  User.findOne = () => query({
    approvalStatus: 'approved',
    isActive: true,
    hospital: previousHospitalId,
    doctorProfile: { profileVerifiedAt: new Date() }
  });
  User.findOneAndUpdate = (filter, changes) => {
    assert.equal(String(filter.hospital), String(previousHospitalId));
    update = changes;
    return query({ _id: doctorId });
  };
  DoctorAvailability.updateMany = async (filter, changes) => {
    assert.equal(String(filter.doctor), String(doctorId));
    assert.equal(filter.status, 'Open');
    assert.equal(changes.$set.status, 'Cancelled');
    return { modifiedCount: 2 };
  };
  AuditLog.create = async entry => { audit = entry; };

  try {
    const result = await admin.assignDoctorHospital(
      String(doctorId),
      String(hospitalId),
      { _id: new mongoose.Types.ObjectId() }
    );
    assert.deepEqual(update, {
      $set: { hospital: hospitalId },
      $unset: { 'doctorProfile.profileVerifiedAt': 1 }
    });
    assert.equal(Object.hasOwn(update.$set, 'isActive'), false);
    assert.equal(result.profileVerified, false);
    assert.equal(result.openSlotsCancelled, 2);
    assert.equal(audit.action, 'admin.doctor_hospital_reassigned');
    assert.equal(String(audit.metadata.previousHospitalId), String(previousHospitalId));
  } finally {
    Hospital.findOne = originalHospitalFindOne;
    User.findOne = originalUserFindOne;
    User.findOneAndUpdate = originalUserFindOneAndUpdate;
    DoctorAvailability.updateMany = originalAvailabilityUpdateMany;
    AuditLog.create = originalAuditCreate;
  }
});

test('administrator profile updates preserve account status, reset verification, and cancel open slots', async () => {
  const doctorId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const originalUserFindOne = User.findOne;
  const originalAvailabilityUpdateMany = DoctorAvailability.updateMany;
  const originalAuditCreate = AuditLog.create;
  const doctor = {
    _id: doctorId,
    isActive: true,
    approvalStatus: 'approved',
    doctorProfile: { profileVerifiedAt: new Date() },
    set(path, value) {
      const fields = path.split('.');
      let target = this;
      while (fields.length > 1) target = target[fields.shift()] ||= {};
      target[fields[0]] = value;
    },
    async save() {}
  };
  let slotFilter;
  let slotUpdate;
  let audit;
  User.findOne = async filter => {
    assert.equal(String(filter._id), String(doctorId));
    assert.equal(filter.role, 'doctor');
    return doctor;
  };
  DoctorAvailability.updateMany = async (filter, update) => {
    slotFilter = filter;
    slotUpdate = update;
    return { modifiedCount: 3 };
  };
  AuditLog.create = async entry => { audit = entry; };

  try {
    const result = await facility.updateDoctorProfessionalProfile(String(doctorId), {
      registrationNumber: 'REG-123',
      qualifications: ['BDS', 'MDS'],
      department: 'Oral Surgery',
      specialization: 'Oral Surgery',
      yearsExperience: 5,
      consultationFee: 500,
      expertise: ['Extractions'],
      biography: 'Professional profile'
    }, { _id: adminId, role: 'admin' });
    assert.equal(result.isActive, true);
    assert.equal(result.approvalStatus, 'approved');
    assert.equal(result.profileVerified, false);
    assert.equal(result.openSlotsCancelled, 3);
    assert.equal(doctor.doctorProfile.profileVerifiedAt, undefined);
    assert.deepEqual(doctor.doctorProfile.qualifications, ['BDS', 'MDS']);
    assert.equal(String(slotFilter.doctor), String(doctorId));
    assert.equal(slotFilter.status, 'Open');
    assert.equal(slotUpdate.$set.status, 'Cancelled');
    assert.equal(audit.action, 'admin.doctor_profile_updated');
  } finally {
    User.findOne = originalUserFindOne;
    DoctorAvailability.updateMany = originalAvailabilityUpdateMany;
    AuditLog.create = originalAuditCreate;
  }
});

test('hospital managers cannot update doctor professional profiles', async () => {
  const originalUserFindOne = User.findOne;
  User.findOne = () => {
    assert.fail('Only administrators may update doctor professional profiles');
  };
  try {
    await assert.rejects(
      facility.updateDoctorProfessionalProfile(new mongoose.Types.ObjectId().toString(), {}, { role: 'hospital' }),
      error => error.statusCode === 403
    );
  } finally {
    User.findOne = originalUserFindOne;
  }
});

test('approved active hospital-created doctors can sign in before professional verification', async () => {
  const originalUserFindOne = User.findOne;
  const originalPasswordCompare = bcrypt.compare;
  const originalSessionCreate = RefreshSession.create;
  const user = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Doctor Example',
    email: 'doctor@example.test',
    role: 'doctor',
    passwordHash: 'stored-hash',
    approvalStatus: 'approved',
    isActive: true,
    createdByHospital: new mongoose.Types.ObjectId(),
    doctorProfile: {}
  };
  User.findOne = () => ({ select: () => Promise.resolve(user) });
  bcrypt.compare = async () => true;
  RefreshSession.create = async () => ({});

  try {
    const session = await auth.login({
      identifier: user.email,
      password: 'valid-password',
      expectedRole: 'doctor'
    });
    assert.equal(session.user.role, 'doctor');
    assert.equal(session.user.id, user._id);
  } finally {
    User.findOne = originalUserFindOne;
    bcrypt.compare = originalPasswordCompare;
    RefreshSession.create = originalSessionCreate;
  }
});

test('failed credential audit rolls back the document and logs only safe failure metadata', async () => {
  const doctorId = new mongoose.Types.ObjectId();
  const hospitalId = new mongoose.Types.ObjectId();
  const documentId = new mongoose.Types.ObjectId();
  const original = {
    userFindOne: User.findOne,
    hospitalExists: Hospital.exists,
    documentCreate: ProfessionalDocument.create,
    documentDelete: ProfessionalDocument.deleteOne,
    auditCreate: AuditLog.create,
    storagePut: fileStorage.put,
    storageRemove: fileStorage.remove,
    consoleError: console.error,
    encryptionKey: process.env.SCREENING_IMAGE_ENCRYPTION_KEY
  };
  let removed = false;
  let deleted = false;
  const logs = [];
  User.findOne = () => query({ _id: doctorId, hospital: hospitalId });
  Hospital.exists = async () => true;
  ProfessionalDocument.create = async () => ({
    _id: documentId,
    toObject: () => ({ _id: documentId })
  });
  ProfessionalDocument.deleteOne = async filter => {
    assert.equal(String(filter._id), String(documentId));
    deleted = true;
  };
  AuditLog.create = async () => { throw Object.assign(new Error('audit write failed'), { code: 91 }); };
  fileStorage.put = async () => {};
  fileStorage.remove = async () => { removed = true; };
  console.error = (...args) => logs.push(args);
  process.env.SCREENING_IMAGE_ENCRYPTION_KEY = 'test-professional-document-encryption-key';

  try {
    await assert.rejects(facility.uploadDocument(
      String(doctorId),
      { buffer: Buffer.from('%PDF-test'), mimetype: 'application/pdf', size: 9 },
      { documentType: 'qualification', title: 'Private qualification title' },
      { _id: new mongoose.Types.ObjectId(), role: 'admin' }
    ), /audit write failed/);
    assert.equal(deleted, true);
    assert.equal(removed, true);
    assert.equal(logs.length, 1);
    assert.equal(logs[0][1].stage, 'audit-log');
    assert.equal(logs[0][1].errorCode, '91');
    assert.doesNotMatch(JSON.stringify(logs), /Private qualification title/);
  } finally {
    User.findOne = original.userFindOne;
    Hospital.exists = original.hospitalExists;
    ProfessionalDocument.create = original.documentCreate;
    ProfessionalDocument.deleteOne = original.documentDelete;
    AuditLog.create = original.auditCreate;
    fileStorage.put = original.storagePut;
    fileStorage.remove = original.storageRemove;
    console.error = original.consoleError;
    if (original.encryptionKey === undefined) delete process.env.SCREENING_IMAGE_ENCRYPTION_KEY;
    else process.env.SCREENING_IMAGE_ENCRYPTION_KEY = original.encryptionKey;
  }
});

test('professional document upload encrypts the file and returns safe metadata', async () => {
  const doctorId = new mongoose.Types.ObjectId();
  const hospitalId = new mongoose.Types.ObjectId();
  const documentId = new mongoose.Types.ObjectId();
  const original = {
    userFindOne: User.findOne,
    hospitalExists: Hospital.exists,
    documentCreate: ProfessionalDocument.create,
    auditCreate: AuditLog.create,
    storagePut: fileStorage.put,
    storageRemove: fileStorage.remove,
    encryptionKey: process.env.SCREENING_IMAGE_ENCRYPTION_KEY
  };
  const fileBytes = Buffer.from('%PDF-test-document');
  const key = 'test-professional-document-encryption-key';
  let storedBytes;
  let removed = false;
  User.findOne = () => query({ _id: doctorId, hospital: hospitalId });
  Hospital.exists = async () => true;
  ProfessionalDocument.create = async data => ({
    _id: documentId,
    toObject: () => ({ _id: documentId, ...data })
  });
  AuditLog.create = async () => ({});
  fileStorage.put = async (storageKey, bytes) => { storedBytes = Buffer.from(bytes); };
  fileStorage.remove = async () => { removed = true; };
  process.env.SCREENING_IMAGE_ENCRYPTION_KEY = key;

  try {
    const result = await facility.uploadDocument(
      String(doctorId),
      { buffer: fileBytes, mimetype: 'application/pdf', size: fileBytes.length },
      { documentType: 'qualification', title: 'Qualification proof' },
      { _id: new mongoose.Types.ObjectId(), role: 'admin' }
    );
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      crypto.createHash('sha256').update(key).digest(),
      storedBytes.subarray(6, 18)
    );
    decipher.setAuthTag(storedBytes.subarray(18, 34));
    const decrypted = Buffer.concat([decipher.update(storedBytes.subarray(34)), decipher.final()]);
    assert.deepEqual(decrypted, fileBytes);
    assert.equal(result._id, documentId);
    assert.equal(Object.hasOwn(result, 'storageKey'), false);
    assert.equal(Object.hasOwn(result, 'sha256'), false);
    assert.equal(removed, false);
  } finally {
    User.findOne = original.userFindOne;
    Hospital.exists = original.hospitalExists;
    ProfessionalDocument.create = original.documentCreate;
    AuditLog.create = original.auditCreate;
    fileStorage.put = original.storagePut;
    fileStorage.remove = original.storageRemove;
    if (original.encryptionKey === undefined) delete process.env.SCREENING_IMAGE_ENCRYPTION_KEY;
    else process.env.SCREENING_IMAGE_ENCRYPTION_KEY = original.encryptionKey;
  }
});
