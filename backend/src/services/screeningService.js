const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const notifications = require('./notificationService');
const { hasValidSignature } = require('../utils/fileSignatures');
const fileStorage = require('./fileStorageService');
const { canDoctorAccess, doctorPatientIds } = require('./doctorAssignmentService');
const { OralScreening, Patient, Appointment, Referral, AuditLog, OfflineScreeningMetadata, Consent, User, Hospital } = require('../models');

const categories = ['possible-ulcer', 'possible-thrush', 'possible-gingivitis', 'possible-infection', 'possible-white-patch', 'possible-red-lesion', 'other-abnormality', 'insufficient-quality', 'no-visible-abnormality'];
const maxBytes = 8 * 1024 * 1024;
const key = () => {
  const configured = process.env.SCREENING_IMAGE_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === 'production' && (!configured || configured.length < 32)) throw new Error('Set SCREENING_IMAGE_ENCRYPTION_KEY to at least 32 characters in production');
  return crypto.createHash('sha256').update(configured || 'local-development-screening-image-key-only').digest();
};
function encrypted(bytes) {
  const nonce = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key(), nonce);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from('ADIMG1'), nonce, cipher.getAuthTag(), ciphertext]);
}
function decrypted(bytes) {
  if (bytes.toString('ascii', 0, 6) !== 'ADIMG1') throw new Error('Stored screening image has an invalid format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), bytes.subarray(6, 18));
  decipher.setAuthTag(bytes.subarray(18, 34)); return Buffer.concat([decipher.update(bytes.subarray(34)), decipher.final()]);
}
async function assertPatientScope(patient, user) {
  if (!['asha', 'doctor'].includes(user.role)) throw new ApiError(403, 'Your role cannot submit oral screenings');
  if (user.role === 'asha' && String(patient.assignedWorker || '') !== String(user._id)) throw new ApiError(403, 'This patient is outside your assigned community');
  if (user.role === 'doctor') {
    const related = await canDoctorAccess(patient, user._id);
    if (!related) throw new ApiError(403, 'A patient appointment or referral is required to screen this record');
  }
}
async function syncOfflineMetadata(body, user) {
    if (!['asha', 'doctor'].includes(user.role)) throw new ApiError(403, 'Your role cannot submit screening metadata');
    const { clientRequestId, patientId, consentGranted, capturedAt, symptoms = [] } = body || {};
    if (typeof clientRequestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(clientRequestId)) throw new ApiError(400, 'A valid client request ID is required');
    if (!mongoose.isValidObjectId(patientId)) throw new ApiError(400, 'Choose a valid patient');
    if (consentGranted !== true) throw new ApiError(400, 'Patient consent is required before saving screening metadata');
    if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) throw new ApiError(400, 'A valid capture date is required');
    if (!Array.isArray(symptoms) || symptoms.length > 12 || symptoms.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 120)) throw new ApiError(400, 'Provide up to 12 brief symptom descriptions');
    const patient = await Patient.findById(patientId);
    if (!patient) throw new ApiError(404, 'Patient record not found');
    await assertPatientScope(patient, user);
    const clean = {
      patient: String(patient._id), consentGranted: true, capturedAt: new Date(capturedAt).toISOString(),
      symptoms: symptoms.map(item => item.trim())
    };
    const requestHash = crypto.createHash('sha256').update(JSON.stringify(clean)).digest('hex');
    try {
      const record = await OfflineScreeningMetadata.create({ clientRequestId, createdBy: user._id, patient: patient._id, consentGranted: true, capturedAt: clean.capturedAt, symptoms: clean.symptoms, requestHash });
      await AuditLog.create({ actor: user._id, action: 'screening.offline_metadata_synced', resourceType: 'OfflineScreeningMetadata', resourceId: record._id, metadata: { clientRequestId } });
      return { id: record._id, clientRequestId, status: 'pending-clinical-assessment', message: 'Analysis Pending — Internet Required. Metadata saved for clinician assessment; no AI analysis was performed.' };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existing = await OfflineScreeningMetadata.findOne({ createdBy: user._id, clientRequestId }).select('+requestHash').lean();
      if (!existing) throw error;
      if (existing.requestHash !== requestHash) throw new ApiError(409, 'This request ID was already used with different screening details');
      return { id: existing._id, clientRequestId, status: existing.status, message: 'This offline screening metadata was already synchronized.' };
  }
}
async function callAi(file) {
  const form = new FormData();
  form.append('image', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'screening-image');
  let response;
  try { response = await fetch(`${process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000'}/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.AI_SERVICE_TOKEN || 'local-development-ai-service-token-change-me'}` }, body: form, signal: AbortSignal.timeout(30000) }); }
  catch { throw new ApiError(503, 'AI service is unavailable. Start the FastAPI service and retry.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError([413, 415, 422, 503].includes(response.status) ? response.status : 502, body.detail || 'AI service could not process this image');
  if (!categories.includes(body.category) || !Number.isFinite(body.confidence) || body.confidence < 0 || body.confidence > 1 || body.category === 'insufficient-quality') throw new ApiError(502, 'AI service returned an invalid screening result');
  return body;
}
async function upload(file, patientId, consentGranted, user) {
  if (consentGranted !== 'true') throw new ApiError(400, 'Patient consent is required before processing or storing a screening image');
  if (!file) throw new ApiError(400, 'Choose a screening image');
  if (file.size > maxBytes) throw new ApiError(413, 'Image exceeds the 8 MB limit. Choose a smaller image.');
  const types = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  if (!types[file.mimetype]) throw new ApiError(415, 'Use a JPEG, PNG, or WebP image');
  if (!hasValidSignature(file.buffer, file.mimetype)) throw new ApiError(415, 'The uploaded image contents do not match its file type');
  if (!mongoose.isValidObjectId(patientId)) throw new ApiError(400, 'Choose a valid patient');
  const patient = await Patient.findById(patientId);
  if (!patient) throw new ApiError(404, 'Patient record not found');
  await assertPatientScope(patient, user);
  const aiResult = await callAi(file);
  const storageKey = `${crypto.randomUUID()}.enc`;
  await fileStorage.put(storageKey, encrypted(file.buffer));
  try {
    const screening = await OralScreening.create({
      patient: patient._id, screenedBy: user._id, category: aiResult.category,
      aiResult: { category: aiResult.category, confidence: aiResult.confidence, adapter: aiResult.adapter, demonstration: true, suspicious: aiResult.suspicious, quality: aiResult.quality, evaluatedAt: aiResult.evaluatedAt },
      imageStorageKey: storageKey, imageMimeType: file.mimetype, imageSha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
      imageConsentGranted: true, imageConsentAt: new Date(),
      status: aiResult.suspicious ? 'Needs review' : 'Analyzed', demonstration: true, screenedAt: new Date()
    });
    await AuditLog.create({ actor: user._id, action: 'screening.ai_submitted', resourceType: 'OralScreening', resourceId: screening._id, metadata: { adapter: aiResult.adapter, demonstration: true } });
    const safe = screening.toObject(); delete safe.imageStorageKey; delete safe.imageMimeType; delete safe.imageSha256; return safe;
  } catch (error) { await fileStorage.remove(storageKey).catch(() => {}); throw error; }
}
const questionnaireEnums = {
  ageRange: ['under-18', '18-29', '30-44', '45-59', '60-plus', 'prefer-not-to-say'],
  gender: ['female', 'male', 'other', 'prefer-not-to-say'],
  tobaccoUse: ['yes', 'no', 'unknown'],
  alcoholUse: ['yes', 'no', 'occasionally', 'unknown'],
  arecaNutUse: ['yes', 'no', 'unknown'],
  habitDuration: ['less-than-year', '1-5-years', 'over-5-years', 'unknown'],
  symptomDuration: ['less-than-week', '1-2-weeks', '2-4-weeks', '1-3-months', 'over-3-months', 'unknown']
};
const questionnaireSymptoms = ['white-patch', 'red-patch', 'non-healing-ulcer', 'lump-or-thickening', 'difficulty-opening-mouth', 'difficulty-swallowing', 'pain-chewing', 'bleeding', 'persistent-pain-or-numbness', 'voice-change-or-neck-lump'];
const tobaccoOptions = ['cigarettes', 'cigars', 'chewing-tobacco', 'gutka', 'khaini', 'pan-masala', 'other'];
function patientQuestionnaire(value) {
  let input = value;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { throw new ApiError(400, 'Questionnaire must be valid JSON'); }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'Complete the screening questionnaire');
  const allowed = new Set(['version', 'language', 'ageRange', 'gender', 'previousOralProblems', 'tobaccoUse', 'tobaccoTypes', 'alcoholUse', 'arecaNutUse', 'habitDuration', 'symptoms', 'symptomDuration', 'otherSymptoms', 'location']);
  const unknown = Object.keys(input).find(key => !allowed.has(key));
  if (unknown) throw new ApiError(400, `Unsupported questionnaire field: ${unknown}`);
  const result = { version: 'oral-intake-v1', language: input.language || 'en' };
  if (!['en', 'te', 'hi'].includes(result.language)) throw new ApiError(400, 'Choose English, Telugu, or Hindi for the questionnaire');
  for (const [field, values] of Object.entries(questionnaireEnums)) {
    if (input[field] !== undefined && !values.includes(input[field])) throw new ApiError(400, `Choose a valid ${field}`);
    if (input[field] !== undefined) result[field] = input[field];
  }
  for (const field of ['previousOralProblems', 'otherSymptoms', 'location']) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== 'string' || input[field].trim().length > (field === 'location' ? 120 : 1000)) throw new ApiError(400, `Enter a valid ${field}`);
      result[field] = input[field].trim();
    }
  }
  for (const [field, allowedValues] of [['symptoms', questionnaireSymptoms], ['tobaccoTypes', tobaccoOptions]]) {
    if (input[field] !== undefined && (!Array.isArray(input[field]) || input[field].length > allowedValues.length || input[field].some(item => !allowedValues.includes(item)))) {
      throw new ApiError(400, `Choose valid ${field}`);
    }
    if (input[field]) result[field] = [...new Set(input[field])];
  }
  return result;
}

async function uploadPatientScreening(file, body, user) {
  if (user.role !== 'patient') throw new ApiError(403, 'Patient screening access required');
  if (body?.consentGranted !== 'true') throw new ApiError(400, 'Consent is required before processing or storing screening information');
  if (!file) throw new ApiError(400, 'Choose an oral image');
  if (file.size > maxBytes) throw new ApiError(413, 'Image exceeds the 8 MB limit. Choose a smaller image.');
  const types = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  if (!types[file.mimetype] || !hasValidSignature(file.buffer, file.mimetype)) throw new ApiError(415, 'Upload a valid JPEG, PNG, or WebP image');
  const oralRegion = body?.oralRegion;
  if (!['tongue', 'inner-cheek', 'gums', 'lips', 'floor-of-mouth', 'roof-of-mouth', 'other'].includes(oralRegion)) {
    throw new ApiError(400, 'Choose the oral region shown in this image');
  }
  const questionnaire = patientQuestionnaire(body.questionnaire);
  const patient = await Patient.findOne({ user: user._id });
  if (!patient) throw new ApiError(404, 'No patient record is linked to this account');
  let reviewingDoctor;
  if (body.reviewingDoctor) {
    if (!mongoose.isValidObjectId(body.reviewingDoctor)) throw new ApiError(400, 'Choose a valid verified doctor');
    const doctor = await User.findOne({
      _id: body.reviewingDoctor, role: 'doctor', isActive: true, approvalStatus: 'approved',
      'doctorProfile.profileVerifiedAt': { $exists: true }
    }).select('_id').lean();
    if (!doctor) throw new ApiError(400, 'Choose an active, verified doctor');
    reviewingDoctor = doctor._id;
  }
  let consent = body.hospitalId ? { hospital: body.hospitalId } : null;
  if (consent && !mongoose.isValidObjectId(consent.hospital)) throw new ApiError(400, 'Choose a valid hospital');
  if (consent) {
    consent.hospital = await Hospital.findOne({ _id: consent.hospital, isActive: true }).select('_id').lean();
    if (!consent.hospital) throw new ApiError(400, 'Choose an active hospital');
  }
  if (reviewingDoctor && consent?.hospital) {
    const doctor = await User.exists({ _id: reviewingDoctor, hospital: consent.hospital._id });
    if (!doctor) throw new ApiError(400, 'The selected doctor does not work at the selected hospital');
  }
  const storageKey = `${crypto.randomUUID()}.enc`;
  await fileStorage.put(storageKey, encrypted(file.buffer));
  let screening;
  try {
    const now = new Date();
    screening = await OralScreening.create({
      patient: patient._id, screenedBy: user._id, reviewingDoctor, oralRegion, questionnaire,
      category: 'pending-clinical-assessment', status: 'Awaiting clinician review',
      imageStorageKey: storageKey, imageMimeType: file.mimetype,
      imageSha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
      imageConsentGranted: true, imageConsentAt: now, screenedAt: now, demonstration: false,
      notes: 'No AI prediction was generated. Awaiting clinician assessment.'
    });
    await Consent.create({ patient: patient._id, grantedBy: user._id, purpose: 'oral-screening-image-and-questionnaire', granted: true, grantedAt: now });
    await AuditLog.create({ actor: user._id, action: 'patient.screening_submitted', resourceType: 'OralScreening', resourceId: screening._id, metadata: { oralRegion, reviewingDoctor: reviewingDoctor || null } });
    if (reviewingDoctor) {
      const { notifyUsers } = require('./notificationService');
      await notifyUsers([reviewingDoctor], {
        patient: patient._id, title: 'Patient screening submitted',
        message: 'A patient submitted a screening for clinician review.',
        type: 'screening-review', metadata: { screeningId: String(screening._id) }
      });
    }
    const safe = screening.toObject();
    for (const field of ['imageStorageKey', 'imageMimeType', 'imageSha256', 'imageConsentGranted', 'imageConsentAt']) delete safe[field];
    return safe;
  } catch (error) {
    if (screening) await OralScreening.deleteOne({ _id: screening._id });
    await fileStorage.remove(storageKey).catch(() => {});
    throw error;
  }
}
function parseVisionResult(text) {
  let result;
  try { result = JSON.parse(String(text || '').trim()); }
  catch { throw new ApiError(502, 'The image screening model returned an invalid response. Please retry.'); }
  const allowedFields = new Set(['category', 'finding', 'possibleCauses', 'explanation']);
  const possibleCauses = result?.possibleCauses ?? [];
  if (!result || typeof result !== 'object' || Array.isArray(result) ||
      Object.keys(result).some(field => !allowedFields.has(field)) ||
      !categories.includes(result.category) ||
      !Array.isArray(possibleCauses) || possibleCauses.length > 3 ||
      possibleCauses.some(value => typeof value !== 'string' || !value.trim() || value.length > 180) ||
      ['finding', 'explanation'].some(field => typeof result[field] !== 'string' || !result[field].trim() || result[field].length > ({ finding: 500, explanation: 1500 })[field])) {
    throw new ApiError(502, 'The image screening model returned an invalid response. Please retry.');
  }
  if (['insufficient-quality', 'no-visible-abnormality'].includes(result.category) && possibleCauses.length) {
    throw new ApiError(502, 'The image screening model returned inconsistent possible causes. Please retry.');
  }
  const nextSteps = result.category === 'insufficient-quality'
    ? 'Retake a clear, well-lit image. If you have symptoms or concerns, arrange a professional examination.'
    : result.category === 'no-visible-abnormality'
      ? 'This image cannot rule out a health condition. Seek a professional examination for persistent or concerning changes.'
      : 'Arrange an examination with a qualified dental or medical professional, especially if the change persists or worsens.';
  return {
    category: result.category,
    finding: result.finding.trim(),
    possibleCauses: possibleCauses.map(value => value.trim()),
    explanation: result.explanation.trim(),
    nextSteps
  };
}
function validatePatientImageSubmission(file, body, user) {
  if (user.role !== 'patient') throw new ApiError(403, 'Patient screening access required');
  if (body?.consentGranted !== 'true') throw new ApiError(400, 'Consent is required before processing or storing a screening image');
  if (!file) throw new ApiError(400, 'Choose an oral image');
  if (!Number.isFinite(file.size) || file.size > maxBytes || file.buffer?.length > maxBytes) {
    throw new ApiError(413, 'Image exceeds the 8 MB limit. Choose a smaller image.');
  }
  const imageTypes = { 'image/jpeg': '.jpg', 'image/png': '.png' };
  if (!imageTypes[file.mimetype] || !hasValidSignature(file.buffer, file.mimetype)) {
    throw new ApiError(415, 'Upload a valid JPG, JPEG, or PNG image');
  }
}
function validateReviewInput(body) {
  const category = body?.category;
  const decision = body?.decision;
  if (!categories.includes(category)) throw new ApiError(400, 'Choose a valid doctor assessment category');
  if (!['approved', 'edited', 'rejected', 'needs-further-examination'].includes(decision)) {
    throw new ApiError(400, 'Choose Approved, Rejected, or Needs further examination');
  }
  const textField = (field, legacyField, maxLength) => {
    const value = body?.[field] ?? (legacyField ? body?.[legacyField] : undefined) ?? '';
    if (typeof value !== 'string') throw new ApiError(400, `${field} must be text`);
    const trimmed = value.trim();
    if (trimmed.length > maxLength) throw new ApiError(400, `${field} must be ${maxLength} characters or fewer`);
    return trimmed;
  };
  const diagnosisNotes = textField('diagnosisNotes', 'notes', 3000);
  const treatmentRecommendations = textField('treatmentRecommendations', null, 3000);
  const notes = textField('notes', null, 2000);
  const referralInput = body?.referral;
  let referralHospital;
  let referralReason = '';
  if (referralInput !== undefined && referralInput !== null) {
    if (!referralInput || typeof referralInput !== 'object' || Array.isArray(referralInput)) {
      throw new ApiError(400, 'Referral details must include a facility and reason');
    }
    if (!mongoose.isValidObjectId(referralInput.hospital)) throw new ApiError(400, 'Choose an active referral facility');
    referralHospital = referralInput.hospital;
    if (typeof referralInput.reason !== 'string') throw new ApiError(400, 'Enter a referral reason');
    referralReason = referralInput.reason.trim();
    if (!referralReason || referralReason.length > 1500) throw new ApiError(400, 'Enter a referral reason up to 1,500 characters');
  }
  return { category, decision, diagnosisNotes, treatmentRecommendations, notes, referralHospital, referralReason };
}
async function analyzePatientImage(file, language = 'en') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiError(503, 'Image screening is not configured. Set GEMINI_API_KEY on the backend.');
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const model = process.env.GEMINI_ASSISTANT_MODEL || 'gemini-3.8-flash';
    const responseLanguage = { en: 'English', te: 'Telugu', hi: 'Hindi' }[language] || 'English';
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: file.mimetype, data: file.buffer.toString('base64') } },
          { text: `You are an oral-health image screening aid, not a clinician. Inspect only visible features in this image. Do not diagnose cancer, infection, or any disease; do not infer symptoms or patient history. Select exactly one category: possible-ulcer, possible-thrush, possible-gingivitis, possible-infection, possible-white-patch, possible-red-lesion, other-abnormality, insufficient-quality, no-visible-abnormality. Use insufficient-quality if the mouth/oral tissue is not clearly visible, the image is blurred, dark, obstructed, or not an oral image. Otherwise use a possible-* category only for a clearly visible feature that merits professional examination; use other-abnormality for another clearly visible concern; use no-visible-abnormality only when adequate oral tissue is visible and no obvious abnormality can be seen. Return a JSON object with exactly four fields: category (one allowed value), finding (a short description of visible appearance, never a diagnosis), possibleCauses (an array of up to three short, cautious, general possibilities that can resemble the visible appearance; do not say any cause is present, do not list cancer, and use an empty array for insufficient-quality or no-visible-abnormality), and explanation (what can and cannot be inferred from this image, including that an image alone cannot identify the cause). If the image clearly shows a persistent-looking white or red patch, state that several causes are possible and an in-person clinician or dentist should assess it; do not claim a particular disease. Write all text in ${responseLanguage}. Never return a confidence score, diagnosis, or treatment advice.` }
        ]
      }],
      config: { responseMimeType: 'application/json', temperature: 0 }
    });
    return { ...parseVisionResult(response.text), model, adapter: 'gemini-vision' };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('Gemini oral image screening failed:', error.name || 'ProviderError');
    const { providerError } = require('./geminiLiveService');
    throw providerError(error, 'image screening');
  }
}
async function analyzePatientScreening(file, body, user) {
  validatePatientImageSubmission(file, body, user);
  const patient = await Patient.findOne({ user: user._id });
  if (!patient) throw new ApiError(404, 'No patient record is linked to this account');
  const oralRegion = body.oralRegion || undefined;
  if (oralRegion && !['tongue', 'inner-cheek', 'gums', 'lips', 'floor-of-mouth', 'roof-of-mouth', 'other'].includes(oralRegion)) {
    throw new ApiError(400, 'Choose a valid oral region');
  }
  const selectedDoctor = body.reviewingDoctor || patient.assignedDoctor;
  if (patient.assignedDoctor && selectedDoctor && String(selectedDoctor) !== String(patient.assignedDoctor)) {
    throw new ApiError(403, 'Choose your assigned clinician for follow-up review');
  }
  let reviewingDoctor;
  if (selectedDoctor) {
    if (!mongoose.isValidObjectId(selectedDoctor)) throw new ApiError(400, 'Choose a valid verified doctor');
    const doctor = await User.findOne({
      _id: selectedDoctor, role: 'doctor', isActive: true, approvalStatus: 'approved',
      'doctorProfile.profileVerifiedAt': { $exists: true }
    }).select('_id hospital').lean();
    if (!doctor) throw new ApiError(400, 'Choose an active, verified doctor');
    if (body.hospitalId && String(doctor.hospital || '') !== String(body.hospitalId)) {
      throw new ApiError(400, 'The selected doctor does not work at the selected hospital');
    }
    reviewingDoctor = doctor._id;
  }

  const analysisLanguage = ['en', 'te', 'hi'].includes(body.language) ? body.language : 'en';
  const result = await analyzePatientImage(file, analysisLanguage);
  const storageKey = `${crypto.randomUUID()}.enc`;
  await fileStorage.put(storageKey, encrypted(file.buffer));
  let screening;
  try {
    const now = new Date();
    const suspicious = !['no-visible-abnormality', 'insufficient-quality'].includes(result.category);
    const status = suspicious ? 'Needs review' : 'Awaiting clinician review';
    screening = await OralScreening.create({
      patient: patient._id,
      screenedBy: user._id,
      reviewingDoctor,
      oralRegion,
      category: result.category,
      aiResult: {
        category: result.category,
        adapter: result.adapter,
        model: result.model,
        finding: result.finding,
        explanation: result.explanation,
        nextSteps: result.nextSteps,
        demonstration: false,
        suspicious,
        evaluatedAt: now
      },
      status,
      imageStorageKey: storageKey,
      imageMimeType: file.mimetype,
      imageSha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
      imageConsentGranted: true,
      imageConsentAt: now,
      screenedAt: now,
      demonstration: false,
      notes: 'AI-assisted visual screening only. Not a diagnosis; clinician assessment may be needed.'
    });
    await Consent.create({ patient: patient._id, grantedBy: user._id, purpose: 'oral-screening-image-and-ai-analysis', granted: true, grantedAt: now });
    await AuditLog.create({ actor: user._id, action: 'patient.screening_ai_analyzed', resourceType: 'OralScreening', resourceId: screening._id, metadata: { model: result.model, category: result.category } });
    if (reviewingDoctor) {
      await notifications.notifyUsers([reviewingDoctor], {
        patient: patient._id, title: 'Patient screening submitted',
        message: 'A patient submitted an AI-assisted screening for clinician review.',
        type: 'screening-review', metadata: { screeningId: String(screening._id) }
      });
    }
    const safe = screening.toObject();
    for (const field of ['imageStorageKey', 'imageMimeType', 'imageSha256', 'imageConsentGranted', 'imageConsentAt']) delete safe[field];
    return safe;
  } catch (error) {
    if (screening) await OralScreening.deleteOne({ _id: screening._id });
    await fileStorage.remove(storageKey).catch(() => {});
    throw error;
  }
}
function queryDate(value, label) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${label} must be a date in YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `${label} must be a valid calendar date`);
  }
  return date;
}
async function queue(user, query = {}) {
  if (user.role !== 'doctor') throw new ApiError(403, 'Doctor review access required');
  const patientIds = await doctorPatientIds(user._id);
  if (!patientIds.length) return { items: [], hospitals: [] };
  const filter = { patient: { $in: patientIds }, demonstration: { $ne: true } };
  const search = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  if (query.q !== undefined && typeof query.q !== 'string') throw new ApiError(400, 'Patient search must be text');
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchedPatients = await Patient.find({
      _id: { $in: patientIds },
      $or: [{ patientId: new RegExp(escaped, 'i') }, { name: new RegExp(escaped, 'i') }]
    }).distinct('_id');
    filter.patient = { $in: matchedPatients };
  }
  const from = queryDate(query.from, 'Start date');
  const to = queryDate(query.to, 'End date');
  if (from && to && from > to) throw new ApiError(400, 'Start date must be on or before end date');
  if (from || to) {
    filter.screenedAt = {};
    if (from) filter.screenedAt.$gte = from;
    if (to) {
      const exclusiveEnd = new Date(to);
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
      filter.screenedAt.$lt = exclusiveEnd;
    }
  }
  const reviewStatus = query.reviewStatus || 'pending';
  const statusFilters = {
    pending: { $and: [
      { $or: [{ 'doctorAssessment.reviewedAt': { $exists: false } }, { 'doctorAssessment.decision': 'needs-further-examination' }] },
      { $or: [{ status: { $in: ['Awaiting clinician review', 'Needs review'] } }, { 'aiResult.suspicious': true }, { 'doctorAssessment.decision': 'needs-further-examination' }] }
    ] },
    approved: { 'doctorAssessment.decision': { $in: ['approved', 'edited'] } },
    rejected: { 'doctorAssessment.decision': 'rejected' },
    'needs-further-examination': { 'doctorAssessment.decision': 'needs-further-examination' },
    referred: { status: 'Referred' },
    all: {}
  };
  if (typeof reviewStatus !== 'string' || !Object.prototype.hasOwnProperty.call(statusFilters, reviewStatus)) {
    throw new ApiError(400, 'Review status must be pending, approved, rejected, needs-further-examination, referred, or all');
  }
  Object.assign(filter, statusFilters[reviewStatus]);
  const [items, hospitals] = await Promise.all([
    OralScreening.find(filter).sort({ screenedAt: -1 }).limit(100)
      .populate('patient', 'patientId name phone gender dateOfBirth age village district')
      .populate('screenedBy', 'name role')
      .populate('reviewingDoctor', 'name')
      .populate('doctorAssessment.reviewedBy', 'name')
      .populate('doctorAssessment.referral', 'hospital reason status')
      .populate('doctorAssessment.referralHospital', 'name village district')
      .populate('reviews.reviewedBy', 'name')
      .populate('reviews.referral', 'hospital reason status')
      .populate('reviews.referralHospital', 'name village district')
      .lean(),
    Hospital.find({ isActive: true }).sort({ name: 1 }).select('name village district facilityType').lean()
  ]);
  return { items, hospitals };
}
async function review(id, body, user) {
  if (user.role !== 'doctor') throw new ApiError(403, 'Doctor review access required');
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid screening ID');
  const { category, decision, diagnosisNotes, treatmentRecommendations, notes, referralHospital, referralReason } = validateReviewInput(body);
  const screening = await OralScreening.findById(id);
  if (!screening) throw new ApiError(404, 'Screening record not found');
  if (user.role === 'doctor') {
    const related = await canDoctorAccess(screening.patient, user._id);
    if (!related) throw new ApiError(403, 'A patient appointment or referral is required to review this screening');
  }
  let referral;
  if (referralHospital) {
    const hospital = await Hospital.findOne({ _id: referralHospital, isActive: true }).select('_id').lean();
    if (!hospital) throw new ApiError(400, 'Choose an active referral facility');
    referral = await Referral.create({
      patient: screening.patient, screening: screening._id, fromProvider: user._id,
      hospital: hospital._id, reason: referralReason, status: 'Needs review'
    });
  }
  const reviewedAt = new Date();
  const reviewEntry = {
    category, decision, diagnosisNotes, treatmentRecommendations, notes,
    referral: referral?._id, referralHospital, referralReason: referralReason || undefined,
    reviewedBy: user._id, reviewedAt
  };
  screening.reviews.push(reviewEntry);
  screening.doctorAssessment = {
    category, notes: notes || diagnosisNotes, diagnosisNotes, treatmentRecommendations,
    decision, referral: referral?._id, referralHospital, reviewedBy: user._id, reviewedAt
  };
  screening.status = referral ? 'Referred'
    : decision === 'needs-further-examination' ? 'Needs further examination' : 'Reviewed';
  try {
    await screening.save();
  } catch (error) {
    if (referral) await Referral.deleteOne({ _id: referral._id });
    throw error;
  }
  const patientStatus = referral ? 'Referred'
    : decision === 'needs-further-examination' ? 'Follow-up'
      : decision === 'rejected' ? 'Needs review' : 'Reviewed';
  const patientUpdate = { status: patientStatus };
  if (referral) {
    patientUpdate.referralHospital = referral.hospital;
    patientUpdate.referralStatus = referral.status;
    patientUpdate.referralUpdatedAt = referral.referredAt;
  }
  await Patient.updateOne({ _id: screening.patient }, { $set: patientUpdate });
  await AuditLog.create({
    actor: user._id, action: 'screening.doctor_reviewed', resourceType: 'OralScreening',
    resourceId: screening._id, metadata: { decision, referralId: referral ? String(referral._id) : null }
  });
  await notifications.notifyPatient(screening.patient, {
    title: 'Screening review updated', message: 'A doctor has completed a review of your oral screening.',
    type: 'review', metadata: { screeningId: String(screening._id), decision }
  });
  if (referral) {
    const facilityUsers = await User.find({ role: 'hospital', hospital: referral.hospital, isActive: true }).distinct('_id');
    await notifications.notifyUsers(facilityUsers, {
      patient: screening.patient, title: 'New clinical referral',
      message: 'A clinician submitted a referral for facility review.',
      type: 'referral', metadata: { referralId: String(referral._id), screeningId: String(screening._id) }
    });
  }
  return screening.toObject();
}
async function getImage(id, user) {
  if (!['patient', 'asha', 'doctor'].includes(user.role)) throw new ApiError(403, 'Screening image access denied');
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid screening ID');
  const screening = await OralScreening.findById(id).select('+imageStorageKey +imageMimeType');
  if (!screening?.imageStorageKey) throw new ApiError(404, 'Screening image not found');
  const patient = await Patient.findById(screening.patient).select('user assignedWorker assignedDoctor');
  if (user.role === 'patient' && String(patient?.user || '') !== String(user._id)) throw new ApiError(403, 'You can only view your own screening image');
  if (user.role === 'asha' && String(patient?.assignedWorker || '') !== String(user._id)) throw new ApiError(403, 'This screening is outside your assigned community');
  if (user.role === 'doctor') {
    const related = await canDoctorAccess(patient, user._id);
    if (!related) throw new ApiError(403, 'A patient appointment or referral is required to view this image');
  }
  const bytes = await fileStorage.get(screening.imageStorageKey);
  return { bytes: decrypted(bytes), mimeType: screening.imageMimeType };
}
module.exports = { upload, uploadPatientScreening, analyzePatientScreening, analyzePatientImage, parseVisionResult, validatePatientImageSubmission, validateReviewInput, queue, review, getImage, syncOfflineMetadata, maxBytes, categories,
  capabilities: () => ({
    imageAnalysisAvailable: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_ASSISTANT_MODEL || 'gemini-3.8-flash',
    reason: process.env.GEMINI_API_KEY ? null : 'Set GEMINI_API_KEY in the backend environment.'
  }) };
