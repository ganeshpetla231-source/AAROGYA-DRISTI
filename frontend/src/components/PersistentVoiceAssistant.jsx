import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoaderCircle, Mic, MicOff, RotateCcw, Send, Square, Trash2, Volume2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import i18n from '../i18n/index.js';
import { createVoiceConversation, deleteVoiceConversation, saveVoiceConversationTurn } from '../services/api.js';
import { roles } from '../data/demoData.js';
import { useGeminiLiveAssistant } from '../services/useGeminiLiveAssistant.js';
import './persistent-voice-assistant.css';

const localeCodes = { en: 'en-IN', te: 'te-IN', hi: 'hi-IN' };



const pageRoutes = {
  appointments: ['patient', 'doctor'],
  patients: ['asha', 'doctor', 'admin'],
  facilities: ['asha', 'doctor', 'hospital', 'district', 'admin'],
  maps: ['patient', 'asha', 'doctor', 'district'],
  'clinical-workspace': ['doctor'],
  education: roles.map(role => role.id),
  'voice-assistant': ['patient', 'asha'],
  'voice-review': ['doctor'],
  analytics: ['asha', 'doctor', 'specialist', 'hospital', 'district', 'admin'],
  notifications: roles.map(role => role.id),
  overview: roles.map(role => role.id)
};
const voiceLanguagePromptKey = 'aarogya-voice-language-prompted';

function putFormValue(name, value) {
  const field = document.querySelector(`.patient-create [name="${name}"]`);
  if (!(field instanceof HTMLInputElement)) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  field.focus();
  return true;
}

function normalized(value) {
  return value.toLocaleLowerCase().replace(/[.,!?।؟]/g, ' ').replace(/\s+/g, ' ').trim();
}



const assistantUi = {
  en: {
    textMode: 'Text', voiceMode: 'Voice', speed: 'Speech speed', processing: 'Connecting to Gemini…', thinking: 'Thinking…', speaking: 'Aarogya Drishti is speaking',
    connected: 'Gemini Live is connected. Ask your next question anytime.', muted: 'Microphone muted', mute: 'Mute microphone',
    unmute: 'Unmute microphone', stopSpeaking: 'Stop speaking', history: 'Conversation', placeholder: 'Ask a health or app question…',
    waveform: 'Microphone audio level', signIn: 'Sign in for private AI conversations. Voice is sent to Gemini only while enabled.',
    medicalDisclaimer: 'General health education only, not a medical diagnosis. For an emergency, contact local emergency services or a qualified clinician immediately.'
  },
  te: {
    textMode: 'టెక్స్ట్', voiceMode: 'వాయిస్', speed: 'మాటల వేగం', processing: 'Geminiకి కనెక్ట్ అవుతోంది…', thinking: 'ఆలోచిస్తోంది…', speaking: 'ఆరోగ్య దృష్టి మాట్లాడుతోంది',
    connected: 'Gemini Live కనెక్ట్ అయింది. తదుపరి ప్రశ్న ఎప్పుడైనా అడగండి.', muted: 'మైక్రోఫోన్ మ్యూట్‌లో ఉంది', mute: 'మైక్రోఫోన్ మ్యూట్ చేయి',
    unmute: 'మైక్రోఫోన్ అన్‌మ్యూట్ చేయి', stopSpeaking: 'మాట్లాడటం ఆపు', history: 'సంభాషణ', placeholder: 'ఆరోగ్యం లేదా యాప్ గురించి అడగండి…',
    waveform: 'మైక్రోఫోన్ ఆడియో స్థాయి', signIn: 'ప్రైవేట్ AI సంభాషణ కోసం సైన్ ఇన్ చేయండి. వాయిస్ ఆన్‌లో ఉన్నప్పుడు మాత్రమే Geminiకి పంపబడుతుంది.',
    medicalDisclaimer: 'ఇది సాధారణ ఆరోగ్య సమాచారం మాత్రమే; వైద్య నిర్ధారణ కాదు. అత్యవసర పరిస్థితిలో వెంటనే స్థానిక అత్యవసర సేవలను లేదా అర్హత గల వైద్యుడిని సంప్రదించండి.'
  },
  hi: {
    textMode: 'टेक्स्ट', voiceMode: 'वॉइस', speed: 'बोलने की गति', processing: 'Gemini से कनेक्ट हो रहा है…', thinking: 'सोच रहा है…', speaking: 'आरोग्य दृष्टि बोल रहा है',
    connected: 'Gemini Live जुड़ा है। अगला सवाल कभी भी पूछें।', muted: 'माइक्रोफ़ोन म्यूट है', mute: 'माइक्रोफ़ोन म्यूट करें',
    unmute: 'माइक्रोफ़ोन अनम्यूट करें', stopSpeaking: 'बोलना रोकें', history: 'बातचीत', placeholder: 'स्वास्थ्य या ऐप के बारे में पूछें…',
    waveform: 'माइक्रोफ़ोन ऑडियो स्तर', signIn: 'निजी AI बातचीत के लिए साइन इन करें। वॉइस चालू होने पर ही Gemini को भेजी जाती है।',
    medicalDisclaimer: 'यह केवल सामान्य स्वास्थ्य जानकारी है, चिकित्सा निदान नहीं। आपात स्थिति में तुरंत स्थानीय आपातकालीन सेवाओं या योग्य चिकित्सक से संपर्क करें।'
  }
};

function errorMessage(code, language) {
  const messages = i18n.getResource(language, 'translation', 'persistentVoiceErrors') || {};
  const fallback = i18n.getResource(language, 'translation', 'persistentVoiceAssistant')?.[language]?.failed || '';
  return messages[language]?.[code] || messages.en?.[code] || (String(code || '').startsWith('Cannot reach') ? code : fallback);
}

export function PersistentVoiceAssistant() {
  const { i18n } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const language = ['en', 'te', 'hi'].includes(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
  const text = i18n.getResource(language, 'translation', 'persistentVoiceAssistant')?.[language] || i18n.getResource('en', 'translation', 'persistentVoiceAssistant')?.en;
  const isPublicPage = location.pathname === '/' || location.pathname.startsWith('/topics/');
  const [open, setOpen] = useState(false);
  const [recognized, setRecognized] = useState('');
  const [response, setResponse] = useState('');
  const [conversation, setConversation] = useState([]);
  const conversationIdRef = useRef(null);
  const persistenceQueueRef = useRef(Promise.resolve());
  const ownerId = auth.user?.id || auth.user?._id || null;
  const previousOwnerRef = useRef(ownerId);
  const [streamingResponse, setStreamingResponse] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [inputMode, setInputMode] = useState('text');
  const [responseLanguage, setResponseLanguage] = useState('auto');
  const [permission, setPermission] = useState('unknown');
  const [firstVisit, setFirstVisit] = useState(() => {
    try {
      return !window.localStorage.getItem(voiceLanguagePromptKey);
    } catch {
      return false;
    }
  });
  const [registrationStep, setRegistrationStep] = useState('');
  const [pendingField, setPendingField] = useState(null);
  const voiceCommandHandlerRef = useRef(null);
  const inputModeRef = useRef(inputMode);
  inputModeRef.current = inputMode;
  const responseRef = useRef('');
  const responseLanguageRef = useRef('en-IN');
  const isHome = location.pathname === '/' || location.pathname === '/topics/ai-lesion-detection';
  const live = useGeminiLiveAssistant({ responseLanguage,
    onTranscript: event => {
      if (event.role === 'user') {
        setRecognized(event.text);
      } else {
        setStreamingResponse(event.text);
      }
    },
    onTurnComplete: turn => {
      if (turn.userText) voiceCommandHandlerRef.current?.(turn.userText, false);
      setConversation(previous => [
        ...previous,
        ...(turn.userText ? [{ role: 'user', text: turn.userText }] : []),
        ...(turn.assistantText ? [{ role: 'assistant', text: turn.assistantText }] : [])
      ].slice(-40));
      if (auth.user && ['patient', 'doctor'].includes(auth.user.role) && (turn.userText || turn.assistantText)) {
        const messages = [
          ...(turn.userText ? [{ role: 'user', text: turn.userText }] : []),
          ...(turn.assistantText ? [{ role: 'assistant', text: turn.assistantText }] : [])
        ];
        persistenceQueueRef.current = persistenceQueueRef.current.then(async () => {
          if (!conversationIdRef.current) {
            const created = await createVoiceConversation(language);
            conversationIdRef.current = created._id;
          }
          await saveVoiceConversationTurn(conversationIdRef.current, { language, messages });
        }).catch(failure => setError(failure.message || 'Conversation history could not be saved.'));
      }
      if (turn.assistantText) {
        responseRef.current = turn.assistantText;
        setResponse(turn.assistantText);
        responseLanguageRef.current = localeCodes[language];
      }
      setRecognized('');
      setStreamingResponse('');
    }
  });
  useEffect(() => {
    if (previousOwnerRef.current === ownerId) return;
    previousOwnerRef.current = ownerId;
    conversationIdRef.current = null;
    setConversation([]);
    setRecognized('');
    setStreamingResponse('');
    setResponse('');
  }, [ownerId]);
  const listening = live.status === 'listening';
  const processing = live.status === 'connecting' || live.status === 'processing';
  const speaking = live.status === 'speaking';
  const assistantError = error || (live.error ? errorMessage(live.error, language) : '');

  function speak(message, languageCode = localeCodes[language]) {
    responseRef.current = message;
    responseLanguageRef.current = languageCode;
    setResponse(message);
    if (!window.speechSynthesis || !message) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = languageCode;
    utterance.rate = live.playbackRate;
    window.speechSynthesis.speak(utterance);
  }

  function stopListening() {
    live.stopMicrophone();
  }

  async function startListening() {
    setError('');
    setInputMode('voice');
    if (!auth.user) {
      setError(text.loginFirst);
      return;
    }
    if (!open) window.dispatchEvent(new CustomEvent('aarogya:floating-widget-open', { detail: 'voice' }));
    try {
      live.stopSpeaking();
      await live.startVoice();
      setPermission('granted');
    } catch (failure) {
      setError(errorMessage(failure.message, language));
    }
  }

  async function sendToGemini(message) {
    const question = message.trim();
    if (!question) return;
    if (!auth.user) {
      setError(text.loginFirst);
      return;
    }
    setError('');
    setRecognized(question);
    setStreamingResponse('');
    window.speechSynthesis?.cancel();
    live.stopSpeaking();
    if (!open) window.dispatchEvent(new CustomEvent('aarogya:floating-widget-open', { detail: 'voice' }));
    try {
      await live.sendText(question);
    } catch (failure) {
      setError(errorMessage(failure.message, language));
    }
  }

  useEffect(() => () => {
    live.disconnect();
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    const receiveVideoContext = event => {
      const context = event.detail;
      if (!context || typeof context.title !== 'string' || typeof context.description !== 'string') return;
      const selectedLanguage = ['en', 'te', 'hi'].includes(context.language) ? context.language : language;
      const symptoms = Array.isArray(context.importantSymptoms) ? context.importantSymptoms.join('; ') : '';
      const precautions = Array.isArray(context.precautions) ? context.precautions.join('; ') : '';
      const safeContext = [
        'Trusted educational video context. This is curated descriptive text, not a transcript or video input.',
        `Title: ${context.title.slice(0, 180)}`,
        `Source: ${String(context.sourceTitle || '').slice(0, 180)}`,
        `Description: ${context.description.slice(0, 1200)}`,
        `Simple explanation: ${String(context.explanation || '').slice(0, 1200)}`,
        `Important symptoms: ${symptoms.slice(0, 1200)}`,
        `Precautions: ${precautions.slice(0, 1200)}`,
        'Do not claim you watched the video, diagnose anyone, or recommend medicine. Answer only from this information and general safe oral-health education.'
      ].join('\n');
      setDraft(safeContext);
      setInputMode('text');
      setOpen(true);
      setError('');
      if (selectedLanguage !== language) void i18n.changeLanguage(selectedLanguage);
      live.setResponseLanguage(selectedLanguage);
      window.dispatchEvent(new CustomEvent('aarogya:floating-widget-open', { detail: 'voice' }));
      setTimeout(() => document.querySelector('.voice-command-form input')?.focus(), 0);
    };
    window.addEventListener('aarogya:video-context-open', receiveVideoContext);
    return () => window.removeEventListener('aarogya:video-context-open', receiveVideoContext);
  }, [language, i18n, live.setResponseLanguage]);

  useEffect(() => {
    const closeForOtherWidget = event => {
      if (event.detail !== 'voice') {
        stopListening();
        live.stopSpeaking();
        setOpen(false);
      }
    };
    window.addEventListener('aarogya:floating-widget-open', closeForOtherWidget);
    return () => window.removeEventListener('aarogya:floating-widget-open', closeForOtherWidget);
  }, []);
  useEffect(() => {
    const openAssistant = () => {
      setInputMode('text');
      setOpen(true);
    };
    window.addEventListener('aarogya:voice-assistant-open', openAssistant);
    return () => window.removeEventListener('aarogya:voice-assistant-open', openAssistant);
  }, []);

  useEffect(() => {
    if (!firstVisit || !isPublicPage) return;
    responseRef.current = text.chooseLanguage;
    setResponse(text.chooseLanguage);
    setFirstVisit(false);
    try {
      window.localStorage.setItem(voiceLanguagePromptKey, 'true');
    } catch (failure) {
      console.warn('Could not remember that the voice language prompt was shown.', failure);
    }
  }, [firstVisit, isPublicPage]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        stopListening();
        live.stopSpeaking();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  function goToPage(page, action = '') {
    const role = auth.user?.role;
    if (!role) {
      speak(text.loginFirst);
      navigate('/login');
      return false;
    }
    if (!pageRoutes[page]?.includes(role)) {
      speak(text.permissionRequired);
      return false;
    }
    const query = new URLSearchParams({ voicePage: page });
    if (action) query.set('voiceAction', action);
    if (location.pathname === `/app/${role}`) {
      navigate(`/app/${role}?${query}`);
    } else {
      navigate(`/app/${role}?${query}`);
    }
    return true;
  }

  function startPatientForm() {
    setPendingField(null);
    setRegistrationStep('name');
    speak(text.openedPatientForm);
    setTimeout(() => speak(text.askName), 600);
  }

  function openPatientRegistration() {
    if (!auth.user) {
      setRegistrationStep('');
      setPendingField(null);
      speak(text.openedRegister);
      navigate('/login?mode=register');
      return;
    }
    if (!pageRoutes.patients.includes(auth.user.role)) {
      speak(text.permissionRequired);
      return;
    }
    if (goToPage('patients', 'add-patient')) startPatientForm();
  }

  function changeLanguage(target) {
    if (!target) return false;
    void i18n.changeLanguage(target);
    setResponseLanguage(target);
    live.setResponseLanguage(target);
    setError('');
    speak(i18n.getResource(target, 'translation', 'persistentVoiceAssistant')?.[target]?.changed, localeCodes[target]);
    return true;
  }

  function selectResponseLanguage(target) {
    if (target === 'auto') {
      setResponseLanguage('auto');
      live.setResponseLanguage('auto');
      speak(text.automatic, localeCodes[language]);
      return;
    }
    changeLanguage(target);
  }

  function resetConversation() {
    live.disconnect();
    window.speechSynthesis?.cancel();
    setConversation([]);
    persistenceQueueRef.current = persistenceQueueRef.current.then(async () => {
      if (conversationIdRef.current) await deleteVoiceConversation(conversationIdRef.current);
      conversationIdRef.current = null;
    }).catch(failure => setError(failure.message || 'Conversation history could not be cleared.'));
    setRecognized('');
    setStreamingResponse('');
    setDraft('');
    setResponse('');
    setError('');
    setRegistrationStep('');
    setPendingField(null);
    setHelpOpen(false);
    responseRef.current = '';
  }

  function handleWizardCommand(command) {
    const value = command.trim();
    if (['cancel', 'stop', 'రద్దు', 'వద్దు', 'ఆపు', 'ఆపండి', 'नहीं', 'रद्द', 'रद्द करें', 'रोकें'].includes(normalized(value))) {
      setRegistrationStep('');
      setPendingField(null);
      speak(text.cancelField);
      return true;
    }
    if (!pendingField) {
      const field = registrationStep;
      if (!field) return false;
      setPendingField({ field, value });
      speak(text.confirmValue);
      return true;
    }
    const answer = normalized(value);
    const positive = ['yes', 'correct', 'confirm', 'అవును', 'సరే', 'నిర్ధారించు', 'ஆம்', 'हाँ', 'सही', 'पुष्टि'].some(word => answer.includes(normalized(word)));
    const negative = ['no', 'wrong', 'లేదు', 'తప్పు', 'இல்லை', 'नहीं', 'गलत'].some(word => answer.includes(normalized(word)));
    if (negative) {
      setPendingField(null);
      speak(text.cancelField);
      return true;
    }
    if (!positive) {
      speak(text.confirmValue);
      return true;
    }
    const { field, value: confirmedValue } = pendingField;
    if (!putFormValue(field, confirmedValue)) {
      setPendingField(null);
      setRegistrationStep('');
      speak(text.cancelField);
      return true;
    }
    setPendingField(null);
    const next = { name: ['patientId', text.savedName], patientId: ['village', text.savedId], village: ['', text.allFields] }[field];
    setRegistrationStep(next[0]);
    speak(next[1]);
    if (next[0]) setTimeout(() => speak(next[0] === 'patientId' ? text.askId : text.askVillage), 900);
    return true;
  }

  function handleCommand(command, askGemini = true) {
    const value = normalized(command);
    if (!value) return false;
    setError('');
    if (registrationStep && handleWizardCommand(command)) return true;
    if (value.includes('english') || value.includes('ఇంగ్లీష్') || value.includes('अंग्रेज़ी') || value.includes('अंग्रेजी')) return changeLanguage('en');
    if (value.includes('telugu') || value.includes('తెలుగు')) return changeLanguage('te');
    if (value.includes('hindi') || value.includes('हिन्दी') || value.includes('हिंदी')) return changeLanguage('hi');
    if (['stop', 'ఆపు', 'ఆపండి', 'రద్దు', 'बंद करो', 'रोकें'].some(word => value.includes(normalized(word)))) {
      stopListening();
      window.speechSynthesis?.cancel();
      setRegistrationStep('');
      setPendingField(null);
      speak(text.stopped);
      return true;
    }
    if (['repeat', 'మళ్లీ చెప్పు', 'మళ్ళీ చెప్పు', 'दोहराएँ', 'फिर से'].some(word => value.includes(normalized(word)))) {
      if (responseRef.current) speak(responseRef.current, responseLanguageRef.current);
      else speak(text.repeat);
      return true;
    }
    if (['help', 'సహాయం', 'मदद'].some(word => value === normalized(word))) {
      setHelpOpen(true);
      speak(text.help);
      return true;
    }
    if (['read this page aloud', 'ఈ పేజీ చదువు', 'ఈ పేజీని చదవు', 'यह पृष्ठ पढ़ें', 'पेज पढ़ें'].some(word => value.includes(normalized(word)))) {
      const educationPage = document.querySelector('.topic-detail');
      const content = educationPage
        ? Array.from(educationPage.querySelectorAll('.topic-detail-hero, .topic-content-panel, .topic-clinical-guide, .topic-urgent-note')).map(section => section.innerText.trim()).filter(Boolean).join('. ')
        : document.querySelector('.page-heading')?.innerText?.trim() || document.querySelector('main h1')?.textContent?.trim() || document.title;
      speak(`${text.readPage} ${content.slice(0, 2400)}. ${text.security}`);
      return true;
    }
    if (['register a new patient', 'register patient', 'new patient', 'కొత్త రోగి నమోదు', 'కొత్త పేషెంట్ నమోదు', 'రోగిని నమోదు', 'नया मरीज पंजीकरण', 'नए मरीज़ का पंजीकरण', 'नया रोगी दर्ज'].some(word => value.includes(normalized(word)))) {
      openPatientRegistration();
      return true;
    }
    if (['book an appointment', 'book appointment', 'appointment', 'అపాయింట్‌మెంట్', 'సమయం బుక్', 'डॉक्टर का समय', 'अपॉइंटमेंट', 'समय बुक'].some(word => value.includes(normalized(word)))) {
      if (goToPage('appointments')) speak(text.appointment);
      return true;
    }
    if (['my patient record', 'show my record', 'patient record', 'నా రోగి రికార్డు', 'రోగి రికార్డు', 'मेरा रोगी रिकॉर्ड', 'रोगी रिकॉर्ड'].some(word => value.includes(normalized(word)))) {
      if (!auth.user) {
        speak(text.loginFirst);
        navigate('/login');
      } else if (auth.user.role === 'patient') {
        if (goToPage('overview')) speak(text.patientRecord);
      } else if (goToPage('patients')) {
        speak(text.generic);
      }
      return true;
    }
    if (['mouth ulcer', 'ulcer precaution', 'mouth sore', 'నోటిపుండు', 'నోటి పుండు', 'పుండ్ల జాగ్రత్త', 'मुंह का छाला', 'मुँह का छाला', 'छाले की सावधानी'].some(word => value.includes(normalized(word)))) {
      setRegistrationStep('');
      setPendingField(null);
      navigate('/topics/ai-lesion-detection');
      speak(text.education);
      return true;
    }
    if (['oral cancer', 'cancer symptoms', 'symptoms', 'నోటి క్యాన్సర్', 'క్యాన్సర్ లక్షణాలు', 'క్యాన్సర్ సూచనలు', 'मुख कैंसर', 'मुँह के कैंसर', 'कैंसर के लक्षण'].some(word => value.includes(normalized(word)))) {
      setRegistrationStep('');
      setPendingField(null);
      navigate('/topics/ai-lesion-detection');
      speak(text.education);
      return true;
    }
    if (['doctor section', 'doctor portal', 'clinical section', 'వైద్యుల విభాగం', 'డాక్టర్ విభాగం', 'వైద్యుల పోర్టల్', 'डॉक्टर अनुभाग', 'डॉक्टर पोर्टल'].some(word => value.includes(normalized(word)))) {
      if (goToPage('clinical-workspace')) speak(text.doctor);
      return true;
    }
    if (['map', 'care location', 'health center', 'maps', 'మ్యాప్', 'ఆరోగ్య కేంద్రం', 'ఆరోగ్య కేంద్రాలు', 'मानचित्र', 'स्वास्थ्य केंद्र'].some(word => value.includes(normalized(word)))) {
      if (goToPage('maps')) speak(text.generic);
      return true;
    }
    if (['voice assistant', 'voice help', 'వాయిస్ సహాయకుడు', 'వాయిస్ అసిస్టెంట్', 'आवाज़ सहायक', 'वॉइस सहायक'].some(word => value.includes(normalized(word)))) {
      const page = auth.user?.role === 'doctor' ? 'voice-review' : 'voice-assistant';
      if (goToPage(page)) speak(text.generic);
      return true;
    }
    if (['home page', 'go home', 'హోమ్ పేజీ', 'ఇంటికి వెళ్లు', 'होम पेज', 'होम पर जाएँ'].some(word => value.includes(normalized(word)))) {
      setRegistrationStep('');
      setPendingField(null);
      navigate('/');
      speak(text.generic);
      return true;
    }
    if (['help me fill this form', 'fill this form', 'ఫారం నింపడంలో సహాయం', 'ఈ ఫారం నింపడంలో సహాయం', 'फ़ॉर्म भरने में मदद', 'फॉर्म भरने में मदद'].some(word => value.includes(normalized(word)))) {
      openPatientRegistration();
      return true;
    }
    if (askGemini) void sendToGemini(command);
    return false;
  }

  voiceCommandHandlerRef.current = handleCommand;

  function confirmPendingField() {
    if (!pendingField) return;
    const field = pendingField.field;
    if (!putFormValue(field, pendingField.value)) {
      setPendingField(null);
      setRegistrationStep('');
      speak(text.cancelField);
      return;
    }
    setPendingField(null);
    const next = { name: ['patientId', text.savedName], patientId: ['village', text.savedId], village: ['', text.allFields] }[field];
    setRegistrationStep(next[0]);
    speak(next[1]);
    if (next[0]) setTimeout(() => speak(next[0] === 'patientId' ? text.askId : text.askVillage), 900);
  }

  function rejectPendingField() {
    setPendingField(null);
    speak(text.cancelField);
  }

  const currentQuestion = pendingField ? text.confirmValue : registrationStep === 'name' ? text.askName : registrationStep === 'patientId' ? text.askId : registrationStep === 'village' ? text.askVillage : '';
  const ui = assistantUi[language];
  const statusLabel = processing ? (live.status === 'connecting' ? ui.processing : ui.thinking)
    : speaking ? ui.speaking
      : listening ? text.listening
        : live.status === 'connected' ? ui.connected
          : permission === 'denied' ? text.denied : text.security;

  return <div className={`voice-dock ${isHome ? 'voice-dock-home' : ''}`}>
    {open && <section className="voice-assistant-panel" role="dialog" aria-modal="false" aria-label={text.name} aria-live="polite">
      <header className="voice-panel-header"><span className={`voice-panel-orb ${speaking ? 'is-speaking' : ''}`}><Volume2 size={17}/></span><div><strong>{text.name}</strong><small>{statusLabel}</small></div><button type="button" onClick={() => { stopListening(); live.stopSpeaking(); setOpen(false); }} aria-label={text.close}><X size={17}/></button></header>
      <label className="voice-language-picker"><span>{text.language}</span><select value={responseLanguage} onChange={event => selectResponseLanguage(event.target.value)}><option value="auto">{text.automatic}</option><option value="en">{i18n.t('language.english')}</option><option value="te">{i18n.t('language.telugu')}</option><option value="hi">{i18n.t('language.hindi')}</option></select></label>
      <label className="voice-speed-control"><span>{ui.speed} · {live.playbackRate.toFixed(2)}×</span><input type="range" min="0.75" max="1.5" step="0.25" value={live.playbackRate} onChange={event => live.setPlaybackRate(event.target.value)} aria-label={ui.speed}/></label>
      <div className="assistant-mode-toggle" role="group" aria-label={text.language}>
        <button type="button" className={inputMode === 'text' ? 'is-active' : ''} onClick={() => { setInputMode('text'); stopListening(); }}>{ui.textMode}</button>
        <button type="button" className={inputMode === 'voice' ? 'is-active' : ''} onClick={startListening}>{ui.voiceMode}</button>
      </div>
      {listening && <div className="voice-waveform" role="img" aria-label={ui.waveform} style={{ '--wave-level': live.waveform }}>
        {Array.from({ length: 7 }, (_, index) => <span key={index}/>)}
      </div>}
      {speaking && <p className="assistant-speaking-indicator" role="status">{ui.speaking}</p>}
      <p className="voice-mic-status"><span className={listening ? 'voice-live-dot' : ''}/>{processing && <LoaderCircle className="assistant-spinner" size={13}/>} {live.muted && listening ? ui.muted : statusLabel}</p>
      {conversation.length > 0 && <div className="voice-conversation" aria-label={ui.history}>
        {conversation.map((message, index) => <p className={`voice-conversation-message is-${message.role}`} key={`${index}-${message.role}`}><strong>{message.role === 'user' ? text.recognized : text.response}:</strong> <span dir="auto">{message.text}</span></p>)}
      </div>}
      {currentQuestion && <div className="voice-guided-question"><strong>{text.response}</strong><p>{currentQuestion}</p>{pendingField ? <><p className="voice-readback-value" dir="auto">{pendingField.value}</p><div className="voice-confirm-actions"><button type="button" onClick={confirmPendingField}>{text.yes}</button><button type="button" onClick={rejectPendingField}>{text.no}</button></div></> : <button className="voice-cancel-entry" type="button" onClick={() => { setRegistrationStep(''); setPendingField(null); speak(text.cancelField); }}>{text.cancelEntry}</button>}</div>}
      {recognized && <p className="voice-transcript"><strong>{text.recognized}:</strong> <span dir="auto">{recognized}</span></p>}
      {streamingResponse && <p className="voice-response"><strong>{text.response}:</strong> <span dir="auto">{streamingResponse}</span></p>}
      {response && !currentQuestion && conversation.at(-1)?.text !== response && <p className="voice-response"><strong>{text.response}:</strong> {response}<button type="button" onClick={() => speak(responseRef.current, responseLanguageRef.current)} aria-label={text.repeatResponse}><RotateCcw size={14}/></button></p>}
      {assistantError && <p className="voice-error" role="alert">{assistantError}</p>}
      {helpOpen && <p className="voice-help" role="note">{text.help}</p>}
      <form className="voice-command-form" onSubmit={event => { event.preventDefault(); const command = draft.trim(); setDraft(''); setRecognized(command); handleCommand(command); }}>
        <input aria-label={text.command} value={draft} onChange={event => setDraft(event.target.value)} placeholder={ui.placeholder}/>
        <button type="submit" disabled={!draft.trim()} aria-label={text.send}><Send size={16}/></button>
      </form>
      <footer className="voice-controls">
        <button className="voice-primary-control" type="button" onClick={listening ? stopListening : startListening}>{listening ? <><MicOff size={17}/>{text.stop}</> : <><Mic size={17}/>{text.start}</>}</button>
        <button className="voice-icon-control" type="button" onClick={live.toggleMute} disabled={!listening} aria-label={live.muted ? ui.unmute : ui.mute} title={live.muted ? ui.unmute : ui.mute}>{live.muted ? <MicOff size={16}/> : <Mic size={16}/>}<span>{live.muted ? ui.unmute : ui.mute}</span></button>
        <button className="voice-icon-control" type="button" onClick={live.stopSpeaking} disabled={!speaking} aria-label={ui.stopSpeaking} title={ui.stopSpeaking}><Square size={14}/><span>{ui.stopSpeaking}</span></button>
        <button className="voice-icon-control voice-reset-control" type="button" onClick={resetConversation} aria-label={text.resetConversation} title={text.resetConversation}><Trash2 size={15}/><span>{text.resetConversation}</span></button>
        <button className="voice-help-control" type="button" onClick={() => { setHelpOpen(value => !value); if (!helpOpen) speak(text.help); }} aria-expanded={helpOpen}>{text.helpTitle}</button>
      </footer>
      <p className="voice-privacy-note">{text.idle}</p>
      <p className="voice-privacy-note">{ui.medicalDisclaimer}</p>
    </section>}
    <button className={`voice-dock-trigger ${isHome ? 'voice-dock-trigger-home' : ''} ${listening ? 'is-listening' : ''}`} type="button" onClick={() => { if (listening) stopListening(); else { if (!open) window.dispatchEvent(new CustomEvent('aarogya:floating-widget-open', { detail: 'voice' })); setOpen(value => !value); if (!open) setTimeout(() => document.querySelector('.voice-command-form input')?.focus(), 0); } }} aria-label={listening ? text.stop : open ? text.close : text.open} title={listening ? text.stop : open ? text.close : text.open} aria-expanded={open}>
      <span className="voice-trigger-rings"/><Mic size={isHome ? 25 : 21}/><span className="voice-trigger-label">{isHome ? text.start : text.name}</span>
    </button>
  </div>;
}
