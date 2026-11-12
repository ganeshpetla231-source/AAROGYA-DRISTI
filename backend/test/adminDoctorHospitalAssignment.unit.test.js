const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const admin = require('../src/services/adminService');
const { Hospital, User, AuditLog, DoctorAvailability } = require('../src/models');

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
