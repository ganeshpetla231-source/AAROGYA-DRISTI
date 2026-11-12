const ApiError = require('../utils/ApiError');
const { Notification, Appointment, Patient } = require('../models');
let realtime;
let reminderTimer;

function attachRealtime(io) { realtime = io; }
async function createOne(userId, details) {
  if (!userId) return null;
  if (details.dedupeKey) {
    const existing = await Notification.findOne({ dedupeKey: details.dedupeKey });
    if (existing) return existing;
  }
  try {
    const item = await Notification.create({ user: userId, patient: details.patient, title: details.title, message: details.message, type: details.type || 'update', dedupeKey: details.dedupeKey, metadata: details.metadata || {} });
    const safe = item.toObject(); delete safe.dedupeKey;
    realtime?.to(`user:${userId}`).emit('notification:new', safe);
    return item;
  } catch (error) {
    if (error.code === 11000 && details.dedupeKey) return Notification.findOne({ dedupeKey: details.dedupeKey });
    throw error;
  }
}
async function notifyUsers(userIds, details) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  return Promise.all(ids.map(id => createOne(id, { ...details, dedupeKey: details.dedupeKey ? `${details.dedupeKey}:${id}` : undefined })));
}
async function notifyPatient(patientId, details, additionalUsers = []) {
  const patient = await Patient.findById(patientId).select('_id user assignedWorker').lean();
  if (!patient) return [];
  return notifyUsers([patient.user, patient.assignedWorker, ...additionalUsers], { ...details, patient: patient._id });
}
async function notifyAppointment(appointment, details) {
  const patient = await Patient.findById(appointment.patient).select('user assignedWorker').lean();
  return notifyUsers([patient?.user, appointment.provider, patient?.assignedWorker], { ...details, patient: appointment.patient });
}
async function deliverReminders(now = new Date()) {
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const appointments = await Appointment.find({ status: { $in: ['Upcoming', 'Confirmed'] }, scheduledAt: { $gt: now, $lte: end } }).select('_id patient provider scheduledAt type').lean();
  let created = 0;
  for (const appointment of appointments) {
    const minutes = Math.ceil((new Date(appointment.scheduledAt) - now) / 60000);
    const near = minutes <= 60;
    const dedupeKey = `appointment-reminder:${appointment._id}:${near ? '1h' : '24h'}`;
    const items = await notifyAppointment(appointment, { title: near ? 'Appointment starts soon' : 'Appointment reminder', message: near ? 'Your appointment is scheduled within the next hour.' : 'You have an appointment scheduled within the next 24 hours.', type: 'reminder', dedupeKey, metadata: { appointmentId: String(appointment._id), scheduledAt: appointment.scheduledAt } });
    created += items.filter(Boolean).length;
  }
  return created;
}
function startReminderScheduler() {
  if (reminderTimer) return;
  const tick = () => deliverReminders().catch(error => console.error('Appointment reminder scheduler error:', error.name || 'Error'));
  tick(); reminderTimer = setInterval(tick, 60 * 1000); reminderTimer.unref?.();
}
async function listForUser(userId, query = {}) {
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 30));
  const filter = { user: userId };
  if (query.unread === 'true') filter.readAt = null;
  const [items, unreadCount, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).select('-dedupeKey').lean(),
    Notification.countDocuments({ user: userId, readAt: null }),
    Notification.countDocuments(filter)
  ]);
  return { items, unreadCount, total };
}
async function markRead(id, userId) {
  const item = await Notification.findOneAndUpdate({ _id: id, user: userId, readAt: null }, { $set: { readAt: new Date() } }, { new: true }).select('-dedupeKey').lean();
  if (item) { realtime?.to(`user:${userId}`).emit('notification:read', { id: String(item._id), readAt: item.readAt }); return item; }
  const existing = await Notification.findOne({ _id: id, user: userId }).select('-dedupeKey').lean();
  if (!existing) throw new ApiError(404, 'Notification not found');
  return existing;
}
async function markAllRead(userId) {
  const result = await Notification.updateMany({ user: userId, readAt: null }, { $set: { readAt: new Date() } });
  if (result.modifiedCount) realtime?.to(`user:${userId}`).emit('notification:read-all', { readAt: new Date() });
  return { modified: result.modifiedCount };
}
module.exports = { attachRealtime, notifyUsers, notifyPatient, notifyAppointment, deliverReminders, startReminderScheduler, listForUser, markRead, markAllRead };
