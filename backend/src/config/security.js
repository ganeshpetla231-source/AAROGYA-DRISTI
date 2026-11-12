const ApiError = require('../utils/ApiError');

function allowedOrigins() {
  const configured = process.env.CLIENT_URL;
  if (process.env.NODE_ENV === 'production' && !configured) throw new Error('CLIENT_URL must list the HTTPS frontend origin in production');
  const configuredOrigins = String(configured || 'http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean);
  if (!configuredOrigins.length || configuredOrigins.includes('*')) throw new Error('CLIENT_URL must contain explicit allowed origins');
  const origins = [];
  for (const origin of configuredOrigins) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error('CLIENT_URL entries must be valid origins without paths'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('CLIENT_URL entries must be valid origins without paths');
    origins.push(origin);
    if (process.env.NODE_ENV !== 'production' && parsed.hostname === 'localhost') origins.push(`${parsed.protocol}//127.0.0.1${parsed.port ? `:${parsed.port}` : ''}`);
    if (process.env.NODE_ENV !== 'production' && parsed.hostname === '127.0.0.1') origins.push(`${parsed.protocol}//localhost${parsed.port ? `:${parsed.port}` : ''}`);
  }
  if (!origins.length || origins.includes('*')) throw new Error('CLIENT_URL must contain explicit allowed origins');
  for (const origin of origins) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error('CLIENT_URL entries must be valid origins without paths'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('CLIENT_URL entries must be valid origins without paths');
  }
  if (process.env.NODE_ENV === 'production' && origins.some(origin => !origin.startsWith('https://'))) throw new Error('Production CLIENT_URL entries must use HTTPS');
  return origins;
}

function assertProductionEnvironment() {
  if (process.env.NODE_ENV !== 'production') return;
  allowedOrigins();
  if (!/^mongodb\+srv:\/\//.test(process.env.MONGODB_URI || '')) throw new Error('Set MONGODB_URI to the MongoDB Atlas SRV connection string');
  const access = process.env.JWT_ACCESS_SECRET || '', refresh = process.env.JWT_REFRESH_SECRET || '';
  if (access.length < 32 || refresh.length < 32 || access === refresh || /replace-with|change-me/i.test(access + refresh)) throw new Error('Set unique JWT secrets of at least 32 characters');
  const imageEncryptionKey = process.env.SCREENING_IMAGE_ENCRYPTION_KEY || '';
  const aadhaarEncryptionKey = process.env.PATIENT_AADHAAR_ENCRYPTION_KEY || '';
  if (imageEncryptionKey.length < 32) throw new Error('Set SCREENING_IMAGE_ENCRYPTION_KEY to at least 32 characters');
  if (aadhaarEncryptionKey.length < 32 || aadhaarEncryptionKey === imageEncryptionKey) throw new Error('Set PATIENT_AADHAAR_ENCRYPTION_KEY to a unique value of at least 32 characters');
  const accessTtl = process.env.ACCESS_TOKEN_TTL || '15m';
  const ttlMatch = /^(\d+)(s|m|h)$/.exec(accessTtl);
  const ttlSeconds = ttlMatch ? Number(ttlMatch[1]) * ({ s: 1, m: 60, h: 3600 }[ttlMatch[2]]) : Infinity;
  if (ttlSeconds < 60 || ttlSeconds > 3600) throw new Error('ACCESS_TOKEN_TTL must be between 60 seconds and 1 hour');
  const refreshDays = Number(process.env.REFRESH_TOKEN_DAYS || 7);
  if (!Number.isInteger(refreshDays) || refreshDays < 1 || refreshDays > 30) throw new Error('REFRESH_TOKEN_DAYS must be from 1 through 30');
  if (process.env.COOKIE_SAME_SITE && !['strict', 'lax', 'none'].includes(process.env.COOKIE_SAME_SITE.toLowerCase())) throw new Error('COOKIE_SAME_SITE must be strict, lax, or none');
  if (!process.env.AI_SERVICE_URL?.startsWith('https://')) throw new Error('AI_SERVICE_URL must use HTTPS in production');
  const aiServiceToken = process.env.AI_SERVICE_TOKEN || '';
  if (aiServiceToken.length < 32 || /replace-with|change-me|local-development/i.test(aiServiceToken)) throw new Error('Set AI_SERVICE_TOKEN to a unique random secret of at least 32 characters');
  const cloudinaryUrl = process.env.CLOUDINARY_URL || '';
  let cloudinaryUrlConfigured = false;
  if (cloudinaryUrl) {
    try {
      const parsed = new URL(cloudinaryUrl);
      cloudinaryUrlConfigured = parsed.protocol === 'cloudinary:' && Boolean(parsed.hostname && parsed.username && parsed.password);
    } catch { cloudinaryUrlConfigured = false; }
  }
  const cloudinaryCredentialsConfigured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
  );
  if (process.env.FILE_STORAGE_DRIVER !== 'cloudinary' || (!cloudinaryUrlConfigured && !cloudinaryCredentialsConfigured)) {
    throw new Error('Configure Cloudinary credentials and set FILE_STORAGE_DRIVER=cloudinary for production uploads');
  }
  if (process.env.TURN_URLS && !process.env.TURN_SHARED_SECRET) throw new Error('Set TURN_SHARED_SECRET when TURN_URLS is configured');
}

const corsOptions = () => ({
  origin(origin, callback) {
    if (!origin || allowedOrigins().includes(origin)) return callback(null, true);
    return callback(new ApiError(403, 'This origin is not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
  credentials: true,
  maxAge: 600
});

module.exports = { allowedOrigins, assertProductionEnvironment, corsOptions };
