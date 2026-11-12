import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext.jsx';
import './telemedicine-call.css';
import {
  getAccessToken, getClinicalPatient, getRealtimeOrigin, getScreeningImage, getTelemedicineConfig,
  getTelemedicineRoom, saveConsultationNotes
} from '../services/api.js';

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
        if (['Completed', 'Cancelled', 'Declined'].includes(roomData.consultation.status)) {
          setPhase('ended');
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
          setPhase('ended');
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
  }, [appointment._id, appointment.patient?._id, auth.user.role, doctor, stopMedia]);

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
      <div className="video-room-grid">
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
            <select value={chatLanguage} onChange={event => setChatLanguage(event.target.value)} aria-label={callText('messageLanguage')}><option value="en">{t('language.english')}</option><option value="te">{t('language.telugu')}</option><option value="hi">{t('language.hindi')}</option></select>
            <input value={draft} maxLength={1000} onChange={event => setDraft(event.target.value)} placeholder={callText('messagePlaceholder')} aria-label={callText('messageLabel')} />
            <button type="submit">{callText('send')}</button>
          </form>
          {doctor && <div className="video-doctor-notes">
            <label>{callText('doctorNotes')}<textarea value={note} maxLength={5000} onChange={event => { setNote(event.target.value); setSaved(false); }} /></label>
            <button className="clinical-secondary" onClick={persistNotes}>{callText('saveNotes')}</button>
            {saved && <small>{callText('notesSaved')}</small>}
          </div>}
        </aside>
      </div>
    </section>
  </div>;
}
