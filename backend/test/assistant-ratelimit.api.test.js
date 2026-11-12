const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const models = require('../src/models');
const { accessSecret } = require('../src/services/authService');

test('assistant conversation creation is rate limited', async t => {
  const originalFindById = models.User.findById;
  const originalCreate = models.VoiceConversation.create;
  models.User.findById = async id => ({ _id: id, role: 'doctor', isActive: true, authVersion: 0 });
  models.VoiceConversation.create = async input => ({ _id: 'rate-limit-conversation', ...input });
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/assistant/conversations`;
  const token = jwt.sign({ sub: 'assistant-rate-limit-user', ver: 0 }, accessSecret());
  t.after(async () => {
    models.User.findById = originalFindById;
    models.VoiceConversation.create = originalCreate;
    await new Promise(resolve => server.close(resolve));
  });

  const statuses = [];
  for (let attempt = 0; attempt < 13; attempt += 1) {
    const response = await fetch(base, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'en' })
    });
    statuses.push(response.status);
  }
  assert.equal(statuses.filter(status => status === 201).length, 12);
  assert.equal(statuses.at(-1), 429);
});
