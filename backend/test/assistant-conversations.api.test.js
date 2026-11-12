const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();
const app = require('../src/app');
const connectDB = require('../src/config/db');
const models = require('../src/models');
const { createSession } = require('../src/services/authService');
const videoSeed = require('../src/educationVideoSeed');

test('MongoDB assistant conversations persist text turns, paginate, and enforce owner access', async t => {
  await connectDB();
  const suffix = crypto.randomBytes(8).toString('hex');
  const patientUser = await models.User.create({ name: 'Conversation Test Patient', email: `conversation-patient-${suffix}@test.invalid`, role: 'patient' });
  const otherUser = await models.User.create({ name: 'Conversation Test Other', email: `conversation-other-${suffix}@test.invalid`, role: 'patient' });
  const patient = await models.Patient.create({ patientId: `CONV-${suffix}`, user: patientUser._id, name: patientUser.name, village: 'Test Village' });
  const patientSession = await createSession(patientUser);
  const otherSession = await createSession(otherUser);
  const videos = await Promise.all(videoSeed.slice(0, 2).map((video, index) => models.EducationVideo.create({ ...video, slug: `conversation-history-${suffix}-${index}`, status: 'published', createdBy: patientUser._id })));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/assistant/conversations`;
  const educationBase = `http://127.0.0.1:${server.address().port}/api/education/videos`;
  const request = (path, session, method = 'GET', body) => fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${session.accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const sessionIds = [patientSession, otherSession].map(session => jwt.decode(session.refreshToken)?.jti).filter(Boolean);
  t.after(async () => {
    await models.VoiceMessage.deleteMany({ owner: { $in: [patientUser._id, otherUser._id] } });
    await models.VoiceConversation.deleteMany({ owner: { $in: [patientUser._id, otherUser._id] } });
    await models.Patient.deleteOne({ _id: patient._id });
    await models.EducationVideoHistory.deleteMany({ user: { $in: [patientUser._id, otherUser._id] }, video: { $in: videos.map(video => video._id) } });
    await models.EducationVideo.deleteMany({ _id: { $in: videos.map(video => video._id) } });
    await models.User.deleteMany({ _id: { $in: [patientUser._id, otherUser._id] } });
    if (sessionIds.length) await models.RefreshSession.deleteMany({ tokenIdHash: { $in: sessionIds.map(id => crypto.createHash('sha256').update(id).digest('hex')) } });
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  });

  const createdResponse = await request('', patientSession, 'POST', { language: 'te' });
  assert.equal(createdResponse.status, 201);
  const conversation = (await createdResponse.json()).data;
  assert.equal(String(conversation.patient), String(patient._id));
  assert.equal(String(conversation.owner), String(patientUser._id));

  const messageResponse = await request(`/${conversation._id}/messages`, patientSession, 'POST', {
    language: 'te', messages: [{ role: 'user', text: 'నోటి ఆరోగ్యం ఎలా కాపాడుకోవాలి?' }, { role: 'assistant', text: 'రోజుకు రెండుసార్లు పళ్ళు తోమండి.' }]
  });
  assert.equal(messageResponse.status, 201);
  assert.equal((await messageResponse.json()).data.items.length, 2);
  assert.equal((await request(`/${conversation._id}/messages?page=1&limit=1`, patientSession)).status, 200);
  const page = (await (await request(`/${conversation._id}/messages?page=1&limit=1`, patientSession)).json()).data;
  assert.equal(page.items.length, 1);
  assert.equal(page.pagination.total, 2);
  assert.equal((await request(`/${conversation._id}/messages`, otherSession)).status, 404);
  assert.equal((await request(`/${conversation._id}`, otherSession, 'DELETE')).status, 404);
  assert.equal((await request(`/${conversation._id}/messages`, patientSession, 'POST', { language: 'en', audio: 'should-not-be-accepted', messages: [{ role: 'user', text: 'Hello' }] })).status, 400);
  assert.equal((await request(`/${conversation._id}`, patientSession, 'DELETE')).status, 200);
  assert.equal(await models.VoiceMessage.countDocuments({ conversation: conversation._id }), 0);

  for (const video of videos) {
    const viewed = await fetch(`${educationBase}/${video._id}/views`, { method: 'POST', headers: { authorization: `Bearer ${patientSession.accessToken}` } });
    assert.equal(viewed.status, 201);
  }
  const videoPageResponse = await fetch(`${educationBase}/history?page=1&limit=1`, { headers: { authorization: `Bearer ${patientSession.accessToken}` } });
  assert.equal(videoPageResponse.status, 200);
  const videoPage = (await videoPageResponse.json()).data;
  assert.equal(videoPage.items.length, 1);
  assert.equal(videoPage.pagination.total, 2);
  const otherHistory = await fetch(`${educationBase}/history`, { headers: { authorization: `Bearer ${otherSession.accessToken}` } });
  assert.equal((await otherHistory.json()).data.items.length, 0);
});
