const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const models = require('../src/models');
const { createSession } = require('../src/services/authService');
const articles = require('../src/educationSeed');

test('education API enforces publication review and role permissions', async t => {
  await connectDB();
  const users = {};
  for (const role of ['admin', 'doctor', 'specialist', 'patient']) {
    users[role] = await models.User.findOne({ role, isActive: true });
    assert.ok(users[role], `An active ${role} account is required for this integration test`);
  }
  const sessions = [];
  const tokens = {};
  for (const role of Object.keys(users)) {
    const session = await createSession(users[role]);
    sessions.push(session);
    tokens[role] = session.accessToken;
  }
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/education`;
  const request = (path, role, method = 'GET', body) => fetch(`${base}${path}`, {
    method,
    headers: { ...(role ? { authorization: `Bearer ${tokens[role]}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const slug = `education-api-test-${crypto.randomBytes(6).toString('hex')}`;

  t.after(async () => {
    await models.EducationArticle.deleteOne({ slug });
    for (const session of sessions) {
      const jti = jwt.decode(session.refreshToken)?.jti;
      if (jti) await models.RefreshSession.deleteOne({ tokenIdHash: crypto.createHash('sha256').update(jti).digest('hex') });
    }
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  });

  const source = articles[0];
  const createBody = {
    slug,
    category: source.category,
    keywords: source.keywords,
    content: source.content,
    medicalSources: source.medicalSources
  };
  const unauthenticated = await request('/manage', null);
  assert.equal(unauthenticated.status, 401);
  const patientForbidden = await request('/manage', 'patient');
  assert.equal(patientForbidden.status, 403);
  const seededDrafts = await request('/manage?status=draft', 'admin');
  assert.ok((await seededDrafts.json()).data.some(article => article.slug === 'oral-cancer-awareness'));
  const teluguSearch = await request('/manage?q=%E0%B0%A8%E0%B1%8B%E0%B0%9F%E0%B0%BF', 'admin');
  assert.ok((await teluguSearch.json()).data.some(article => article.slug === 'oral-cancer-awareness'));

  const createdResponse = await request('/manage', 'admin', 'POST', createBody);
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).data;
  assert.equal(created.status, 'draft');
  assert.equal(created.reviewStatus, 'unreviewed');
  const editorList = await request('/manage', 'admin');
  assert.ok((await editorList.json()).data.some(article => article.slug === slug));
  const hiddenDraft = await request(`/${slug}`, null);
  assert.equal(hiddenDraft.status, 404, await hiddenDraft.text());
  assert.equal((await request(`/manage/${created._id}/publish`, 'doctor', 'POST')).status, 409);

  const submitResponse = await request(`/manage/${created._id}/submit`, 'doctor', 'POST');
  assert.equal(submitResponse.status, 200);
  const reviewResponse = await request(`/manage/${created._id}/review`, 'specialist', 'POST', { decision: 'approved', notes: 'Content reviewed by test specialist.' });
  assert.equal(reviewResponse.status, 200);
  const publishResponse = await request(`/manage/${created._id}/publish`, 'specialist', 'POST');
  assert.equal(publishResponse.status, 200);

  const publishedResponse = await request(`/${slug}`, null);
  assert.equal(publishedResponse.status, 200);
  assert.equal((await publishedResponse.json()).data.content.en.title, source.content.en.title);
  const searchResponse = await request(`/?q=${encodeURIComponent('నోటి క్యాన్సర్')}`, null);
  assert.equal(searchResponse.status, 200);
  assert.ok((await searchResponse.json()).data.some(article => article.slug === slug));

  const archivedResponse = await request(`/manage/${created._id}/archive`, 'admin', 'POST');
  assert.equal(archivedResponse.status, 200);
  assert.equal((await request(`/${slug}`, null)).status, 404);
});
