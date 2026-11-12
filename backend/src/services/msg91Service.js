const ApiError = require('../utils/ApiError');

async function sendPatientOtp(phone, code) {
  if (process.env.NODE_ENV !== 'production' && process.env.PATIENT_OTP_DEV_MODE === 'true') {
    return { developmentCode: code };
  }

  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID;
  if (!authKey || !templateId) {
    throw new ApiError(503, 'Patient OTP delivery is not configured. Set MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID on the backend.');
  }

  const url = new URL(process.env.MSG91_OTP_API_URL || 'https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', templateId);
  url.searchParams.set('mobile', phone.slice(1));
  url.searchParams.set('otp', code);
  url.searchParams.set('otp_expiry', String(Math.max(2, Number(process.env.PATIENT_OTP_TTL_MINUTES) || 5)));

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { authkey: authKey, accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new ApiError(503, 'The OTP provider could not be reached. Please retry shortly.');
  }

  const result = await response.json().catch(() => null);
  if (!response.ok || result?.type?.toLowerCase() === 'error' || result?.status === 'error') {
    throw new ApiError(503, 'The OTP provider could not send a verification code. Check MSG91 configuration and retry.');
  }
  return null;
}

module.exports = { sendPatientOtp };
