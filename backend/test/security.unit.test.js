const test = require('node:test');
const assert = require('node:assert/strict');
const ApiError = require('../src/utils/ApiError');
const { hasValidSignature } = require('../src/utils/fileSignatures');
const { permissions } = require('../src/middleware/authorizeResource');
const security = require('../src/config/security');
const { validatePassword } = require('../src/services/authService');
const clinical = require('../src/services/clinicalService');

test('ApiError carries stable HTTP status and message', () => {
  const error = new ApiError(422, 'Invalid input');
  assert.equal(error.statusCode, 422);
  assert.equal(error.message, 'Invalid input');
});

test('passwords accept only 10–128 lowercase English letters', () => {
  assert.equal(validatePassword('aarogyadrishti'), undefined);
  for (const password of ['short', 'abcdefghijA', 'abcdefghij1', 'abcdefghij!', 'a'.repeat(129)]) {
    assert.throws(() => validatePassword(password), /lowercase English letters/);
  }
});

test('upload signature checks reject MIME spoofing', () => {
  assert.equal(hasValidSignature(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'), true);
  assert.equal(hasValidSignature(Buffer.from('<script>'), 'image/jpeg'), false);
  assert.equal(hasValidSignature(Buffer.from('%PDF-1.7'), 'application/pdf'), true);
  assert.equal(hasValidSignature(Buffer.from('not a pdf'), 'application/pdf'), false);
});

test('high-risk resource permissions enforce clinical and facility boundaries', () => {
  assert.equal(permissions.patients.GET.includes('district'), false);
  assert.equal(permissions.patients.GET.includes('admin'), false);
  assert.equal(permissions.medicalHistory.GET.includes('admin'), false);
  assert.equal(permissions.medicalHistory.POST.includes('admin'), false);
  assert.equal(permissions.screenings.GET.includes('admin'), false);
  assert.equal(permissions.screenings.POST.includes('admin'), false);
  assert.equal(permissions.screenings.POST.includes('hospital'), false);
  assert.deepEqual(permissions.screenings.POST, ['asha', 'doctor']);
  assert.equal(permissions.screenings.GET.includes('hospital'), false);
  assert.equal(permissions.appointments.GET.includes('admin'), false);
  assert.equal(permissions.referrals.GET.includes('admin'), false);
  assert.deepEqual(permissions.appointments.POST, []);
  assert.deepEqual(permissions.hospitals.POST, ['admin']);
  assert.equal(permissions.referrals.GET.includes('district'), false);
});

test('platform administrators cannot enter the clinician-only patient queue', async () => {
  await assert.rejects(clinical.queue({ role: 'admin', _id: 'admin-id' }), /Doctor workspace access required/);
});

test('production security configuration rejects wildcard and non-HTTPS origins', () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, CLIENT_URL: process.env.CLIENT_URL };
  process.env.NODE_ENV = 'production';
  process.env.CLIENT_URL = '*';
  assert.throws(() => security.allowedOrigins(), /explicit allowed origins/);
  process.env.CLIENT_URL = 'http://frontend.example.test';
  assert.throws(() => security.allowedOrigins(), /must use HTTPS/);
  process.env.NODE_ENV = previous.NODE_ENV;
  if (previous.CLIENT_URL === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = previous.CLIENT_URL;
});

test('development CORS allows the localhost loopback alias without widening production origins', () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, CLIENT_URL: process.env.CLIENT_URL };
  process.env.NODE_ENV = 'development';
  process.env.CLIENT_URL = 'http://localhost:5173';
  assert.ok(security.allowedOrigins().includes('http://127.0.0.1:5173'));
  process.env.NODE_ENV = 'production';
  process.env.CLIENT_URL = 'https://aarogya.example.test';
  assert.deepEqual(security.allowedOrigins(), ['https://aarogya.example.test']);
  process.env.NODE_ENV = previous.NODE_ENV;
  if (previous.CLIENT_URL === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = previous.CLIENT_URL;
});

test('production requires private encryption keys, a non-placeholder AI service token, and Cloudinary storage', () => {
  const keys = ['NODE_ENV', 'CLIENT_URL', 'MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'SCREENING_IMAGE_ENCRYPTION_KEY', 'PATIENT_AADHAAR_ENCRYPTION_KEY', 'AI_SERVICE_URL', 'AI_SERVICE_TOKEN', 'FILE_STORAGE_DRIVER', 'CLOUDINARY_URL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      CLIENT_URL: 'https://aarogya.example.test',
      MONGODB_URI: 'mongodb+srv://db.example.test/aarogya',
      JWT_ACCESS_SECRET: 'distinct-access-secret-with-enough-length-12345',
      JWT_REFRESH_SECRET: 'distinct-refresh-secret-with-enough-length-67890',
      SCREENING_IMAGE_ENCRYPTION_KEY: 'screening-encryption-secret-with-enough-length',
      PATIENT_AADHAAR_ENCRYPTION_KEY: 'patient-aadhaar-encryption-secret-with-enough-length',
      AI_SERVICE_URL: 'https://ai.example.test',
      AI_SERVICE_TOKEN: 'local-development-ai-service-token-change-me',
      FILE_STORAGE_DRIVER: 'cloudinary',
      CLOUDINARY_URL: '',
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '',
      CLOUDINARY_API_SECRET: ''
    });
    assert.throws(() => security.assertProductionEnvironment(), /AI_SERVICE_TOKEN/);
    process.env.AI_SERVICE_TOKEN = 'secure-production-service-token-with-at-least-32-bytes';
    assert.throws(() => security.assertProductionEnvironment(), /Cloudinary credentials/);
    process.env.CLOUDINARY_CLOUD_NAME = 'cloud-name';
    process.env.CLOUDINARY_API_KEY = 'key';
    process.env.CLOUDINARY_API_SECRET = 'secret';
    assert.doesNotThrow(() => security.assertProductionEnvironment());
    process.env.PATIENT_AADHAAR_ENCRYPTION_KEY = '';
    assert.throws(() => security.assertProductionEnvironment(), /PATIENT_AADHAAR_ENCRYPTION_KEY/);
    process.env.PATIENT_AADHAAR_ENCRYPTION_KEY = 'patient-aadhaar-encryption-secret-with-enough-length';
    process.env.PATIENT_AADHAAR_ENCRYPTION_KEY = process.env.SCREENING_IMAGE_ENCRYPTION_KEY;
    assert.throws(() => security.assertProductionEnvironment(), /PATIENT_AADHAAR_ENCRYPTION_KEY/);
    process.env.PATIENT_AADHAAR_ENCRYPTION_KEY = 'patient-aadhaar-encryption-secret-with-enough-length';
    process.env.CLOUDINARY_CLOUD_NAME = '';
    process.env.CLOUDINARY_API_KEY = '';
    process.env.CLOUDINARY_API_SECRET = '';
    process.env.CLOUDINARY_URL = 'cloudinary://key:secret@cloud-name';
    assert.doesNotThrow(() => security.assertProductionEnvironment());
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
