import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LoaderCircle, Mic, MicOff, RotateCcw, Send, Volume2, X, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { sendAssistantMessage } from '../services/api.js';
import { LanguageSelector } from './LanguageSelector.jsx';
import './voice-assistant-widget.css';

const speechLanguages = { en: 'en-IN', te: 'te-IN', hi: 'hi-IN' };

function createMessage(role, text) {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, role, text };
}

export function VoiceAssistantWidget() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const language = ['en', 'te', 'hi'].includes(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [waveLevel, setWaveLevel] = useState(0);
  const [recognized, setRecognized] = useState('');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);
  const messageQueueRef = useRef(Promise.resolve());
  const conversationVersionRef = useRef(0);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mountedRef = useRef(true);
  const messageListRef = useRef(null);

  function stopMeter() {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') void audioContext.close();
    setWaveLevel(0);
  }

  function stopListening() {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.stop(); } catch { /* The browser may already have stopped recognition. */ }
    }
    stopMeter();
    setListening(false);
  }

  function speak(text) {
    if (muted || !text || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return;
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = speechLanguages[language];
    window.speechSynthesis.speak(utterance);
  }

  function submitMessage(value) {
    const message = String(value || '').trim();
    if (!message) return;
    if (!user) {
      setError(t('assistantWidget.signInRequired'));
      return;
    }
    setError('');
    setRecognized(message);
    setMessages(previous => [...previous, createMessage('user', message)].slice(-30));
    const version = conversationVersionRef.current;
    messageQueueRef.current = messageQueueRef.current.then(async () => {
      if (!mountedRef.current || version !== conversationVersionRef.current) return;
      setProcessing(true);
      try {
        const result = await sendAssistantMessage({ message, language });
        if (mountedRef.current && version === conversationVersionRef.current) {
          setMessages(previous => [...previous, createMessage('assistant', result.message)].slice(-30));
          speak(result.message);
        }
      } catch (failure) {
        if (mountedRef.current && version === conversationVersionRef.current) {
          const errorKey = failure.statusCode === 503
            ? 'assistantWidget.notConfigured'
            : !failure.statusCode || failure.statusCode >= 500
              ? 'assistantWidget.networkError'
              : '';
          setError(errorKey ? t(errorKey) : failure.message);
        }
      } finally {
        if (mountedRef.current) setProcessing(false);
      }
    });
  }

  async function startListening() {
    if (!user) {
      setError(t('assistantWidget.signInRequired'));
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError(t('assistantWidget.speechUnsupported'));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('assistantWidget.microphoneUnsupported'));
      return;
    }
    setError('');
    setRecognized('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) throw new Error('audio-unsupported');
      const audioContext = new AudioContextConstructor();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') await audioContext.resume();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const measure = () => {
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          energy += normalized * normalized;
        }
        setWaveLevel(Math.min(1, Math.sqrt(energy / samples.length) * 4));
        animationFrameRef.current = requestAnimationFrame(measure);
      };
      animationFrameRef.current = requestAnimationFrame(measure);

      const recognition = new Recognition();
      recognition.lang = speechLanguages[language];
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onresult = event => {
        let interim = '';
        const finalPhrases = [];
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const phrase = event.results[index][0]?.transcript?.trim();
          if (!phrase) continue;
          if (event.results[index].isFinal) finalPhrases.push(phrase);
          else interim += `${phrase} `;
        }
        if (interim.trim()) setRecognized(interim.trim());
        finalPhrases.forEach(phrase => { void submitMessage(phrase); });
      };
      recognition.onerror = event => {
        const errorKey = event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'assistantWidget.microphoneDenied'
          : event.error === 'audio-capture'
            ? 'assistantWidget.microphoneUnsupported'
            : event.error === 'language-not-supported'
              ? 'assistantWidget.languageUnsupported'
            : event.error === 'network'
              ? 'assistantWidget.networkError'
              : event.error === 'no-speech'
                ? 'assistantWidget.noSpeech'
                : 'assistantWidget.speechFailed';
        setError(t(errorKey));
        stopListening();
      };
      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
          stopMeter();
          setListening(false);
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch (failure) {
      stopListening();
      setError(failure.name === 'NotAllowedError' || failure.name === 'SecurityError'
        ? t('assistantWidget.microphoneDenied')
        : failure.name === 'NotSupportedError'
          ? t('assistantWidget.languageUnsupported')
        : failure.message === 'audio-unsupported'
          ? t('assistantWidget.microphoneUnsupported')
          : t('assistantWidget.microphoneFailed'));
    }
  }

  function clearConversation() {
    conversationVersionRef.current += 1;
    stopListening();
    window.speechSynthesis?.cancel();
    setMessages([]);
    setRecognized('');
    setDraft('');
    setError('');
  }

  function closePanel() {
    stopListening();
    window.speechSynthesis?.cancel();
    setOpen(false);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try { recognition.stop(); } catch { /* The browser may already have stopped recognition. */ }
      }
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') void audioContextRef.current.close();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, processing]);

  return <div className="assistant-widget">
    {open && <section className="assistant-widget-panel" role="dialog" aria-modal="false" aria-labelledby="assistant-widget-title">
      <header className="assistant-widget-header">
        <span className="assistant-widget-orb" aria-hidden="true"><Volume2 size={18}/></span>
        <div><h2 id="assistant-widget-title">{t('assistantWidget.title')}</h2><p>{t(listening ? 'assistantWidget.listening' : processing ? 'assistantWidget.thinking' : 'assistantWidget.ready')}</p></div>
        <button type="button" className="assistant-widget-close" onClick={closePanel} aria-label={t('assistantWidget.close')}><X size={18}/></button>
      </header>
      <div className="assistant-widget-toolbar">
        <LanguageSelector className="assistant-widget-language"/>
        <button type="button" className="assistant-widget-clear" onClick={clearConversation} disabled={!messages.length && !recognized && !error} aria-label={t('assistantWidget.clear')} title={t('assistantWidget.clear')}><Trash2 size={16}/></button>
      </div>
      {listening && <div className="assistant-widget-waveform" role="img" aria-label={t('assistantWidget.waveform')} style={{ '--wave-level': waveLevel }}>
        {Array.from({ length: 7 }, (_, index) => <span key={index} style={{ '--bar-index': index }}/>)}
      </div>}
      <div className="assistant-widget-messages" ref={messageListRef} aria-label={t('assistantWidget.conversation')} aria-live="polite">
        {!messages.length && !recognized && <p className="assistant-widget-empty">{t(user ? 'assistantWidget.welcome' : 'assistantWidget.signInRequired')}</p>}
        {messages.map(item => <article key={item.id} className={`assistant-widget-message is-${item.role}`}>
          <strong>{t(item.role === 'user' ? 'assistantWidget.you' : 'assistantWidget.assistant')}</strong>
          <p dir="auto">{item.text}</p>
          {item.role === 'assistant' && <button type="button" onClick={() => speak(item.text)} disabled={!window.speechSynthesis || muted} aria-label={t('assistantWidget.replay')} title={t('assistantWidget.replay')}><RotateCcw size={14}/></button>}
        </article>)}
        {recognized && <p className="assistant-widget-recognized"><strong>{t('assistantWidget.recognized')}:</strong> <span dir="auto">{recognized}</span></p>}
        {processing && <p className="assistant-widget-thinking" role="status"><LoaderCircle size={15}/>{t('assistantWidget.thinking')}</p>}
        {error && <p className="assistant-widget-error" role="alert">{error}</p>}
      </div>
      <form className="assistant-widget-input" onSubmit={event => {
        event.preventDefault();
        const message = draft;
        setDraft('');
        void submitMessage(message);
      }}>
        <input value={draft} maxLength={2000} onChange={event => setDraft(event.target.value)} placeholder={t('assistantWidget.placeholder')} aria-label={t('assistantWidget.placeholder')} disabled={!user || processing}/>
        <button type="submit" disabled={!user || processing || !draft.trim()} aria-label={t('assistantWidget.send')} title={t('assistantWidget.send')}><Send size={17}/></button>
      </form>
      <footer className="assistant-widget-controls">
        <button type="button" className="assistant-widget-mic" onClick={listening ? stopListening : startListening} disabled={!user || processing}>
          {listening ? <><MicOff size={17}/>{t('assistantWidget.stop')}</> : <><Mic size={17}/>{t('assistantWidget.start')}</>}
        </button>
        <button type="button" className="assistant-widget-control" onClick={() => {
          const next = !muted;
          setMuted(next);
          if (next) window.speechSynthesis?.cancel();
        }} aria-label={t(muted ? 'assistantWidget.unmute' : 'assistantWidget.mute')} title={t(muted ? 'assistantWidget.unmute' : 'assistantWidget.mute')}>
          {muted ? <MicOff size={16}/> : <Volume2 size={16}/>}
        </button>
      </footer>
      <p className="assistant-widget-privacy">{t('assistantWidget.privacy')}</p>
      <p className="assistant-widget-safety">{t('assistantWidget.safety')}</p>
      {!user && <button type="button" className="assistant-widget-signin" onClick={() => navigate('/login')}>{t('assistantWidget.signIn')}</button>}
    </section>}
    <button className={`assistant-widget-trigger${listening ? ' is-listening' : ''}`} type="button" onClick={() => {
      if (open) closePanel();
      else setOpen(true);
    }} aria-expanded={open} aria-label={open ? t('assistantWidget.close') : t('assistantWidget.open')} title={open ? t('assistantWidget.close') : t('assistantWidget.open')}>
      <span className="assistant-widget-trigger-ring" aria-hidden="true"/><Mic size={22}/>
    </button>
  </div>;
}
