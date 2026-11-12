const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { VoiceTranscript, Patient, Appointment, Referral, AuditLog } = require('../models');
const { hasValidSignature } = require('../utils/fileSignatures');
const { canDoctorAccess, doctorPatientIds } = require('./doctorAssignmentService');
const { providerError } = require('./geminiLiveService');

const languages = ['en-IN', 'te-IN', 'hi-IN', 'ta-IN', 'kn-IN'];
const aiUrl = () => (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const languageNames = { 'en-IN': 'English', 'te-IN': 'Telugu', 'hi-IN': 'Hindi', 'ta-IN': 'Tamil', 'kn-IN': 'Kannada' };

function containsPcmSpeech(file) {
  const buffer = file.buffer;
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return true;
  let offset = 12;
  let pcm = false;
  let dataStart = -1;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const chunk = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > buffer.length) return true;
    if (chunk === 'fmt ' && length >= 16) pcm = buffer.readUInt16LE(start) === 1 && buffer.readUInt16LE(start + 14) === 16;
    if (chunk === 'data') { dataStart = start; dataLength = length; break; }
    offset = start + length + (length % 2);
  }
  if (!pcm || dataStart < 0 || dataLength < 2) return true;
  let energy = 0;
  const samples = Math.floor(dataLength / 2);
  for (let index = 0; index < samples; index += 1) {
    const sample = buffer.readInt16LE(dataStart + index * 2);
    energy += sample * sample;
  }
  return Math.sqrt(energy / samples) >= 25;
}

async function transcribeAudioWithGemini(file, language) {
  const mimeType = String(file.mimetype).split(';', 1)[0].toLowerCase();
  if (mimeType === 'audio/webm') throw new ApiError(415, 'This audio format cannot be transcribed directly. Record again using WAV or Ogg audio.');
  if (!containsPcmSpeech(file)) throw new ApiError(422, 'No speech was detected. Record again in a quiet place or enter the transcript manually.');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiError(503, 'Speech transcription is not configured. Set GEMINI_API_KEY on the backend.');
  const requestedLanguage = language === 'auto' ? 'Detect whether the speaker is using English, Telugu, Hindi, Tamil, or Kannada.' : `The spoken language is ${languageNames[language]}.`;
  let response;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    response = await ai.models.generateContent({
      model: process.env.GEMINI_ASSISTANT_MODEL || 'gemini-3.8-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: file.buffer.toString('base64') } },
          { text: `Transcribe this patient-reported speech verbatim, preserving the original language. ${requestedLanguage} Also translate the transcript into English. Do not diagnose or infer symptoms. Return only a JSON object with exactly these string fields: transcript, detectedLanguage (one of en-IN, te-IN, hi-IN, ta-IN, kn-IN), englishTranslation. If speech is not intelligible, return an empty transcript.` }
        ]
      }],
      config: { responseMimeType: 'application/json', temperature: 0 }
    });
  } catch (error) {
    console.error('Gemini speech transcription failed:', error.name || 'ProviderError');
    throw providerError(error);
  }
  let parsed;
  try { parsed = JSON.parse(String(response.text || '').trim()); }
  catch { throw new ApiError(502, 'Speech transcription returned an invalid response. Please retry the recording.'); }
  if (!parsed || typeof parsed.transcript !== 'string' || typeof parsed.detectedLanguage !== 'string' || typeof parsed.englishTranslation !== 'string' || !languages.includes(parsed.detectedLanguage)) {
    throw new ApiError(502, 'Speech transcription returned an invalid response. Please retry the recording.');
  }
  return {
    transcript: parsed.transcript,
    detectedLanguage: parsed.detectedLanguage,
    detectionConfidence: null,
    speechConfidence: null,
    englishTranslation: parsed.englishTranslation
  };
}

async function patientForWrite(patientId, user) {
  if (!mongoose.isValidObjectId(patientId)) throw new ApiError(400, 'Choose a valid patient');
  const patient = await Patient.findById(patientId);
  if (!patient) throw new ApiError(404, 'Patient record not found');
  if (!['patient', 'asha', 'doctor', 'admin'].includes(user.role)) throw new ApiError(403, 'Your role cannot create patient transcripts');
  if (user.role === 'patient' && String(patient.user || '') !== String(user._id)) throw new ApiError(403, 'You can only save your own transcript');
  if (user.role === 'asha' && String(patient.assignedWorker || '') !== String(user._id)) throw new ApiError(403, 'This patient is outside your assigned community');
  if (user.role === 'doctor') {
    const related = await canDoctorAccess(patient, user._id);
    if (!related) throw new ApiError(403, 'A patient appointment or referral is required');
  }
  return patient;
}
async function assertRead(patientId, user) {
  if (user.role === 'admin') return;
  const patient = await Patient.findById(patientId).select('user assignedWorker assignedDoctor');
  if (!patient) throw new ApiError(404, 'Patient record not found');
  if (user.role === 'patient' && String(patient.user || '') === String(user._id)) return;
  if (user.role === 'asha' && String(patient.assignedWorker || '') === String(user._id)) return;
  if (user.role === 'doctor' && await canDoctorAccess(patient, user._id)) return;
  throw new ApiError(403, 'This transcript is outside your patient relationship');
}
async function postAi(path, formData) {
  let response;
  try { response = await fetch(`${aiUrl()}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.AI_SERVICE_TOKEN || 'local-development-ai-service-token-change-me'}` }, body: formData, signal: AbortSignal.timeout(60000) }); }
  catch { throw new ApiError(503, 'Speech service is unavailable. Use manual transcript entry or retry later.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status >= 400 && response.status < 500 ? response.status : 502, data.detail || 'Speech service could not process this request');
  return data;
}
function extractSymptoms(text) {
  const entries = [
    ['mouth pain', /\b(mouth|oral|tooth|teeth)\s+(pain|ache|aching)\b|\btoothache\b/],
    ['mouth sore or ulcer', /\b(mouth sore|oral sore|ulcer|canker sore)\b/],
    ['swelling', /\b(swelling|swollen|lump)\b/], ['bleeding', /\b(bleeding|bleeds|blood)\b/],
    ['white patches', /\b(white patch|white patches|white spots)\b/], ['burning sensation', /\b(burning|burns)\b/],
    ['difficulty swallowing', /\b(difficulty swallowing|trouble swallowing|painful swallowing)\b/],
    ['dry mouth', /\b(dry mouth|mouth is dry)\b/], ['bad breath', /\b(bad breath|halitosis)\b/]
  ];
  return entries.filter(([, regex]) => regex.test(String(text).toLowerCase())).map(([label]) => label);
}
async function persist(patient, user, source, result, fallbackLanguage) {
  const original = String(result.transcript || '').trim();
  if (!original) throw new ApiError(422, 'No speech was recognized. Try again or enter the transcript manually.');
  const detected = languages.includes(result.detectedLanguage) ? result.detectedLanguage : fallbackLanguage;
  const transcript = await VoiceTranscript.create({
    patient: patient._id, createdBy: user._id, source, originalLanguage: fallbackLanguage, detectedLanguage: detected,
    detectionConfidence: result.detectionConfidence, speechConfidence: result.speechConfidence, originalTranscript: original,
    englishTranslation: String(result.englishTranslation || ''), translationBack: '',
    reportedSymptoms: extractSymptoms(result.englishTranslation || original), transcriptNotice: 'Reported symptoms only. Not a diagnosis.'
  });
  await AuditLog.create({ actor: user._id, action: 'voice_transcript.created', resourceType: 'VoiceTranscript', resourceId: transcript._id, metadata: { source, detectedLanguage: detected } });
  return transcript.toObject();
}
async function transcribe(file, patientId, language, user) {
  if (!file) throw new ApiError(400, 'Record or choose an audio clip');
  if (!hasValidSignature(file.buffer, String(file.mimetype).split(';', 1)[0].toLowerCase())) throw new ApiError(415, 'The uploaded audio contents do not match a supported audio format');
  if (language !== 'auto' && !languages.includes(language)) throw new ApiError(400, 'Choose English, Telugu, Hindi, Tamil, Kannada, or auto-detect');
  const patient = await patientForWrite(patientId, user);
  const result = await transcribeAudioWithGemini(file, language);
  return persist(patient, user, 'voice', result, languages.includes(language) ? language : result.detectedLanguage);
}
async function manual(data, user) {
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  const language = data?.language;
  if (!text || text.length > 10000) throw new ApiError(400, 'Enter a transcript between 1 and 10,000 characters');
  if (!languages.includes(language)) throw new ApiError(400, 'Choose English, Telugu, Hindi, Tamil, or Kannada');
  const patient = await patientForWrite(data.patientId, user);
  let result = { transcript: text, detectedLanguage: language, detectionConfidence: null, englishTranslation: language === 'en-IN' ? text : '' };
  if (language !== 'en-IN') {
    try {
      const form = new FormData(); form.append('text', text); form.append('sourceLanguage', language.split('-')[0]); form.append('targetLanguage', 'en');
      const translated = await postAi('/voice/translate', form);
      result.englishTranslation = translated.translation;
    } catch { /* Manual source text still saves so it remains available when voice/translation fails. */ }
  }
  return { ...(await persist(patient, user, 'manual', result, language)), translationPending: !result.englishTranslation };
}
async function translate(id, direction, user) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid transcript ID');
  const transcript = await VoiceTranscript.findById(id);
  if (!transcript) throw new ApiError(404, 'Transcript not found');
  await assertRead(transcript.patient, user);
  let text, sourceLanguage, targetLanguage;
  if (direction === 'to-english') { text = transcript.originalTranscript; sourceLanguage = transcript.detectedLanguage.split('-')[0]; targetLanguage = 'en'; }
  else if (direction === 'to-original') { text = transcript.englishTranslation; sourceLanguage = 'en'; targetLanguage = transcript.detectedLanguage.split('-')[0]; }
  else throw new ApiError(400, 'Direction must be to-english or to-original');
  if (!text) throw new ApiError(400, 'The source transcript is empty');
  const form = new FormData(); form.append('text', text); form.append('sourceLanguage', sourceLanguage); form.append('targetLanguage', targetLanguage);
  const result = await postAi('/voice/translate', form);
  if (direction === 'to-english') transcript.englishTranslation = result.translation;
  else transcript.translationBack = result.translation;
  await transcript.save();
  return transcript.toObject();
}
async function speak(data, user) {
  if (!['patient', 'asha', 'doctor'].includes(user.role)) throw new ApiError(403, 'Your role cannot request speech playback');
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  const language = data?.language;
  if (!text || text.length > 4000) throw new ApiError(400, 'Text-to-speech supports 1 to 4,000 characters');
  if (!languages.includes(language)) throw new ApiError(400, 'Choose a supported speech language');
  const form = new FormData(); form.append('text', text); form.append('language', language);
  const response = await fetch(`${aiUrl()}/voice/synthesize`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.AI_SERVICE_TOKEN || 'local-development-ai-service-token-change-me'}` }, body: form, signal: AbortSignal.timeout(60000) }).catch(() => null);
  if (!response) throw new ApiError(503, 'Speech service is unavailable');
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new ApiError(502, body.detail || 'Could not generate speech audio'); }
  return Buffer.from(await response.arrayBuffer());
}
async function list(user, query) {
  const filter = {};
  if (user.role === 'patient') { const patient = await Patient.findOne({ user: user._id }).select('_id'); filter.patient = patient?._id || new mongoose.Types.ObjectId('000000000000000000000000'); }
  else if (user.role === 'asha') { const ids = await Patient.find({ assignedWorker: user._id }).distinct('_id'); filter.patient = { $in: ids }; }
  else if (user.role === 'doctor') {
    filter.patient = { $in: await doctorPatientIds(user._id) };
  } else if (user.role !== 'admin') throw new ApiError(403, 'Your role cannot view patient transcripts');
  if (query.pending === 'true') filter['review.status'] = 'pending';
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
  const limit = Math.max(1, Math.min(100, Number.parseInt(query.limit, 10) || 50));
  const [items, total] = await Promise.all([
    VoiceTranscript.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('patient', 'patientId name village').populate('createdBy', 'name role').populate('review.reviewedBy', 'name').lean(),
    VoiceTranscript.countDocuments(filter)
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
async function review(id, data, user) {
  if (!['doctor', 'admin'].includes(user.role)) throw new ApiError(403, 'Doctor review access required');
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid transcript ID');
  const transcript = await VoiceTranscript.findById(id);
  if (!transcript) throw new ApiError(404, 'Transcript not found');
  if (user.role === 'doctor') await assertRead(transcript.patient, user);
  const notes = typeof data?.notes === 'string' ? data.notes.trim() : '';
  if (notes.length > 2000) throw new ApiError(400, 'Review notes must be 2,000 characters or fewer');
  transcript.review = { status: 'reviewed', notes, reviewedBy: user._id, reviewedAt: new Date() };
  await transcript.save();
  await AuditLog.create({ actor: user._id, action: 'voice_transcript.reviewed', resourceType: 'VoiceTranscript', resourceId: transcript._id });
  return transcript.toObject();
}
module.exports = { transcribe, manual, translate, speak, list, review, languages, transcribeAudioWithGemini, containsPcmSpeech };
