const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const models = require('../src/models');
const { accessSecret } = require('../src/services/authService');
const { validateMessage, generateTextResponse, createLiveToken, liveInstruction, providerError } = require('../src/services/geminiLiveService');

test('Gemini provider errors are classified without returning provider details', () => {
  const cases = [
    [{ status: 401, message: 'private provider detail' }, 503, /API key/],
    [{ status: 429, message: 'private provider detail' }, 429, /quota or rate limit/],
    [{ status: 404, message: 'private provider detail' }, 503, /model .* unavailable/],
    [{ status: 503, message: 'Model is currently experiencing high demand' }, 503, /temporarily busy/],
    [{ name: 'ApiError', message: '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}' }, 503, /temporarily busy/],
    [{ message: 'fetch failed' }, 503, /temporarily unreachable/]
  ];
  for (const [provider, statusCode, expected] of cases) {
    const safe = providerError(provider);
    assert.equal(safe.statusCode, statusCode);
    assert.match(safe.message, expected);
    assert.doesNotMatch(safe.message, /private provider detail/);
  }
  const imageError = providerError({ status: 503, message: 'private provider detail' }, 'image screening');
  assert.equal(imageError.statusCode, 503);
  assert.match(imageError.message, /Gemini image screening is temporarily busy/);
  assert.doesNotMatch(imageError.message, /private provider detail/);
});

test('assistant message validation accepts supported languages and rejects unsafe shapes', () => {
  assert.deepEqual(validateMessage({ message: '  How can I keep my mouth healthy?  ', language: 'en' }), {
    message: 'How can I keep my mouth healthy?',
    language: 'en'
  });
  assert.deepEqual(validateMessage({ message: 'నోటి ఆరోగ్యాన్ని ఎలా కాపాడుకోవాలి?', language: 'te' }).language, 'te');
  assert.deepEqual(validateMessage({ message: 'मुँह को स्वस्थ कैसे रखें?', language: 'hi' }).language, 'hi');
    assert.equal(validateMessage({ message: 'Explain this video', language: 'en', videoId: '507f1f77bcf86cd799439011' }).videoId, '507f1f77bcf86cd799439011');
  for (const input of [
    null,
    [],
    { message: '', language: 'en' },
    { message: 'x'.repeat(2001), language: 'en' },
    { message: 'Question', language: 'fr' },
    { message: 'Question', language: 'en', patientId: 'private-id' },
    { message: 'Question', language: 'en', videoContext: { title: 'client supplied' } },
    { message: 'Explain this video', language: 'en', videoId: 'not-an-object-id' }
  ]) {
    assert.throws(() => validateMessage(input), { statusCode: 400 });
  }
});

test('video explanations require a published database video and ignore client-supplied context', async () => {
  const previousFindOne = models.EducationVideo.findOne;
  const previousApiKey = process.env.GEMINI_API_KEY;
  models.EducationVideo.findOne = () => ({ lean: async () => null });
  process.env.GEMINI_API_KEY = 'unit-test-key';
  try {
    await assert.rejects(generateTextResponse({ message: 'What should I know?', language: 'en', videoId: '507f1f77bcf86cd799439011' }), { statusCode: 404 });
    assert.throws(() => validateMessage({ message: 'Question', language: 'en', videoId: '507f1f77bcf86cd799439011', videoContext: { description: 'untrusted' } }), { statusCode: 400 });
  } finally {
    models.EducationVideo.findOne = previousFindOne;
    if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousApiKey;
  }
});

test('Gemini Live tokens accept only automatic, English, Telugu, or Hindi response-language preferences', async () => {
  for (const language of ['auto', 'en', 'te', 'hi']) {
    assert.match(liveInstruction(language), /English, Telugu, or Hindi/);
  }
  assert.match(liveInstruction('hi'), /selected Hindi/);
  assert.match(liveInstruction('auto'), /no manual language override/);
  await assert.rejects(createLiveToken('fr'), { statusCode: 400 });
});

test('assistant endpoints require authentication, validate requests, and report missing Gemini configuration', async t => {
  const previousFindById = models.User.findById;
  const previousApiKey = process.env.GEMINI_API_KEY;
  models.User.findById = async id => ({ _id: id, role: 'patient', isActive: true, authVersion: 0 });
  delete process.env.GEMINI_API_KEY;

  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/assistant`;
  const token = jwt.sign({ sub: 'assistant-test-user', ver: 0 }, accessSecret());
  const request = (route, body, authorization = `Bearer ${token}`) => fetch(`${base}/${route}`, {
    method: 'POST',
    headers: {
      ...(authorization ? { authorization } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  t.after(async () => {
    models.User.findById = previousFindById;
    if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousApiKey;
    await new Promise(resolve => server.close(resolve));
  });

  const health = authorization => fetch(`${base}/health`, { headers: authorization ? { authorization } : {} });
  assert.equal((await health(null)).status, 401);
  const missingHealth = await health(`Bearer ${token}`);
  assert.equal(missingHealth.status, 503);
  assert.match((await missingHealth.json()).message, /GEMINI_API_KEY/);
  const noSecret = await request('message', { message: 'Hello', language: 'en' }, null);
  assert.equal(noSecret.status, 401);
  assert.equal((await request('message', { message: '', language: 'en' })).status, 400);
  const unavailable = await request('message', { message: 'Hello', language: 'en' });
  assert.equal(unavailable.status, 503);
  assert.match((await unavailable.json()).message, /GEMINI_API_KEY/);
});
