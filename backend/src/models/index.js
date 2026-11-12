const mongoose = require('mongoose');
const { Schema } = mongoose;
const roles = ['patient', 'asha', 'doctor', 'specialist', 'hospital', 'district', 'admin'];
const baseOptions = { timestamps: true, strict: 'throw', toJSON: { virtuals: true }, toObject: { virtuals: true } };

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 30 },
  staffId: { type: String, trim: true, uppercase: true, maxlength: 40 },
  passwordHash: { type: String, select: false },
  passwordResetHash: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  authVersion: { type: Number, default: 0 },
  role: { type: String, enum: roles, required: true, index: true },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  mustChangePassword: { type: Boolean, default: false },
  createdByHospital: { type: Boolean, default: false },
  doctorProfile: {
    qualifications: { type: [String], default: [], validate: values => values.length <= 12 },
    registrationNumber: { type: String, trim: true, maxlength: 80 },
    department: { type: String, trim: true, maxlength: 120 },
    specialization: { type: String, trim: true, maxlength: 120 },
    yearsExperience: { type: Number, min: 0, max: 80 },
    expertise: { type: [String], default: [], validate: values => values.length <= 20 },
    consultationFee: { type: Number, min: 0, max: 1000000 },
    biography: { type: String, trim: true, maxlength: 2000 },
    profileVerifiedAt: Date
  },
  hospital: { type: Schema.Types.ObjectId, ref: 'Hospital' },
  district: { type: String, trim: true, maxlength: 120 },
  language: { type: String, enum: ['en', 'te', 'hi', 'ta', 'kn'], default: 'en' },
  isActive: { type: Boolean, default: true }
}, baseOptions);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ staffId: 1 }, { unique: true, partialFilterExpression: { staffId: { $type: 'string' } } });
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { role: 'patient', phone: { $type: 'string' } } });
userSchema.index({ role: 1, approvalStatus: 1, isActive: 1 });

const healthcareWorkerSchema = new Schema({
  staffId: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  name: { type: String, required: true, trim: true, maxlength: 120, index: true },
  role: { type: String, required: true, enum: ['asha', 'anm', 'cho', 'doctor', 'specialist', 'district'], index: true },
  phone: { type: String, required: true, trim: true, maxlength: 20 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  designation: { type: String, required: true, trim: true, maxlength: 120 },
  facility: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
  mandal: { type: String, required: true, trim: true, maxlength: 120, index: true },
  village: { type: String, required: true, trim: true, maxlength: 120, index: true },
  district: { type: String, required: true, trim: true, maxlength: 120, index: true },
  employmentStatus: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  joinedAt: { type: Date, required: true },
  photoUrl: { type: String, trim: true, maxlength: 2048, validate: value => !value || /^https:\/\//i.test(value) }
}, baseOptions);
healthcareWorkerSchema.index({ staffId: 1 }, { unique: true });
healthcareWorkerSchema.index({ district: 1, employmentStatus: 1, role: 1 });
healthcareWorkerSchema.index({ name: 'text', staffId: 'text', designation: 'text', mandal: 'text', village: 'text' });

const offlineScreeningMetadataSchema = new Schema({
  clientRequestId: { type: String, required: true, maxlength: 80 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  consentGranted: { type: Boolean, required: true, validate: value => value === true },
  capturedAt: { type: Date, required: true },
  symptoms: [{ type: String, trim: true, maxlength: 120 }],
  requestHash: { type: String, required: true, select: false },
  status: { type: String, enum: ['pending-clinical-assessment'], default: 'pending-clinical-assessment', index: true }
}, baseOptions);
offlineScreeningMetadataSchema.index({ createdBy: 1, clientRequestId: 1 }, { unique: true });

const questionnaireSchema = new Schema({
  version: { type: String, required: true, maxlength: 40 },
  language: { type: String, enum: ['en', 'te', 'hi'], required: true },
  ageRange: { type: String, enum: ['under-18', '18-29', '30-44', '45-59', '60-plus', 'prefer-not-to-say'] },
  gender: { type: String, enum: ['female', 'male', 'other', 'prefer-not-to-say'] },
  previousOralProblems: { type: String, maxlength: 1000 },
  tobaccoUse: { type: String, enum: ['yes', 'no', 'unknown'] },
  tobaccoTypes: { type: [String], enum: ['cigarettes', 'cigars', 'chewing-tobacco', 'gutka', 'khaini', 'pan-masala', 'other'], default: [], validate: values => values.length <= 7 },
  alcoholUse: { type: String, enum: ['yes', 'no', 'occasionally', 'unknown'] },
  arecaNutUse: { type: String, enum: ['yes', 'no', 'unknown'] },
  habitDuration: { type: String, enum: ['less-than-year', '1-5-years', 'over-5-years', 'unknown'] },
  symptoms: {
    type: [String],
    enum: ['white-patch', 'red-patch', 'non-healing-ulcer', 'lump-or-thickening', 'difficulty-opening-mouth', 'difficulty-swallowing', 'pain-chewing', 'bleeding', 'persistent-pain-or-numbness', 'voice-change-or-neck-lump'],
    default: [],
    validate: values => values.length <= 10
  },
  symptomDuration: { type: String, enum: ['less-than-week', '1-2-weeks', '2-4-weeks', '1-3-months', 'over-3-months', 'unknown'] },
  otherSymptoms: { type: String, maxlength: 1000 },
  location: { type: String, maxlength: 120 }
}, { _id: false, strict: 'throw' });
const oralRegionValues = ['tongue', 'inner-cheek', 'gums', 'lips', 'floor-of-mouth', 'roof-of-mouth', 'other'];

const patientSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' }, patientId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120, index: true }, email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true, maxlength: 30 }, address: { type: String, trim: true, maxlength: 500 }, age: { type: Number, min: 0, max: 120 },
  aadhaarEncrypted: { type: String, select: false, maxlength: 300 },
  village: { type: String, required: true, trim: true, maxlength: 120, index: true },
  district: { type: String, trim: true, maxlength: 120, index: true }, mandal: { type: String, trim: true, maxlength: 120, index: true }, primaryHospital: { type: Schema.Types.ObjectId, ref: 'Hospital', index: true }, dateOfBirth: Date,
  gender: { type: String, enum: ['female', 'male', 'other', 'prefer-not-to-say'], default: 'prefer-not-to-say' },
  status: { type: String, enum: ['Needs review', 'Follow-up', 'Reviewed', 'Referred', 'Screened'], default: 'Screened', index: true },
  referralHospital: { type: Schema.Types.ObjectId, ref: 'Hospital' },
  referralStatus: { type: String, enum: ['Needs review', 'In progress', 'Completed', 'Cancelled'] },
  referralUpdatedAt: Date,
  profilePhotoStorageKey: { type: String, select: false, match: /^[a-f0-9-]{36}\.enc$/i },
  profilePhotoMimeType: { type: String, select: false, enum: ['image/jpeg', 'image/png', 'image/webp'] },
  clientRequestId: { type: String, select: false, maxlength: 80 },
  clientRequestActor: { type: Schema.Types.ObjectId, ref: 'User', select: false },
  clientRequestHash: { type: String, select: false },
  assignedWorker: { type: Schema.Types.ObjectId, ref: 'User' }, assignedDoctor: { type: Schema.Types.ObjectId, ref: 'User', index: true }, consentGiven: { type: Boolean, default: false }
}, baseOptions);
patientSchema.index({ name: 'text', patientId: 'text', village: 'text', district: 'text' });
patientSchema.index({ clientRequestActor: 1, clientRequestId: 1 }, { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } });

const patientQRSchema = new Schema({ patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true }, tokenHash: { type: String, required: true, unique: true }, expiresAt: Date, revokedAt: Date }, baseOptions);
const screeningCategories = ['possible-ulcer', 'possible-thrush', 'possible-gingivitis', 'possible-infection', 'possible-white-patch', 'possible-red-lesion', 'other-abnormality', 'insufficient-quality', 'no-visible-abnormality'];
const aiResultSchema = new Schema({
  category: { type: String, enum: screeningCategories, required: true },
  confidence: { type: Number, min: 0, max: 1 },
  adapter: { type: String, required: true },
  model: { type: String, trim: true, maxlength: 120 },
  finding: { type: String, trim: true, maxlength: 500 },
  possibleCauses: { type: [String], default: [], validate: values => values.length <= 3 },
  explanation: { type: String, trim: true, maxlength: 1500 },
  nextSteps: { type: String, trim: true, maxlength: 1000 },
  demonstration: { type: Boolean, default: false },
  suspicious: { type: Boolean, default: true },
  quality: { brightness: Number, sharpness: Number },
  evaluatedAt: { type: Date, default: Date.now }
}, { _id: false });
const clinicalScreeningDecisionValues = ['approved', 'rejected', 'needs-further-examination', 'edited'];
const clinicalScreeningReviewSchema = new Schema({
  decision: { type: String, enum: clinicalScreeningDecisionValues, required: true },
  category: { type: String, enum: screeningCategories, required: true },
  diagnosisNotes: { type: String, trim: true, maxlength: 3000, default: '' },
  treatmentRecommendations: { type: String, trim: true, maxlength: 3000, default: '' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  referral: { type: Schema.Types.ObjectId, ref: 'Referral' },
  referralHospital: { type: Schema.Types.ObjectId, ref: 'Hospital' },
  referralReason: { type: String, trim: true, maxlength: 1500 },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedAt: { type: Date, default: Date.now }
}, { _id: true });
const doctorAssessmentSchema = new Schema({
  category: { type: String, enum: screeningCategories, required: true },
  notes: { type: String, maxlength: 2000, default: '' },
  diagnosisNotes: { type: String, trim: true, maxlength: 3000, default: '' },
  treatmentRecommendations: { type: String, trim: true, maxlength: 3000, default: '' },
  decision: { type: String, enum: clinicalScreeningDecisionValues, required: true },
  referral: { type: Schema.Types.ObjectId, ref: 'Referral' },
  referralHospital: { type: Schema.Types.ObjectId, ref: 'Hospital' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedAt: { type: Date, default: Date.now }
}, { _id: false });
const oralScreeningSchema = new Schema({ patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true }, screenedBy: { type: Schema.Types.ObjectId, ref: 'User' }, reviewingDoctor: { type: Schema.Types.ObjectId, ref: 'User', index: true }, oralRegion: { type: String, enum: oralRegionValues }, questionnaire: { type: questionnaireSchema }, category: { type: String, enum: [...screeningCategories, 'pending-clinical-assessment'] }, aiResult: { type: aiResultSchema }, doctorAssessment: { type: doctorAssessmentSchema, default: null }, reviews: { type: [clinicalScreeningReviewSchema], default: [] }, imageStorageKey: { type: String, select: false }, imageMimeType: { type: String, select: false }, imageSha256: { type: String, select: false }, imageConsentGranted: { type: Boolean, default: false, select: false }, imageConsentAt: { type: Date, select: false }, status: { type: String, enum: ['Awaiting clinician review', 'Analyzed', 'Needs review', 'Needs further examination', 'Reviewed', 'Referred'], default: 'Needs review', index: true }, notes: { type: String, maxlength: 2000 }, screenedAt: { type: Date, default: Date.now, index: true }, demonstration: { type: Boolean, default: false } }, baseOptions);
oralScreeningSchema.index({ 'aiResult.suspicious': 1, 'doctorAssessment.reviewedAt': 1, screenedAt: -1 });
const transcriptReviewSchema = new Schema({ status: { type: String, enum: ['pending', 'reviewed'], default: 'pending' }, notes: { type: String, maxlength: 2000, default: '' }, reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }, reviewedAt: Date }, { _id: false });
const voiceTranscriptSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  source: { type: String, enum: ['voice', 'manual'], required: true },
  originalLanguage: { type: String, enum: ['en-IN', 'te-IN', 'hi-IN', 'ta-IN', 'kn-IN'], required: true },
  detectedLanguage: { type: String, enum: ['en-IN', 'te-IN', 'hi-IN', 'ta-IN', 'kn-IN'], required: true },
  detectionConfidence: { type: Number, min: 0, max: 1 },
  speechConfidence: { type: Number, min: 0, max: 1 },
  originalTranscript: { type: String, required: true, maxlength: 10000 },
  englishTranslation: { type: String, default: '', maxlength: 10000 },
  translationBack: { type: String, default: '', maxlength: 10000 },
  reportedSymptoms: [{ type: String, maxlength: 120 }],
  review: { type: transcriptReviewSchema, default: () => ({ status: 'pending' }) },
  transcriptNotice: { type: String, default: 'Reported symptoms only. Not a diagnosis.' }
}, baseOptions);
voiceTranscriptSchema.index({ patient: 1, createdAt: -1 });
voiceTranscriptSchema.index({ 'review.status': 1, createdAt: -1 });
// Conversation text is stored only for authenticated assistant users. No audio
// or video payload is modeled or accepted by these strict schemas.
const voiceConversationSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  patient: { type: Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
  doctor: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  language: { type: String, enum: ['auto', 'en', 'te', 'hi'], default: 'auto' },
  title: { type: String, trim: true, maxlength: 120, default: 'Voice assistant conversation' },
  lastMessageAt: { type: Date, default: Date.now, index: true }
}, baseOptions);
voiceConversationSchema.index({ owner: 1, lastMessageAt: -1 });
const voiceMessageSchema = new Schema({
  conversation: { type: Schema.Types.ObjectId, ref: 'VoiceConversation', required: true, index: true },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  language: { type: String, enum: ['en', 'te', 'hi'], required: true },
  text: { type: String, required: true, trim: true, maxlength: 10000 }
}, baseOptions);
voiceMessageSchema.index({ conversation: 1, createdAt: 1 });
voiceMessageSchema.index({ owner: 1, createdAt: -1 });
const medicalRecordSchema = new Schema({ patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true }, author: { type: Schema.Types.ObjectId, ref: 'User' }, recordType: { type: String, enum: ['history', 'assessment', 'treatment', 'follow-up', 'note'], default: 'history' }, title: { type: String, required: true, trim: true, maxlength: 160 }, notes: { type: String, required: true, maxlength: 5000 }, recordedAt: { type: Date, default: Date.now } }, baseOptions);
const prescriptionSchema = new Schema({ patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true }, prescribedBy: { type: Schema.Types.ObjectId, ref: 'User' }, appointment: { type: Schema.Types.ObjectId, ref: 'Appointment' }, medication: { type: String, required: true, trim: true, maxlength: 160 }, instructions: { type: String, required: true, maxlength: 1000 }, status: { type: String, enum: ['Active', 'Stopped', 'Completed'], default: 'Active', index: true }, startDate: Date, endDate: Date }, baseOptions);
prescriptionSchema.index({ appointment: 1 }, { sparse: true });
const clinicalDocumentSchema = new Schema({ patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true }, uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, documentType: { type: String, enum: ['lab-report', 'imaging', 'other'], default: 'lab-report', index: true }, title: { type: String, required: true, trim: true, maxlength: 160 }, storageKey: { type: String, required: true, select: false }, mimeType: { type: String, required: true }, sha256: { type: String, required: true, select: false }, byteLength: { type: Number, required: true, max: 10 * 1024 * 1024 }, recordedAt: { type: Date, default: Date.now, index: true } }, baseOptions);
clinicalDocumentSchema.index({ patient: 1, recordedAt: -1 });
const professionalDocumentSchema = new Schema({
  doctor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  documentType: { type: String, enum: ['qualification', 'medical-registration', 'experience', 'other'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  storageKey: { type: String, required: true, select: false },
  mimeType: { type: String, required: true },
  sha256: { type: String, required: true, select: false },
  byteLength: { type: Number, required: true, max: 10 * 1024 * 1024 },
  verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending', index: true },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date
}, baseOptions);
professionalDocumentSchema.index({ doctor: 1, createdAt: -1 });
const appointmentSchema = new Schema({ patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true }, provider: { type: Schema.Types.ObjectId, ref: 'User' }, hospital: { type: Schema.Types.ObjectId, ref: 'Hospital' }, availability: { type: Schema.Types.ObjectId, ref: 'DoctorAvailability' }, scheduledAt: { type: Date, required: true, index: true }, type: { type: String, default: 'Consultation', maxlength: 100 }, visitMode: { type: String, enum: ['Clinic', 'Video'], default: 'Clinic' }, status: { type: String, enum: ['Confirmed', 'Upcoming', 'Completed', 'Cancelled', 'Declined'], default: 'Upcoming', index: true }, consultationReason: { type: String, trim: true, maxlength: 1000 }, symptoms: { type: String, trim: true, maxlength: 1500 }, consultationConsentAt: Date, notes: { type: String, maxlength: 1500 }, rescheduledFrom: Date }, baseOptions);
appointmentSchema.index({ provider: 1, scheduledAt: 1, status: 1 });
appointmentSchema.index({ patient: 1, scheduledAt: 1, status: 1 });
const availabilitySchema = new Schema({ doctor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, startsAt: { type: Date, required: true, index: true }, endsAt: { type: Date, required: true }, slotMinutes: { type: Number, default: 30, min: 15, max: 120 }, status: { type: String, enum: ['Open', 'Booked', 'Cancelled'], default: 'Open', index: true }, appointment: { type: Schema.Types.ObjectId, ref: 'Appointment' } }, baseOptions);
availabilitySchema.index({ doctor: 1, startsAt: 1 }, { unique: true });
const chatMessageSchema = new Schema({ sender: { type: Schema.Types.ObjectId, ref: 'User', required: true }, senderName: { type: String, required: true, maxlength: 120 }, language: { type: String, enum: ['en', 'te', 'hi'], required: true }, text: { type: String, required: true, maxlength: 1000 }, sentAt: { type: Date, default: Date.now } }, { _id: true });
const consultationSchema = new Schema({ appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true, index: true }, patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true }, provider: { type: Schema.Types.ObjectId, ref: 'User' }, roomId: { type: String, select: false }, status: { type: String, enum: ['Scheduled', 'In progress', 'Completed', 'Cancelled', 'Declined'], default: 'Scheduled' }, patientConsentAt: Date, doctorConsentAt: Date, notes: { type: String, maxlength: 5000 }, chatMessages: { type: [chatMessageSchema], default: [] }, startedAt: Date, endedAt: Date }, baseOptions);
const hospitalSchema = new Schema({ hospitalId: { type: String, trim: true, uppercase: true, maxlength: 40, unique: true, sparse: true }, registrationNumber: { type: String, trim: true, maxlength: 100 }, name: { type: String, required: true, trim: true, maxlength: 180 }, facilityType: { type: String, default: 'Hospital', maxlength: 100 }, village: { type: String, required: true, trim: true, maxlength: 120 }, mandal: { type: String, trim: true, maxlength: 120, index: true }, district: { type: String, trim: true, maxlength: 120, index: true }, address: { type: String, maxlength: 500 }, phone: { type: String, trim: true, maxlength: 30 }, postalCode: { type: String, trim: true, match: /^\d{6}$/ }, coordinates: { latitude: { type: Number, min: -90, max: 90 }, longitude: { type: Number, min: -180, max: 180 } }, workingHours: { type: String, trim: true, maxlength: 500 }, beds: { type: Number, min: 0, max: 100000 }, directoryKey: { type: String, trim: true, maxlength: 140 }, services: [{ type: String, maxlength: 100 }], isActive: { type: Boolean, default: true, index: true } }, baseOptions);
hospitalSchema.index({ directoryKey: 1 }, { unique: true, sparse: true });
hospitalSchema.index({ district: 1, mandal: 1, name: 1 });
hospitalSchema.index({ name: 'text', village: 'text', district: 'text' });
const referralSchema = new Schema({ patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true }, screening: { type: Schema.Types.ObjectId, ref: 'OralScreening', index: true }, fromProvider: { type: Schema.Types.ObjectId, ref: 'User' }, hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true }, reason: { type: String, required: true, maxlength: 1500 }, status: { type: String, enum: ['Needs review', 'In progress', 'Completed', 'Cancelled'], default: 'Needs review', index: true }, referredAt: { type: Date, default: Date.now } }, baseOptions);
const notificationSchema = new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, patient: { type: Schema.Types.ObjectId, ref: 'Patient' }, title: { type: String, required: true, maxlength: 180 }, message: { type: String, required: true, maxlength: 1000 }, type: { type: String, default: 'update', maxlength: 60, index: true }, dedupeKey: { type: String, select: false }, metadata: { type: Schema.Types.Mixed, default: {} }, readAt: Date }, baseOptions);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
const consentSchema = new Schema({ patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true }, grantedBy: { type: Schema.Types.ObjectId, ref: 'User' }, purpose: { type: String, required: true, maxlength: 180 }, granted: { type: Boolean, required: true }, grantedAt: Date, revokedAt: Date }, baseOptions);
const urgentRequestSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  screening: { type: Schema.Types.ObjectId, ref: 'OralScreening' },
  hospital: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reason: { type: String, required: true, trim: true, maxlength: 1000 },
  requestedMode: { type: String, enum: ['Clinic', 'Video'], required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined', 'redirected'], default: 'pending', index: true },
  responseNote: { type: String, trim: true, maxlength: 1000 },
  respondedAt: Date
}, baseOptions);
urgentRequestSchema.index({ hospital: 1, status: 1, createdAt: -1 });
urgentRequestSchema.index({ patient: 1, createdAt: -1 });
const auditLogSchema = new Schema({ actor: { type: Schema.Types.ObjectId, ref: 'User' }, action: { type: String, required: true, maxlength: 120 }, resourceType: { type: String, required: true, maxlength: 80 }, resourceId: { type: Schema.Types.ObjectId }, metadata: { type: Schema.Types.Mixed, default: {} }, occurredAt: { type: Date, default: Date.now, index: true } }, { ...baseOptions });
const refreshSessionSchema = new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, tokenIdHash: { type: String, required: true, unique: true }, expiresAt: { type: Date, required: true, index: { expires: 0 } }, revokedAt: Date, replacedBy: String }, baseOptions);
const patientOtpSchema = new Schema({
  phone: { type: String, required: true, index: true },
  purpose: { type: String, enum: ['login', 'register'], required: true },
  codeHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  sentAt: { type: Date, required: true },
  attempts: { type: Number, default: 0, min: 0, max: 5 },
  consumedAt: Date,
  registration: {
    name: { type: String, trim: true, maxlength: 120 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    address: { type: String, trim: true, maxlength: 500 },
    village: { type: String, trim: true, maxlength: 120 },
    mandal: { type: String, trim: true, maxlength: 120 },
    district: { type: String, trim: true, maxlength: 120 },
    dateOfBirth: Date,
    age: { type: Number, min: 0, max: 120 },
    aadhaarEncrypted: { type: String, maxlength: 300 },
    language: { type: String, enum: ['en', 'te', 'hi'], default: 'en' }
  }
}, baseOptions);
patientOtpSchema.index({ phone: 1, purpose: 1 }, { unique: true });

const educationFaqSchema = new Schema({ question: { type: String, required: true, maxlength: 300 }, answer: { type: String, required: true, maxlength: 1500 } }, { _id: false });
const educationLanguageSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  summary: { type: String, required: true, maxlength: 500 },
  what: { type: String, required: true, maxlength: 2000 },
  causes: { type: [String], required: true, validate: values => values.length > 0 },
  signs: { type: [String], required: true, validate: values => values.length > 0 },
  precautions: { type: [String], required: true, validate: values => values.length > 0 },
  patientShould: { type: [String], required: true, validate: values => values.length > 0 },
  patientShouldNot: { type: [String], required: true, validate: values => values.length > 0 },
  whenToSeek: { type: String, required: true, maxlength: 1500 },
  emergency: { type: String, required: true, maxlength: 1000 },
  screeningFollowUp: { type: String, required: true, maxlength: 1500 },
  faqs: { type: [educationFaqSchema], required: true, validate: values => values.length > 0 }
}, { _id: false, strict: 'throw' });
const educationArticleSchema = new Schema({
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, maxlength: 100 },
  category: { type: String, required: true, enum: ['awareness', 'ulcers', 'patches', 'infections', 'gum-disease', 'hygiene', 'tobacco', 'warning-signs', 'prevention', 'doctor-visit', 'screening', 'faqs'], index: true },
  keywords: { type: [String], default: [], validate: values => values.length <= 30 },
  content: {
    en: { type: educationLanguageSchema, required: true },
    te: { type: educationLanguageSchema, required: true },
    hi: { type: educationLanguageSchema, required: true }
  },
  imageUrl: { type: String, trim: true, maxlength: 2048, validate: value => !value || /^https:\/\//i.test(value) || /^(?:\/[-A-Za-z0-9_./~%]+\.(?:png|jpe?g|svg|webp|gif|avif))$/i.test(value) },
  imageAttribution: { type: String, trim: true, maxlength: 500 },
  imageAlt: { en: { type: String, maxlength: 300 }, te: { type: String, maxlength: 300 }, hi: { type: String, maxlength: 300 } },
  medicalSources: [{ title: { type: String, required: true, maxlength: 180 }, url: { type: String, required: true, match: /^https:\/\//i, maxlength: 2048 } }],
  status: { type: String, enum: ['draft', 'pending-review', 'published', 'archived'], default: 'draft', index: true },
  reviewStatus: { type: String, enum: ['unreviewed', 'reviewed', 'changes-requested'], default: 'unreviewed', index: true },
  reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewerName: { type: String, trim: true, maxlength: 120 },
  reviewerNotes: { type: String, maxlength: 2000, default: '' },
  reviewedAt: Date,
  publishedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, baseOptions);
educationArticleSchema.index({ status: 1, category: 1, updatedAt: -1 });
educationArticleSchema.index({ 'content.en.title': 'text', 'content.en.summary': 'text', 'content.te.title': 'text', 'content.te.summary': 'text', 'content.hi.title': 'text', 'content.hi.summary': 'text', keywords: 'text' });

const educationVideoSchema = new Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, maxlength: 100 },
  category: { type: String, required: true, enum: ['ulcers', 'oral-cancer-awareness', 'white-patches', 'red-patches', 'oral-hygiene', 'tongue-infections', 'oral-symptoms', 'precautions-prevention', 'when-to-visit-doctor'], index: true },
  title: { en: { type: String, required: true, maxlength: 180 }, te: { type: String, required: true, maxlength: 180 }, hi: { type: String, required: true, maxlength: 180 } },
  description: { en: { type: String, required: true, maxlength: 1200 }, te: { type: String, required: true, maxlength: 1200 }, hi: { type: String, required: true, maxlength: 1200 } },
  durationSeconds: { type: Number, required: true, min: 1, max: 86400 },
  youtubeId: { type: String, required: true, match: /^[A-Za-z0-9_-]{11}$/ },
  sourceTitle: { type: String, required: true, maxlength: 180 },
  sourceUrl: { type: String, required: true, match: /^https:\/\/(?:www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/, maxlength: 2048 },
  attribution: { type: String, required: true, maxlength: 500 },
  licenseNote: { type: String, required: true, maxlength: 500 },
  subtitleLanguages: { type: [String], enum: ['en', 'te', 'hi'], default: [] },
  explanation: { en: { type: String, required: true, maxlength: 1200 }, te: { type: String, required: true, maxlength: 1200 }, hi: { type: String, required: true, maxlength: 1200 } },
  importantSymptoms: { en: { type: [String], required: true, validate: values => values.length <= 8 }, te: { type: [String], required: true, validate: values => values.length <= 8 }, hi: { type: [String], required: true, validate: values => values.length <= 8 } },
  precautions: { en: { type: [String], required: true, validate: values => values.length <= 8 }, te: { type: [String], required: true, validate: values => values.length <= 8 }, hi: { type: [String], required: true, validate: values => values.length <= 8 } },
  relatedTopics: { type: [String], default: [], validate: values => values.length <= 9 },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, baseOptions);
educationVideoSchema.index({ status: 1, category: 1, updatedAt: -1 });
educationVideoSchema.index({ 'title.en': 'text', 'title.te': 'text', 'title.hi': 'text', 'description.en': 'text', 'description.te': 'text', 'description.hi': 'text' });

const videoHistorySchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  video: { type: Schema.Types.ObjectId, ref: 'EducationVideo', required: true },
  lastWatchedAt: { type: Date, default: Date.now },
  watchCount: { type: Number, default: 1, min: 1 }
}, baseOptions);
videoHistorySchema.index({ user: 1, video: 1 }, { unique: true });
videoHistorySchema.index({ user: 1, lastWatchedAt: -1 });

const definitions = { User: userSchema, HealthcareWorker: healthcareWorkerSchema, OfflineScreeningMetadata: offlineScreeningMetadataSchema, Patient: patientSchema, PatientQR: patientQRSchema, OralScreening: oralScreeningSchema, VoiceTranscript: voiceTranscriptSchema, VoiceConversation: voiceConversationSchema, VoiceMessage: voiceMessageSchema, MedicalRecord: medicalRecordSchema, Prescription: prescriptionSchema, ClinicalDocument: clinicalDocumentSchema, ProfessionalDocument: professionalDocumentSchema, Appointment: appointmentSchema, DoctorAvailability: availabilitySchema, Consultation: consultationSchema, Hospital: hospitalSchema, Referral: referralSchema, Notification: notificationSchema, Consent: consentSchema, UrgentRequest: urgentRequestSchema, AuditLog: auditLogSchema, RefreshSession: refreshSessionSchema, PatientOtpChallenge: patientOtpSchema, EducationArticle: educationArticleSchema, EducationVideo: educationVideoSchema, EducationVideoHistory: videoHistorySchema };
module.exports = Object.fromEntries(Object.entries(definitions).map(([name, schema]) => [name, mongoose.models[name] || mongoose.model(name, schema)]));
