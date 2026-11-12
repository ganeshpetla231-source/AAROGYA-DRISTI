const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const telemedicine = require('../services/telemedicineService');

module.exports = {
  config: asyncHandler(async (req, res) => apiResponse(res, { data: await telemedicine.config(req.user) })),
  availability: asyncHandler(async (req, res) => apiResponse(res, { data: await telemedicine.availability(req.query) })),
  createAvailability: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, data: await telemedicine.addAvailability(req.body || {}, req.user) })),
  removeAvailability: asyncHandler(async (req, res) => apiResponse(res, { data: await telemedicine.removeAvailability(req.params.id, req.user) })),
  appointments: asyncHandler(async (req, res) => apiResponse(res, { data: await telemedicine.listAppointments(req.user) })),
  adminOverview: asyncHandler(async (req, res) => apiResponse(res, { data: await telemedicine.adminOverview() })),
  book: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Video appointment booked', data: await telemedicine.book(req.body?.availabilityId, req.body, req.user) })),
  consent: asyncHandler(async (req, res) => apiResponse(res, { message: 'Consultation consent recorded', data: await telemedicine.recordConsultationConsent(req.params.id, req.body || {}, req.user) })),
  action: asyncHandler(async (req, res) => {
    const messages = { confirm: 'Appointment accepted', decline: 'Appointment declined', cancel: 'Appointment cancelled', reschedule: 'Appointment rescheduled' };
    const data = await telemedicine.updateAppointment(req.params.id, req.params.action, req.body || {}, req.user);
    return apiResponse(res, { message: messages[req.params.action] || 'Appointment updated', data });
  }),
  room: asyncHandler(async (req, res) => apiResponse(res, { data: await telemedicine.getRoom(req.params.id, req.user) })),
  notes: asyncHandler(async (req, res) => apiResponse(res, { message: 'Consultation notes saved', data: await telemedicine.saveNotes(req.params.id, req.body || {}, req.user) })),
  followup: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Follow-up scheduled', data: await telemedicine.scheduleFollowup(req.params.id, req.body || {}, req.user) }))
};
