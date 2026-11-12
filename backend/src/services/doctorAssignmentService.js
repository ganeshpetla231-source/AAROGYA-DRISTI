const { Patient, Appointment, Referral, OralScreening } = require('../models');

async function canDoctorAccess(patientOrId, doctorId) {
  const patient = typeof patientOrId === 'object' && patientOrId?._id && typeof patientOrId.toHexString !== 'function'
    ? patientOrId
    : await Patient.findById(patientOrId).select('assignedDoctor').lean();
  if (!patient) return false;
  if (patient.assignedDoctor) return String(patient.assignedDoctor) === String(doctorId);
  const [appointment, referral, screening] = await Promise.all([
    Appointment.exists({ patient: patient._id, provider: doctorId }),
    Referral.exists({ patient: patient._id, fromProvider: doctorId }),
    OralScreening.exists({ patient: patient._id, reviewingDoctor: doctorId })
  ]);
  return Boolean(appointment || referral || screening);
}

async function doctorPatientIds(doctorId) {
  const [appointments, referrals, assigned, screenings] = await Promise.all([
    Appointment.find({ provider: doctorId }).distinct('patient'),
    Referral.find({ fromProvider: doctorId }).distinct('patient'),
    Patient.find({ assignedDoctor: doctorId }).distinct('_id'),
    OralScreening.find({ reviewingDoctor: doctorId }).distinct('patient')
  ]);
  const related = [...new Set([...appointments, ...referrals, ...screenings].map(String))];
  if (!related.length) return [...new Set(assigned.map(String))];
  const assignedToSomeoneElse = await Patient.find({
    _id: { $in: related },
    assignedDoctor: { $exists: true, $ne: doctorId }
  }).distinct('_id');
  const excluded = new Set(assignedToSomeoneElse.map(String));
  return [...new Set([...assigned.map(String), ...related.filter(id => !excluded.has(id))])];
}

module.exports = { canDoctorAccess, doctorPatientIds };
