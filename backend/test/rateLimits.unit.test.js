const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  loginLimiter,
  patientOtpRequestLimiter
} = require('../src/middleware/rateLimits');

test('login and patient OTP requests use independent rate-limit buckets', async () => {
  for (const key of ['127.0.0.1', '::ffff:127.0.0.1']) {
    loginLimiter.resetKey(key);
    patientOtpRequestLimiter.resetKey(key);
  }
  const app = express();
  app.post('/login', loginLimiter, (req, res) => res.sendStatus(204));
  app.post('/otp', patientOtpRequestLimiter, (req, res) => res.sendStatus(204));
  const server = app.listen(0);

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await fetch(`${baseUrl}/login`, { method: 'POST' });
      assert.equal(response.status, 204);
    }

    const loginLimit = await fetch(`${baseUrl}/login`, { method: 'POST' });
    assert.equal(loginLimit.status, 429);
    assert.ok(Number(loginLimit.headers.get('retry-after')) > 0);
    assert.match((await loginLimit.json()).message, /Please retry in \d+ minute/);

    const otpRequest = await fetch(`${baseUrl}/otp`, { method: 'POST' });
    assert.equal(otpRequest.status, 204);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const key of ['127.0.0.1', '::ffff:127.0.0.1']) {
      loginLimiter.resetKey(key);
      patientOtpRequestLimiter.resetKey(key);
    }
  }
});
