const test = require('node:test');
const assert = require('node:assert/strict');
const msg91 = require('../src/services/msg91Service');

test('patient OTP development preview is opt-in and disabled in production', async t => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    devMode: process.env.PATIENT_OTP_DEV_MODE,
    authKey: process.env.MSG91_AUTH_KEY,
    templateId: process.env.MSG91_OTP_TEMPLATE_ID
  };
  t.after(() => {
    for (const [key, value] of Object.entries({
      NODE_ENV: original.nodeEnv,
      PATIENT_OTP_DEV_MODE: original.devMode,
      MSG91_AUTH_KEY: original.authKey,
      MSG91_OTP_TEMPLATE_ID: original.templateId
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  delete process.env.MSG91_AUTH_KEY;
  delete process.env.MSG91_OTP_TEMPLATE_ID;
  process.env.NODE_ENV = 'development';
  process.env.PATIENT_OTP_DEV_MODE = 'true';
  assert.deepEqual(await msg91.sendPatientOtp('+919876543210', '123456'), { developmentCode: '123456' });
  process.env.MSG91_AUTH_KEY = 'test-auth-key';
  process.env.MSG91_OTP_TEMPLATE_ID = 'test-template';
  assert.deepEqual(await msg91.sendPatientOtp('+919876543210', '654321'), { developmentCode: '654321' });

  process.env.NODE_ENV = 'production';
  delete process.env.MSG91_AUTH_KEY;
  delete process.env.MSG91_OTP_TEMPLATE_ID;
  await assert.rejects(
    msg91.sendPatientOtp('+919876543210', '123456'),
    error => error.statusCode === 503 && /not configured/i.test(error.message)
  );

  process.env.NODE_ENV = 'development';
  process.env.PATIENT_OTP_DEV_MODE = 'false';
  await assert.rejects(
    msg91.sendPatientOtp('+919876543210', '123456'),
    error => error.statusCode === 503 && /not configured/i.test(error.message)
  );
});
