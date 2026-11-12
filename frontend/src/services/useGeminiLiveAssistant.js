import { useCallback, useEffect, useRef, useState } from 'react';
import { createGeminiLiveToken } from './api.js';

const LIVE_SOCKET_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

function appendTranscript(previous, next) {
  const text = String(next || '').trim();
  if (!text || previous.includes(text)) return previous;
  if (text.startsWith(previous)) return text;
  if (previous.startsWith(text)) return previous;
  return `${previous} ${text}`.trim();
}

function downsampleTo16k(samples, sampleRate) {
  if (sampleRate === 16000) return samples;
  const ratio = sampleRate / 16000;
  const output = new Float32Array(Math.floor(samples.length / ratio));
  for (let index = 0; index < output.length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const fraction = position - left;
    const right = Math.min(left + 1, samples.length - 1);
    output[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }
  return output;
}

function pcmToBase64(samples, sampleRate) {
  const resampled = downsampleTo16k(samples, sampleRate);
  const bytes = new Uint8Array(resampled.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < resampled.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, resampled[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function decodePcm(data) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(Math.floor(bytes.length / 2));
  for (let index = 0; index < samples.length; index += 1) samples[index] = view.getInt16(index * 2, true) / 0x8000;
  return samples;
}

export function useGeminiLiveAssistant({ onTranscript, onTurnComplete, responseLanguage = 'auto' } = {}) {
  const [status, setStatus] = useState('idle');
  const [muted, setMuted] = useState(false);
  const [waveform, setWaveform] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const readyPromiseRef = useRef(null);
  const readyResolveRef = useRef(null);
  const readyRejectRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const microphoneSourceRef = useRef(null);
  const processorRef = useRef(null);
  const silenceGainRef = useRef(null);
  const speakerGainRef = useRef(null);
  const playbackSourcesRef = useRef(new Set());
  const playbackTimeRef = useRef(0);
  const pendingAudioRef = useRef(0);
  const turnFinishedRef = useRef(false);
  const suppressPlaybackRef = useRef(false);
  const closedByUserRef = useRef(false);
  const mutedRef = useRef(false);
  const microphoneActiveRef = useRef(false);
  const inputTranscriptRef = useRef('');
  const outputTranscriptRef = useRef('');
  const sessionHandleRef = useRef(null);
  const playbackRateRef = useRef(1);
  const responseLanguageRef = useRef(responseLanguage);
  responseLanguageRef.current = responseLanguage;
  const callbacksRef = useRef({ onTranscript, onTurnComplete });
  callbacksRef.current = { onTranscript, onTurnComplete };

  const setAssistantStatus = useCallback(next => setStatus(next), []);

  const ensureAudioContext = useCallback(async () => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) throw new Error('audio-unsupported');
    if (!audioContextRef.current) {
      const context = new AudioContextConstructor();
      const speakerGain = context.createGain();
      speakerGain.gain.value = 1;
      speakerGain.connect(context.destination);
      audioContextRef.current = context;
      speakerGainRef.current = speakerGain;
    }
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    return audioContextRef.current;
  }, []);

  const stopPlayback = useCallback(() => {
    suppressPlaybackRef.current = true;
    for (const source of playbackSourcesRef.current) {
      source.onended = null;
      try { source.stop(); } catch { /* The source may already have ended. */ }
      source.disconnect();
    }
    playbackSourcesRef.current.clear();
    pendingAudioRef.current = 0;
    turnFinishedRef.current = false;
    if (audioContextRef.current) playbackTimeRef.current = audioContextRef.current.currentTime;
    setStatus(microphoneActiveRef.current ? 'listening' : socketRef.current ? 'connected' : 'idle');
  }, []);

  const stopMicrophone = useCallback(() => {
    processorRef.current?.disconnect();
    microphoneSourceRef.current?.disconnect();
    silenceGainRef.current?.disconnect();
    processorRef.current = null;
    microphoneSourceRef.current = null;
    silenceGainRef.current = null;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    microphoneActiveRef.current = false;
    setWaveform(0);
    setStatus(playbackSourcesRef.current.size ? 'speaking' : socketRef.current ? 'connected' : 'idle');
  }, []);

  const startMicrophone = useCallback(async () => {
    if (microphoneActiveRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('microphone-unsupported');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
    } catch (failure) {
      if (failure.name === 'NotAllowedError' || failure.name === 'SecurityError') throw new Error('microphone-denied');
      if (failure.name === 'NotFoundError' || failure.name === 'NotReadableError' || failure.name === 'OverconstrainedError') throw new Error('microphone-unavailable');
      throw new Error('microphone-failed');
    }

    try {
      const context = await ensureAudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(1024, 1, 1);
      const silenceGain = context.createGain();
      silenceGain.gain.value = 0;
      processor.onaudioprocess = event => {
        const samples = event.inputBuffer.getChannelData(0);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        setWaveform(Math.min(1, Math.sqrt(energy / samples.length) * 5));
        const socket = socketRef.current;
        if (socket?.readyState === WebSocket.OPEN) {
          const audio = mutedRef.current ? new Float32Array(samples.length) : samples;
          socket.send(JSON.stringify({ realtimeInput: { audio: { data: pcmToBase64(audio, context.sampleRate), mimeType: 'audio/pcm;rate=16000' } } }));
        }
      };
      source.connect(processor);
      processor.connect(silenceGain);
      silenceGain.connect(context.destination);
      streamRef.current = stream;
      microphoneSourceRef.current = source;
      processorRef.current = processor;
      silenceGainRef.current = silenceGain;
      microphoneActiveRef.current = true;
      setMuted(mutedRef.current);
      setStatus('listening');
    } catch (failure) {
      for (const track of stream.getTracks()) track.stop();
      throw failure;
    }
  }, [ensureAudioContext]);

  const playAudio = useCallback(async base64 => {
    if (suppressPlaybackRef.current) return;
    const context = await ensureAudioContext();
    const samples = decodePcm(base64);
    if (!samples.length) return;
    const buffer = context.createBuffer(1, samples.length, 24000);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRateRef.current;
    source.connect(speakerGainRef.current);
    const startAt = Math.max(context.currentTime, playbackTimeRef.current);
    playbackTimeRef.current = startAt + buffer.duration / playbackRateRef.current;
    pendingAudioRef.current += 1;
    playbackSourcesRef.current.add(source);
    setStatus('speaking');
    source.onended = () => {
      playbackSourcesRef.current.delete(source);
      source.disconnect();
      pendingAudioRef.current = Math.max(0, pendingAudioRef.current - 1);
      if (!pendingAudioRef.current && turnFinishedRef.current) {
        setStatus(microphoneActiveRef.current ? 'listening' : 'connected');
        suppressPlaybackRef.current = false;
      }
    };
    source.start(startAt);
  }, [ensureAudioContext]);

  const handleMessage = useCallback(message => {
    const resumption = message.sessionResumptionUpdate;
    if (resumption) sessionHandleRef.current = resumption.resumable && resumption.newHandle ? resumption.newHandle : null;
    if (message.setupComplete) {
      setError('');
      setStatus(microphoneActiveRef.current ? 'listening' : 'connected');
      readyResolveRef.current?.();
      readyResolveRef.current = null;
      readyRejectRef.current = null;
      return;
    }
    if (message.error) {
      const failure = new Error('gemini-provider-error');
      setError(failure.message);
      readyRejectRef.current?.(failure);
      setStatus('error');
      return;
    }
    const content = message.serverContent;
    if (!content) return;
    if (content.interrupted) {
      stopPlayback();
      suppressPlaybackRef.current = false;
    }
    if (content.inputTranscription?.text) {
      inputTranscriptRef.current = appendTranscript(inputTranscriptRef.current, content.inputTranscription.text);
      callbacksRef.current.onTranscript?.({ role: 'user', text: inputTranscriptRef.current });
      setStatus('processing');
    }
    if (content.outputTranscription?.text) {
      outputTranscriptRef.current = appendTranscript(outputTranscriptRef.current, content.outputTranscription.text);
      callbacksRef.current.onTranscript?.({ role: 'assistant', text: outputTranscriptRef.current });
    }
    for (const part of content.modelTurn?.parts || []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/pcm')) {
        void playAudio(part.inlineData.data).catch(() => {
          setError('audio-playback-failed');
          setStatus('error');
        });
      }
    }
    if (content.turnComplete) {
      turnFinishedRef.current = true;
      const turn = { userText: inputTranscriptRef.current, assistantText: outputTranscriptRef.current };
      callbacksRef.current.onTurnComplete?.(turn);
      inputTranscriptRef.current = '';
      outputTranscriptRef.current = '';
      if (!pendingAudioRef.current) {
        setStatus(microphoneActiveRef.current ? 'listening' : 'connected');
        suppressPlaybackRef.current = false;
      }
    }
  }, [playAudio, stopPlayback]);

  const connect = useCallback(async () => {
    if (socketRef.current?.readyState === WebSocket.OPEN && readyPromiseRef.current === null) return;
    if (readyPromiseRef.current) return readyPromiseRef.current;
    if (!navigator.onLine) throw new Error('network-unavailable');
    if (typeof WebSocket === 'undefined') throw new Error('websocket-unsupported');
    setError('');
    setStatus('connecting');
    await ensureAudioContext();
    let credentials;
    try {
      credentials = await createGeminiLiveToken(responseLanguageRef.current);
    } catch (failure) {
      const statusCode = failure.statusCode;
      const code = statusCode === 401 ? 'authentication-required'
        : statusCode === 503 ? 'gemini-not-configured'
          : failure.message || 'gemini-token-failed';
      setError(code);
      setStatus('error');
      throw new Error(code);
    }

    const socket = new WebSocket(`${LIVE_SOCKET_URL}?access_token=${encodeURIComponent(credentials.token)}`);
    socketRef.current = socket;
    closedByUserRef.current = false;
    readyPromiseRef.current = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error('gemini-timeout'));
      }, 20000);
      readyResolveRef.current = () => {
        window.clearTimeout(timeout);
        readyPromiseRef.current = null;
        resolve();
      };
      readyRejectRef.current = failure => {
        window.clearTimeout(timeout);
        readyPromiseRef.current = null;
        reject(failure);
      };
      socket.onopen = () => {
        socket.send(JSON.stringify({
          setup: {
            model: `models/${credentials.model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
            },
            contextWindowCompression: { triggerTokens: 25000, slidingWindow: { targetTokens: 8000 } },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: sessionHandleRef.current ? { handle: sessionHandleRef.current } : {},
            systemInstruction: {
              parts: [{
                text: `You are Aarogya Drishti, a friendly oral-health education assistant. Keep spoken responses concise, clear, and natural. Automatically identify whether the user is speaking English, Telugu, or Hindi and reply in that language. ${responseLanguageRef.current === 'auto' ? 'There is no manual language override; continue matching the language the user speaks.' : `The user selected ${({ en: 'English', te: 'Telugu', hi: 'Hindi' })[responseLanguageRef.current] || 'English'} as their preferred reply language; use it unless they ask to change.`} Explain mouth ulcers, white and red patches, oral hygiene, and simple precautions as general education. Never diagnose oral cancer or any disease from voice symptoms, claim to interpret a personal image, recommend medicines or individualized treatment, or claim to access patient records or perform application actions. Do not request or repeat passwords, authentication codes, names, contact details, patient identifiers, or medical-record details. Encourage professional assessment for persistent, worsening, painful, bleeding, or concerning symptoms; for emergencies recommend immediate local emergency or professional care. If a user supplies a clearly labeled trusted educational video description, treat it only as context: do not claim to have watched the video or seen scenes, do not assume a transcript exists, and answer video questions only from supplied details and safe general oral-health education. Do not claim to be a clinician or that AI screening is clinically validated.`
              }]
            },
          }
        }));
      };
      socket.onmessage = async event => {
        try {
          const payload = typeof event.data === 'string'
            ? event.data
            : typeof Blob !== 'undefined' && event.data instanceof Blob
              ? await event.data.text()
              : event.data instanceof ArrayBuffer
                ? new TextDecoder().decode(event.data)
                : event.data;
          handleMessage(JSON.parse(payload));
        }
        catch (failure) {
          setError('gemini-invalid-response');
          setStatus('error');
          readyRejectRef.current?.(new Error('gemini-invalid-response'));
        }
      };
      socket.onerror = () => {
        setError('network-unavailable');
        setStatus('error');
        readyRejectRef.current?.(new Error('network-unavailable'));
      };
      socket.onmessageerror = () => {
        setError('gemini-invalid-response');
        setStatus('error');
        readyRejectRef.current?.(new Error('gemini-invalid-response'));
      };
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (!closedByUserRef.current) {
          stopMicrophone();
          setError('gemini-disconnected');
          setStatus('error');
        }
        readyRejectRef.current?.(new Error('gemini-disconnected'));
      };
    });
    try {
      await readyPromiseRef.current;
    } catch (failure) {
      socketRef.current = null;
      throw failure;
    }
  }, [ensureAudioContext, handleMessage, stopMicrophone]);

  const startVoice = useCallback(async () => {
    suppressPlaybackRef.current = false;
    await startMicrophone();
    try {
      await connect();
    } catch (failure) {
      stopMicrophone();
      throw failure;
    }
  }, [connect, startMicrophone, stopMicrophone]);

  const sendText = useCallback(async text => {
    await connect();
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('gemini-disconnected');
    stopPlayback();
    suppressPlaybackRef.current = false;
    inputTranscriptRef.current = text;
    outputTranscriptRef.current = '';
    suppressPlaybackRef.current = false;
    setStatus('processing');
    socket.send(JSON.stringify({ realtimeInput: { text } }));
    callbacksRef.current.onTranscript?.({ role: 'user', text });
  }, [connect, stopPlayback]);

  const setPlaybackRate = useCallback(value => {
    const next = Math.min(1.5, Math.max(0.75, Number(value) || 1));
    playbackRateRef.current = next;
    setPlaybackRateState(next);
    for (const source of playbackSourcesRef.current) source.playbackRate.value = next;
  }, []);

  const setResponseLanguage = useCallback(language => {
    const next = ['en', 'te', 'hi'].includes(language) ? language : 'auto';
    responseLanguageRef.current = next;
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      const instruction = next === 'auto'
        ? 'Language preference changed: automatically detect whether the user is speaking English, Telugu, or Hindi and answer in their spoken language.'
        : `Language preference changed: answer in ${({ en: 'English', te: 'Telugu', hi: 'Hindi' })[next]} until the user changes this preference.`;
      stopPlayback();
      suppressPlaybackRef.current = false;
      socket.send(JSON.stringify({ realtimeInput: { text: instruction } }));
    }
  }, [stopPlayback]);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
  }, []);

  const disconnect = useCallback(() => {
    closedByUserRef.current = true;
    stopMicrophone();
    stopPlayback();
    const socket = socketRef.current;
    socketRef.current = null;
    readyPromiseRef.current = null;
    readyResolveRef.current = null;
    readyRejectRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
      speakerGainRef.current = null;
    }
    setMuted(false);
    mutedRef.current = false;
    sessionHandleRef.current = null;
    playbackTimeRef.current = 0;
    setError('');
    setStatus('idle');
  }, [stopMicrophone, stopPlayback]);

  useEffect(() => () => {
    closedByUserRef.current = true;
    processorRef.current?.disconnect();
    microphoneSourceRef.current?.disconnect();
    silenceGainRef.current?.disconnect();
    for (const track of streamRef.current?.getTracks() || []) track.stop();
    for (const source of playbackSourcesRef.current) {
      source.onended = null;
      try { source.stop(); } catch { /* The source may already have ended. */ }
    }
    if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) socketRef.current.close();
    if (audioContextRef.current) void audioContextRef.current.close();
  }, []);

  return {
    status,
    muted,
    waveform,
    playbackRate,
    error,
    startVoice,
    stopMicrophone,
    sendText,
    stopSpeaking: stopPlayback,
    toggleMute,
    setPlaybackRate,
    setResponseLanguage,
    disconnect,
    setStatus: setAssistantStatus,
    clearError: () => setError('')
  };
}
