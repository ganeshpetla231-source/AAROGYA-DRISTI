import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext.jsx';
import './telemedicine-call.css';
import {
  createTelemedicinePrescription, getAccessToken, getClinicalPatient, getRealtimeOrigin, getScreeningImage,
  getTelemedicineConfig, getTelemedicinePrescriptions, getTelemedicineRoom, saveConsultationNotes
} from '../services/api.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function printPrescriptionDocument(bundle, labels, locale) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error(labels.popupBlocked);
  popup.opener = null;
  const dateLabelFor = value => value ? new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : labels.notRecorded;
  const lines = [
    [labels.patient, bundle.patient.name],
    [labels.patientId, bundle.patient.patientId],
    [labels.doctor, bundle.doctor.name],
    [labels.department, bundle.doctor.department],
    [labels.specialization, bundle.doctor.specialization],
    [labels.registrationNumber, bundle.doctor.registrationNumber],
    [labels.hospital, bundle.doctor.hospital],
    [labels.consultationDate, dateLabelFor(bundle.appointment.scheduledAt)],
    [labels.completedDate, dateLabelFor(bundle.appointment.completedAt)]
  ].filter(([, value]) => value).map(([label, value]) => `<p><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</p>`).join('');
  const rows = bundle.prescriptions.map(item => `<article><h2>${escapeHtml(item.medication)}</h2><p>${escapeHtml(item.instructions)}</p><p><b>${escapeHtml(labels.startDate)}:</b> ${escapeHtml(dateLabelFor(item.startDate))}</p><p><b>${escapeHtml(labels.endDate)}:</b> ${escapeHtml(dateLabelFor(item.endDate))}</p><small>${escapeHtml(labels.issued)}: ${escapeHtml(dateLabelFor(item.createdAt))}</small></article>`).join('');
  popup.document.write(`<!doctype html><html lang="${escapeHtml(locale)}"><head><meta charset="utf-8"><title>${escapeHtml(labels.title)} - ${escapeHtml(bundle.patient.patientId)}</title><style>body{font:15px Arial,sans-serif;color:#243b53;margin:0;padding:36px}.sheet{max-width:760px;margin:auto}.brand{color:#14532d;font-size:24px;font-weight:700}.rule{height:3px;background:#14532d;margin:16px 0 24px}.details{display:grid;grid-template-columns:1fr 1fr;gap:0 24px;margin:20px 0}.details p{margin:5px 0}article{padding:16px 0;border-top:1px solid #bccdc4}article h2{font-size:18px;margin:0 0 8px}article p{white-space:pre-wrap;line-height:1.55}.signature{margin-top:42px;text-align:right}.signature b{display:block}@media print{body{padding:0}.sheet{max-width:none}@page{margin:18mm}}</style></head><body><main class="sheet"><div class="brand">Aarogya Drishti</div><h1>${escapeHtml(labels.title)}</h1><div class="rule"></div><section class="details">${lines}</section>${rows}<div class="signature"><b>${escapeHtml(bundle.doctor.name)}</b><span>${escapeHtml(bundle.doctor.specialization || bundle.doctor.department)}</span><br><span>${escapeHtml(labels.doctorSignature)}</span></div></main></body></html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

const dateLabel = (value, language) => new Date(value).toLocaleString(language === 'te' ? 'te-IN' : language === 'hi' ? 'hi-IN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
const displayDuration = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const EMPTY_LIST = [];

export function TelemedicineCall({ appointment, doctor, onClose }) {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [phase, setPhase] = useState('connecting');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [chat, setChat] = useState([]);
  const [draft, setDraft] = useState('');
  const [chatLanguage, setChatLanguage] = useState(() => ['en', 'te', 'hi'].includes(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en');
  const [status, setStatus] = useState('Scheduled');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [prescriptionBundle, setPrescriptionBundle] = useState(null);
  const [prescriptionBusy, setPrescriptionBusy] = useState(false);
  const [prescriptionLoading, setPrescriptionLoading] = useState(false);
  const [prescriptionError, setPrescriptionError] = useState('');
  const [prescriptionSaved, setPrescriptionSaved] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [network, setNetwork] = useState('checkingNetwork');
  const [clinical, setClinical] = useState(null);
  const [screeningImages, setScreeningImages] = useState({});
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const queuedIceRef = useRef([]);
  const closedRef = useRef(false);
  const liveAtRef = useRef(null);
  const facingModeRef = useRef('user');
  const refreshPrescriptions = useCallback(async () => {
    setPrescriptionLoading(true);
    try {
      const data = await getTelemedicinePrescriptions(appointment._id);
      setPrescriptionBundle(data);
      return data;
    } finally {
      setPrescriptionLoading(false);
    }
  }, [appointment._id]);

  const stopMedia = useCallback(() => {
    closedRef.current = true;
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  useEffect(() => {
    let mounted = true;
    closedRef.current = false;

    async function connect() {
      try {
        const [roomData, rtcConfig] = await Promise.all([
          getTelemedicineRoom(appointment._id),
          getTelemedicineConfig()
        ]);
        if (!mounted) return;
        setNote(roomData.consultation.notes || '');
        setChat(roomData.consultation.chatMessages || []);
        setStatus(roomData.consultation.status);
        setCallEnded(roomData.consultation.status === 'Completed');
        if (['Completed', 'Cancelled', 'Declined'].includes(roomData.consultation.status)) {
          setPhase('ended');
          if (roomData.consultation.status === 'Completed') {
            try { await refreshPrescriptions(); }
            catch (failure) { if (mounted) setPrescriptionError(failure.message); }
          }
          return;
        }

        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (mounted) {
            setAudioOnly(true);
            setError(t('telemedicine.call.cameraUnavailable'));
          }
        }
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection({ iceServers: rtcConfig.iceServers });
        peerRef.current = pc;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        pc.ontrack = event => {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        };
        pc.onicecandidate = event => {
          if (event.candidate) socketRef.current?.emit('rtc:ice', { candidate: event.candidate });
        };
        pc.onconnectionstatechange = () => {
          if (!mounted || closedRef.current) return;
          if (pc.connectionState === 'connected') {
            liveAtRef.current ||= Date.now();
            setPhase('live');
            setError('');
          } else if (['disconnected', 'connecting'].includes(pc.connectionState)) {
            setPhase('reconnecting');
          } else if (pc.connectionState === 'failed') {
            setPhase('reconnecting');
            if (auth.user.role === 'doctor' && socketRef.current?.connected) {
              pc.restartIce();
              pc.createOffer({ iceRestart: true }).then(async offer => {
                await pc.setLocalDescription(offer);
                socketRef.current?.emit('rtc:offer', { description: offer });
              }).catch(() => setError(t('telemedicine.call.reconnectionFailed')));
            }
          }
        };

        const socket = io(getRealtimeOrigin(), {
          path: '/socket.io',
          auth: { token: getAccessToken() },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 8,
          reconnectionDelayMax: 5000
        });
        socketRef.current = socket;
        socket.on('connect', () => socket.emit('room:join', { appointmentId: appointment._id }, reply => {
          if (!reply?.ok) {
            setError(reply?.message || t('telemedicine.call.joinFailed'));
            setPhase('error');
            stopMedia();
            return;
          }
          setStatus(reply.status);
          setChat(reply.chatMessages || []);
          setPhase(reply.peerOnline ? 'reconnecting' : 'waiting');
        }));
        socket.on('disconnect', () => {
          if (!closedRef.current) setPhase('reconnecting');
        });
        socket.on('connect_error', failure => {
          setError(failure.message === 'FORBIDDEN'
            ? t('telemedicine.call.participantsOnly')
            : failure.message === 'UNAUTHORIZED'
              ? t('telemedicine.call.sessionExpired')
              : t('telemedicine.call.signalingDisconnected'));
          if (!closedRef.current) setPhase('reconnecting');
        });
        socket.io.on('reconnect_failed', () => {
          setError(t('telemedicine.call.signalingReconnectFailed'));
          setPhase('error');
        });
        socket.on('peer:ready', async () => {
          if (auth.user.role !== 'doctor') return;
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('rtc:offer', { description: offer });
          } catch {
            setError(t('telemedicine.call.connectionFailed'));
          }
        });
        socket.on('rtc:offer', async ({ description }) => {
          try {
            await pc.setRemoteDescription(description);
            for (const candidate of queuedIceRef.current.splice(0)) await pc.addIceCandidate(candidate);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('rtc:answer', { description: answer });
          } catch {
            setError(t('telemedicine.call.connectionFailed'));
          }
        });
        socket.on('rtc:answer', async ({ description }) => {
          try {
            await pc.setRemoteDescription(description);
            for (const candidate of queuedIceRef.current.splice(0)) await pc.addIceCandidate(candidate);
          } catch {
            setError(t('telemedicine.call.connectionFailed'));
          }
        });
        socket.on('rtc:ice', async ({ candidate }) => {
          if (!candidate) return;
          if (pc.remoteDescription) {
            try { await pc.addIceCandidate(candidate); } catch { /* Stale ICE candidates can arrive during reconnect. */ }
          } else queuedIceRef.current.push(candidate);
        });
        socket.on('chat:message', message => setChat(current => [...current, message]));
        socket.on('consultation:status', value => setStatus(value.status));
        socket.on('call:ended', () => {
          setStatus('Completed');
          setCallEnded(true);
          setPhase('ended');
          refreshPrescriptions().catch(failure => setPrescriptionError(failure.message));
          stopMedia();
        });
        socket.on('peer:left', () => {
          if (!closedRef.current) setPhase('reconnecting');
        });
        socket.on('room:error', value => {
          setError(value.message);
          setPhase('error');
        });

        if (doctor && appointment.patient?._id) {
          getClinicalPatient(appointment.patient._id)
            .then(data => { if (mounted) setClinical(data); })
            .catch(() => { if (mounted) setError(t('telemedicine.call.historyUnavailable')); });
        }
      } catch (failure) {
        setError(failure.message || t('telemedicine.call.startFailed'));
        setPhase('error');
      }
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('telemedicine.call.secureContext'));
      setPhase('error');
    } else connect();
    return () => {
      mounted = false;
      stopMedia();
    };
  }, [appointment._id, appointment.patient?._id, auth.user.role, doctor, refreshPrescriptions, stopMedia]);

  useEffect(() => {
    if (phase !== 'live') return undefined;
    const timer = window.setInterval(() => {
      if (liveAtRef.current) setSeconds(Math.floor((Date.now() - liveAtRef.current) / 1000));
    }, 1000);
    const statsTimer = window.setInterval(async () => {
      const peer = peerRef.current;
      if (!peer) return;
      try {
        const stats = await peer.getStats();
        let rtt;
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime != null) {
            rtt = report.currentRoundTripTime * 1000;
          }
        });
        setNetwork(rtt == null ? 'connected' : rtt < 150 ? 'goodNetwork' : rtt < 350 ? 'fairNetwork' : 'weakNetwork');
      } catch {
        setNetwork('connected');
      }
    }, 5000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(statsTimer);
    };
  }, [phase]);

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit('chat:send', { text, language: chatLanguage }, reply => {
      if (!reply?.ok) setError(reply?.message || t('telemedicine.call.chatNotSent'));
      else setDraft('');
    });
  }

  function endCall() {
    setPhase('ended');
    setStatus('Completed');
    const socket = socketRef.current;
    if (!socket?.connected) {
      stopMedia();
      return;
    }
    const timeout = window.setTimeout(stopMedia, 2500);
    socket.emit('call:end', reply => {
      window.clearTimeout(timeout);
      if (!reply?.ok) setError(reply?.message || t('telemedicine.call.endFailed'));
      stopMedia();
    });
  }

  function closeCall() {
    const socket = socketRef.current;
    // A dialog close is also a hang-up: otherwise the appointment remains
    // permanently marked in progress after signaling is disconnected.
    if (!['waiting', 'live', 'reconnecting'].includes(phase) || !socket?.connected) {
      stopMedia();
      onClose();
      return;
    }
    setPhase('ended');
    setStatus('Completed');
    const timeout = window.setTimeout(() => { stopMedia(); onClose(); }, 2500);
    socket.emit('call:end', reply => {
      window.clearTimeout(timeout);
      if (!reply?.ok) setError(reply?.message || t('telemedicine.call.endFailed'));
      stopMedia();
      onClose();
    });
  }

  async function toggleAudioOnly() {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) {
      setError(t('telemedicine.call.videoUnavailable'));
      setAudioOnly(true);
      return;
    }
    const next = !audioOnly;
    track.enabled = !next && !cameraOff;
    setAudioOnly(next);
  }

  async function switchCamera() {
    if (audioOnly || !localStreamRef.current?.getVideoTracks().length) return;
    const nextFacing = facingModeRef.current === 'user' ? 'environment' : 'user';
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: nextFacing }, audio: false });
      const nextTrack = cameraStream.getVideoTracks()[0];
      const sender = peerRef.current?.getSenders().find(item => item.track?.kind === 'video');
      if (sender && nextTrack) await sender.replaceTrack(nextTrack);
      const previousTrack = localStreamRef.current.getVideoTracks()[0];
      if (previousTrack) {
        localStreamRef.current.removeTrack(previousTrack);
        previousTrack.stop();
      }
      localStreamRef.current.addTrack(nextTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      facingModeRef.current = nextFacing;
    } catch {
      setError(t('telemedicine.call.switchCameraFailed'));
    }
  }

  async function persistNotes() {
    try {
      await saveConsultationNotes(appointment._id, note);
      setSaved(true);
      setError('');
    } catch (failure) {
      setError(failure.message);
    }
  }

  async function savePrescription(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setPrescriptionBusy(true);
    setPrescriptionError('');
    setPrescriptionSaved(false);
    try {
      await createTelemedicinePrescription(appointment._id, {
        medication: values.get('medication'),
        instructions: values.get('instructions'),
        startDate: values.get('startDate') || undefined,
        endDate: values.get('endDate') || undefined
      });
      form.reset();
      await refreshPrescriptions();
      setPrescriptionSaved(true);
    } catch (failure) {
      setPrescriptionError(failure.message);
    } finally {
      setPrescriptionBusy(false);
    }
  }

  function downloadPrescription() {
    if (!prescriptionBundle?.prescriptions?.length) return;
    const locale = i18n.resolvedLanguage === 'te' ? 'te-IN' : i18n.resolvedLanguage === 'hi' ? 'hi-IN' : 'en-US';
    try {
      printPrescriptionDocument(prescriptionBundle, {
        title: callText('prescriptionTitle'),
        patient: callText('prescriptionPatient'),
        patientId: callText('prescriptionPatientId'),
        doctor: callText('prescriptionDoctor'),
        department: callText('prescriptionDepartment'),
        specialization: callText('prescriptionSpecialization'),
        registrationNumber: callText('prescriptionRegistration'),
        hospital: callText('prescriptionHospital'),
        consultationDate: callText('prescriptionConsultationDate'),
        completedDate: callText('prescriptionCompletedDate'),
        startDate: t('clinical.startDate'),
        endDate: t('clinical.endDate'),
        issued: callText('prescriptionIssued'),
        doctorSignature: callText('prescriptionDoctorSignature'),
        notRecorded: callText('prescriptionNotRecorded'),
        popupBlocked: callText('prescriptionPopupBlocked')
      }, locale);
      setPrescriptionError('');
    } catch (failure) {
      setPrescriptionError(failure.message);
    }
  }

  const peerName = doctor ? appointment.patient?.name : appointment.provider?.name;
  const screenings = clinical?.screenings || EMPTY_LIST;
  const history = clinical?.medicalHistory || EMPTY_LIST;

  useEffect(() => {
    let active = true;
    const objectUrls = [];
    Promise.all(screenings.slice(0, 3).map(async item => {
      try {
        const image = await getScreeningImage(item._id);
        const url = URL.createObjectURL(image);
        objectUrls.push(url);
        return [item._id, { url }];
      } catch {
        return [item._id, { unavailable: true }];
      }
    })).then(entries => {
      if (active) setScreeningImages(Object.fromEntries(entries));
      else objectUrls.forEach(url => URL.revokeObjectURL(url));
    });
    return () => {
      active = false;
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [clinical, screenings]);

  const callText = key => t(`telemedicine.call.${key}`);
  const localizedPhase = phase === 'ended' ? callText('ended') : phase === 'error' ? callText('unableToJoin') : callText(phase);
  const localizedNetwork = callText(network);
  return <div className="video-room-backdrop" role="dialog" aria-modal="true" aria-label={callText('dialogLabel')}>
    <section className="video-room">
      <header>
        <div><b>{callText('title')}</b><small>{peerName || (doctor ? callText('patient') : callText('doctor'))} · {dateLabel(appointment.scheduledAt, i18n.resolvedLanguage)}</small></div>
        <span className={`status-tag ${status.toLowerCase().replaceAll(' ', '-')}`}>{t(`statuses.${status}`, { defaultValue: status })}</span>
        <button className="video-close" aria-label={callText('close')} onClick={closeCall}>×</button>
      </header>
      {error && <div className="form-error video-error" role="alert">{error}</div>}
      <div className={`video-room-grid ${callEnded && status === 'Completed' ? 'video-room-grid-ended' : ''}`}>
        <div className="video-stage">
          <video ref={remoteVideoRef} autoPlay playsInline aria-label={callText('otherVideo')} />
          <div className={`remote-placeholder ${phase === 'live' ? 'remote-connected' : ''}`} role="status">
            {phase === 'live' ? callText('waitingVideo') : phase === 'ended' ? callText('ended') : phase === 'error' ? callText('unableToJoin') : callText('waitingParticipant')}
          </div>
          <video ref={localVideoRef} autoPlay playsInline muted className="local-video" aria-label={callText('yourVideo')} />
          <div className="video-status">{phase === 'live' ? `● ${callText('live')} · ${displayDuration(seconds)} · ${localizedNetwork}` : phase === 'waiting' ? callText('waitingRoom') : localizedPhase}</div>
          <div className="video-controls">
            <button aria-label={muted ? callText('unmute') : callText('mute')} onClick={() => {
              const next = !muted;
              localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
              setMuted(next);
            }}>{muted ? callText('unmuteShort') : callText('muteShort')}</button>
            <button aria-label={cameraOff ? callText('cameraOn') : callText('cameraOff')} disabled={audioOnly} onClick={() => {
              const next = !cameraOff;
              localStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = !next; });
              setCameraOff(next);
            }}>{cameraOff ? callText('cameraOnShort') : callText('cameraOffShort')}</button>
            <button aria-label={callText('switchCamera')} disabled={audioOnly} onClick={switchCamera}>{callText('switchCamera')}</button>
            <button aria-label={audioOnly ? callText('resumeVideo') : callText('audioOnly')} onClick={toggleAudioOnly}>{audioOnly ? callText('resumeVideo') : callText('audioOnly')}</button>
            <button className="end-call-button" disabled={phase === 'ended'} onClick={endCall}>{callText('endCall')}</button>
          </div>
        </div>
        <aside className="video-chat">
          <div className="video-chat-heading"><b>{callText('chat')}</b><small>{callText('chatSupport')}</small></div>
          {doctor && <section className="video-clinical-context" aria-label={callText('clinicalContextAria')}>
            <b>{callText('clinicalContext')}</b>
            <small>{callText('professionalReview')}</small>
            {screenings.slice(0, 3).map(item => <article key={item._id}>
              <b>{callText('screening')} · {dateLabel(item.screenedAt, i18n.resolvedLanguage)}</b>
              <span>{item.aiResult?.category || item.category || callText('reviewAvailable')} · {t(`statuses.${item.status}`, { defaultValue: item.status })}</span>
              {screeningImages[item._id]?.url
                ? <img src={screeningImages[item._id].url} alt={`${callText('screening')} · ${dateLabel(item.screenedAt, i18n.resolvedLanguage)}`} loading="lazy" />
                : screeningImages[item._id]?.unavailable && <small>{callText('imageUnavailable')}</small>}
            </article>)}
            {history.slice(0, 3).map(item => <article key={item._id}><b>{item.title || item.recordType || callText('medicalRecord')}</b><span>{item.notes || callText('noNote')}</span></article>)}
            {!screenings.length && !history.length && <small>{callText('noHistory')}</small>}
          </section>}
          <div className="video-chat-messages">
            {chat.map(item => <article key={item._id || `${item.sentAt}-${item.text}`} className={String(item.sender) === String(auth.user.id) ? 'chat-mine' : ''}>
              <small>{item.senderName} · {t(`language.${item.language === 'te' ? 'telugu' : item.language === 'hi' ? 'hindi' : 'english'}`)}</small><p>{item.text}</p>
            </article>)}
            {!chat.length && <span className="chat-empty">{callText('savedMessages')}</span>}
          </div>
          <form onSubmit={sendMessage}>
            <select disabled={phase === 'ended'} value={chatLanguage} onChange={event => setChatLanguage(event.target.value)} aria-label={callText('messageLanguage')}><option value="en">{t('language.english')}</option><option value="te">{t('language.telugu')}</option><option value="hi">{t('language.hindi')}</option></select>
            <input disabled={phase === 'ended'} value={draft} maxLength={1000} onChange={event => setDraft(event.target.value)} placeholder={callText('messagePlaceholder')} aria-label={callText('messageLabel')} />
            <button type="submit" disabled={phase === 'ended'}>{callText('send')}</button>
          </form>
          {doctor && <div className="video-doctor-notes">
            <label>{callText('doctorNotes')}<textarea value={note} maxLength={5000} onChange={event => { setNote(event.target.value); setSaved(false); }} /></label>
            <button className="clinical-secondary" onClick={persistNotes}>{callText('saveNotes')}</button>
            {saved && <small>{callText('notesSaved')}</small>}
          </div>}
          {callEnded && status === 'Completed' && <section className="video-prescription">
            <div className="video-prescription-heading"><b>{callText('prescriptionTitle')}</b><small>{callText('prescriptionAfterCall')}</small></div>
            {prescriptionLoading && <small>{callText('prescriptionLoading')}</small>}
            {prescriptionError && <div className="form-error" role="alert">{prescriptionError}<button type="button" className="clinical-secondary" onClick={() => refreshPrescriptions().catch(failure => setPrescriptionError(failure.message))}>{t('telemedicine.retry')}</button></div>}
            {prescriptionBundle && <div className="video-prescription-participants">
              <p><b>{callText('prescriptionPatient')}:</b> {prescriptionBundle.patient.name} · {prescriptionBundle.patient.patientId}</p>
              <p><b>{callText('prescriptionDoctor')}:</b> {prescriptionBundle.doctor.name}</p>
              {(prescriptionBundle.doctor.specialization || prescriptionBundle.doctor.department) && <p>{prescriptionBundle.doctor.specialization || prescriptionBundle.doctor.department}</p>}
              {prescriptionBundle.doctor.registrationNumber && <p><b>{callText('prescriptionRegistration')}:</b> {prescriptionBundle.doctor.registrationNumber}</p>}
              {prescriptionBundle.doctor.hospital && <p><b>{callText('prescriptionHospital')}:</b> {prescriptionBundle.doctor.hospital}</p>}
              <p><b>{callText('prescriptionConsultationDate')}:</b> {dateLabel(prescriptionBundle.appointment.scheduledAt, i18n.resolvedLanguage)}</p>
            </div>}
            {prescriptionBundle?.prescriptions?.map(item => <article className="video-prescription-item" key={item._id}>
              <b>{item.medication}</b><p>{item.instructions}</p>
              <small>{t('clinical.startDate')}: {item.startDate ? dateLabel(item.startDate, i18n.resolvedLanguage) : callText('prescriptionNotRecorded')}</small>
              <small>{t('clinical.endDate')}: {item.endDate ? dateLabel(item.endDate, i18n.resolvedLanguage) : callText('prescriptionNotRecorded')}</small>
            </article>)}
            {prescriptionBundle && !prescriptionBundle.prescriptions.length && !doctor && <small>{callText('noPrescription')}</small>}
            {doctor && prescriptionBundle && <form className="video-prescription-form" onSubmit={savePrescription}>
              <label>{t('clinical.medication')}<input name="medication" required maxLength="160"/></label>
              <label>{t('clinical.instructions')}<textarea name="instructions" required maxLength="1000" rows="3"/></label>
              <div><label>{t('clinical.startDate')}<input name="startDate" type="date"/></label><label>{t('clinical.endDate')}<input name="endDate" type="date"/></label></div>
              <button className="clinical-secondary" disabled={prescriptionBusy}>{prescriptionBusy ? callText('prescriptionSaving') : callText('savePrescription')}</button>
              {prescriptionSaved && <small>{callText('prescriptionSaved')}</small>}
            </form>}
            {!!prescriptionBundle?.prescriptions?.length && <div className="video-prescription-download">
              <button className="clinical-secondary" type="button" onClick={downloadPrescription}>{callText('downloadPrescription')}</button>
              <small>{callText('prescriptionPrintHelp')}</small>
            </div>}
          </section>}
        </aside>
      </div>
    </section>
  </div>;
}
