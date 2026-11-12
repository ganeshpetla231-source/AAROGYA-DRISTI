const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const { User, Appointment, Consultation } = require('../models');
const { accessSecret } = require('./authService');
const telemedicine = require('./telemedicineService');

function attachTelemedicineSocket(io) {
  const activeDoctorRooms = new Map();
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new ApiError(401, 'Sign in to join a consultation');
      const claims = jwt.verify(token, accessSecret());
      const user = await User.findById(claims.sub);
      if (!user || !user.isActive || user.authVersion !== claims.ver) throw new ApiError(401, 'Your session has expired');
      socket.data.user = user;
      next();
    } catch (error) { next(new Error(error.statusCode === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED')); }
  });

  io.on('connection', socket => {
    socket.join(`user:${socket.data.user._id}`);
    socket.on('room:join', async (payload = {}, acknowledge = () => {}) => {
      let doctorReservation;
      try {
        if (socket.data.room) throw new ApiError(409, 'This connection already joined a consultation');
        const { appointment, consultation, participantRole } = await telemedicine.assertSocketParticipant(payload.appointmentId, socket.data.user._id);
        const room = String(consultation._id);
        const doctorId = String(socket.data.user._id);
        if (participantRole === 'doctor') {
          const currentRoom = activeDoctorRooms.get(doctorId);
          if (currentRoom && currentRoom !== room) throw new ApiError(409, 'Doctor is busy in another consultation');
          if (!currentRoom) {
            activeDoctorRooms.set(doctorId, room);
            doctorReservation = { doctorId, room };
          }
        }
        const peers = await io.in(room).fetchSockets();
        if (peers.some(peer => String(peer.data.user?._id) === String(socket.data.user._id))) throw new ApiError(409, 'This account already has a connection in this consultation');
        if (peers.length >= 2) throw new ApiError(409, 'This consultation already has both participants connected');
        await socket.join(room); socket.data.room = room; socket.data.appointmentId = String(appointment._id); socket.data.consultationId = room;
        if (participantRole === 'doctor') socket.data.doctorId = doctorId;
        await Consultation.updateOne({ _id: consultation._id, status: 'Scheduled' }, { $set: { status: 'In progress', startedAt: new Date() } });
        acknowledge({ ok: true, consultationId: room, status: 'In progress', chatMessages: consultation.chatMessages || [], participantRole, peerOnline: peers.length > 0 });
        const connected = await io.in(room).fetchSockets();
        if (connected.length > 1) {
          const doctorSocket = connected.find(peer => peer.data.user?.role === 'doctor');
          doctorSocket?.emit('peer:ready');
        }
        io.to(room).emit('consultation:status', { status: 'In progress' });
      } catch (error) {
        if (socket.data.room) {
          await socket.leave(socket.data.room);
          delete socket.data.room;
          delete socket.data.appointmentId;
          delete socket.data.consultationId;
          delete socket.data.doctorId;
        }
        if (doctorReservation && activeDoctorRooms.get(doctorReservation.doctorId) === doctorReservation.room) activeDoctorRooms.delete(doctorReservation.doctorId);
        acknowledge({ ok: false, message: error.message || 'Could not join consultation' });
      }
    });

    for (const event of ['rtc:offer', 'rtc:answer', 'rtc:ice']) socket.on(event, payload => {
      if (!socket.data.room || !payload || JSON.stringify(payload).length > 200000) return;
      if (event === 'rtc:ice') {
        const candidate = payload.candidate;
        if (!candidate || typeof candidate.candidate !== 'string' || candidate.candidate.length > 4096) return;
        if (candidate.sdpMid != null && (typeof candidate.sdpMid !== 'string' || candidate.sdpMid.length > 256)) return;
        if (candidate.sdpMLineIndex != null && !Number.isInteger(candidate.sdpMLineIndex)) return;
      } else {
        const description = payload.description;
        const expectedType = event === 'rtc:offer' ? 'offer' : 'answer';
        if (!description || description.type !== expectedType || typeof description.sdp !== 'string' || description.sdp.length > 150000) return;
      }
      socket.to(socket.data.room).emit(event, payload);
    });

    socket.on('chat:send', async (payload = {}, acknowledge = () => {}) => {
      try {
        if (!socket.data.room) throw new ApiError(403, 'Join the consultation before sending a message');
        const now = Date.now();
        socket.data.chatTimes = (socket.data.chatTimes || []).filter(time => now - time < 60000);
        if (socket.data.chatTimes.length >= 30) throw new ApiError(429, 'Please wait before sending more consultation messages');
        const text = String(payload.text || '').trim();
        const language = ['en', 'te', 'hi'].includes(payload.language) ? payload.language : 'en';
        if (!text || text.length > 1000) throw new ApiError(400, 'Chat message must be 1–1,000 characters');
        const consultation = await Consultation.findById(socket.data.consultationId);
        if (!consultation || consultation.status === 'Completed' || consultation.status === 'Cancelled') throw new ApiError(409, 'This consultation chat is closed');
        const message = { sender: socket.data.user._id, senderName: socket.data.user.name, language, text, sentAt: new Date() };
        consultation.chatMessages.push(message); await consultation.save();
        socket.data.chatTimes.push(now);
        const saved = consultation.chatMessages.at(-1).toObject();
        io.to(socket.data.room).emit('chat:message', saved); acknowledge({ ok: true });
      } catch (error) { acknowledge({ ok: false, message: error.message || 'Message could not be sent' }); }
    });

    socket.on('call:end', async (acknowledge = () => {}) => {
      try {
        if (!socket.data.room) throw new ApiError(403, 'Join the consultation before ending it');
        await Promise.all([
          Consultation.updateOne({ _id: socket.data.consultationId, status: { $ne: 'Completed' } }, { $set: { status: 'Completed', endedAt: new Date() } }),
          Appointment.updateOne({ _id: socket.data.appointmentId, status: { $ne: 'Cancelled' } }, { $set: { status: 'Completed' } })
        ]);
        io.to(socket.data.room).emit('call:ended');
        acknowledge({ ok: true });
      } catch (error) {
        acknowledge({ ok: false, message: error.message || 'The consultation could not be ended' });
      }
    });

    socket.on('disconnect', () => {
      if (socket.data.doctorId && activeDoctorRooms.get(socket.data.doctorId) === socket.data.room) activeDoctorRooms.delete(socket.data.doctorId);
      if (socket.data.room) socket.to(socket.data.room).emit('peer:left');
    });
  });
}
module.exports = attachTelemedicineSocket;
