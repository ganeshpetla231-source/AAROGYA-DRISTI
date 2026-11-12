const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { EducationArticle } = require('../models');

const editorRoles = ['doctor', 'specialist', 'admin'];
const reviewerRoles = ['doctor', 'specialist'];
const editableFields = ['slug', 'category', 'keywords', 'content', 'imageUrl', 'imageAttribution', 'imageAlt', 'medicalSources'];
const categories = ['awareness', 'ulcers', 'patches', 'infections', 'gum-disease', 'hygiene', 'tobacco', 'warning-signs', 'prevention', 'doctor-visit', 'screening', 'faqs'];
const languages = ['en', 'te', 'hi'];

function validHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validImageUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (value.startsWith('/')) return /^(?:\/[-A-Za-z0-9_./~%]+\.(?:png|jpe?g|svg|webp|gif|avif))$/i.test(value);
  return validHttpsUrl(value);
}

function assertRole(user, roles) {
  if (!roles.includes(user?.role)) throw new ApiError(403, 'Your role is not allowed to manage health education content');
}

function validateArticleInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'Article data must be an object');
  for (const key of Object.keys(input)) if (!editableFields.includes(key)) throw new ApiError(400, `Article field is not editable: ${key}`);
  if (input.slug !== undefined && (typeof input.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug.trim()) || input.slug.length > 100)) throw new ApiError(400, 'Use a lowercase, hyphen-separated article slug');
  if (input.category !== undefined && !categories.includes(input.category)) throw new ApiError(400, 'Choose a supported article category');
  if (input.keywords !== undefined && (!Array.isArray(input.keywords) || input.keywords.length > 30 || input.keywords.some(value => typeof value !== 'string' || value.length > 100))) throw new ApiError(400, 'Keywords must be a list of at most 30 short text values');
  if (input.content !== undefined) {
    if (!input.content || typeof input.content !== 'object' || Array.isArray(input.content)) throw new ApiError(400, 'Provide article content for English, Telugu, and Hindi');
    for (const language of languages) {
      const content = input.content[language];
      if (!content || typeof content !== 'object' || Array.isArray(content)) throw new ApiError(400, `Article content is required in ${language}`);
      for (const key of ['title', 'summary', 'what', 'causes', 'signs', 'precautions', 'patientShould', 'patientShouldNot', 'whenToSeek', 'emergency', 'screeningFollowUp', 'faqs']) {
        const value = content[key];
        if (typeof value === 'string' ? !value.trim() : !Array.isArray(value) || !value.length) throw new ApiError(400, `Complete ${key} in ${language} before saving`);
      }
      if (content.faqs.some(faq => !faq || typeof faq.question !== 'string' || !faq.question.trim() || typeof faq.answer !== 'string' || !faq.answer.trim())) throw new ApiError(400, `Complete every FAQ question and answer in ${language}`);
    }
    if (Object.keys(input.content).some(language => !languages.includes(language))) throw new ApiError(400, 'Only English, Telugu, and Hindi article content is supported');
  }
  if (input.imageUrl !== undefined && input.imageUrl !== '' && !validImageUrl(input.imageUrl)) throw new ApiError(400, 'Educational image URLs must be valid HTTPS URLs or project asset paths');
  if (input.imageUrl) {
    if (typeof input.imageAttribution !== 'string' || !input.imageAttribution.trim()) throw new ApiError(400, 'Provide the image source and attribution');
    if (!input.imageAlt || languages.some(language => typeof input.imageAlt[language] !== 'string' || !input.imageAlt[language].trim())) throw new ApiError(400, 'Provide accessible image descriptions in English, Telugu, and Hindi');
  }
  if (input.medicalSources !== undefined && (!Array.isArray(input.medicalSources) || input.medicalSources.length > 20 || input.medicalSources.some(source => !source || typeof source.title !== 'string' || !source.title.trim() || !validHttpsUrl(source.url)))) throw new ApiError(400, 'Provide valid source titles and HTTPS URLs');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function publishedList({ category, q } = {}) {
  const query = { status: 'published', reviewStatus: 'reviewed' };
  if (category && categories.includes(category)) query.category = category;
  if (q) {
    if (typeof q !== 'string' || q.length > 120) throw new ApiError(400, 'Search must be 120 characters or fewer');
    const search = new RegExp(escapeRegex(q.trim()), 'i');
    query.$or = [
      ...languages.flatMap(language => [
        { [`content.${language}.title`]: search },
        { [`content.${language}.summary`]: search },
        { [`content.${language}.what`]: search },
        { [`content.${language}.causes`]: search },
        { [`content.${language}.signs`]: search }
      ]),
      { keywords: search }
    ];
  }
  return EducationArticle.find(query).sort({ category: 1, updatedAt: -1 }).limit(100).lean();
}

async function editorList(user, { category, q, status } = {}) {
  assertRole(user, editorRoles);
  const query = {};
  if (category && categories.includes(category)) query.category = category;
  if (status && ['draft', 'pending-review', 'published', 'archived'].includes(status)) query.status = status;
  if (q) {
    if (typeof q !== 'string' || q.length > 120) throw new ApiError(400, 'Search must be 120 characters or fewer');
    const search = new RegExp(escapeRegex(q.trim()), 'i');
    query.$or = [...languages.flatMap(language => [{ [`content.${language}.title`]: search }, { [`content.${language}.summary`]: search }]), { keywords: search }];
  }
  return EducationArticle.find(query).sort({ updatedAt: -1 }).limit(200).lean();
}

async function getPublished(slug) {
  const article = await EducationArticle.findOne({ slug, status: 'published', reviewStatus: 'reviewed' }).lean();
  if (!article) throw new ApiError(404, 'Published article not found');
  return article;
}

async function getForEditor(user, id) {
  assertRole(user, editorRoles);
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid article id');
  const article = await EducationArticle.findById(id).lean();
  if (!article) throw new ApiError(404, 'Article not found');
  return article;
}

async function create(user, input) {
  assertRole(user, editorRoles);
  validateArticleInput(input);
  if (!input.slug || !input.category || !input.content || !input.medicalSources?.length) throw new ApiError(400, 'Slug, category, complete translations, and medical sources are required');
  try {
    return await EducationArticle.create({ ...input, status: 'draft', reviewStatus: 'unreviewed', createdBy: user._id, updatedBy: user._id });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'An article with this slug already exists');
    if (error.name === 'ValidationError') throw new ApiError(400, 'Article content failed validation');
    throw error;
  }
}

async function update(user, id, input) {
  assertRole(user, editorRoles);
  validateArticleInput(input);
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid article id');
  const article = await EducationArticle.findById(id);
  if (!article) throw new ApiError(404, 'Article not found');
  if (article.status === 'archived') throw new ApiError(409, 'Archived articles cannot be edited');
  for (const [key, value] of Object.entries(input)) article.set(key, value);
  article.status = 'draft';
  article.reviewStatus = 'unreviewed';
  article.reviewer = undefined;
  article.reviewerName = undefined;
  article.reviewedAt = undefined;
  article.publishedAt = undefined;
  article.updatedBy = user._id;
  try {
    await article.save();
    return article;
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'An article with this slug already exists');
    if (error.name === 'ValidationError') throw new ApiError(400, 'Article content failed validation');
    throw error;
  }
}

async function submitForReview(user, id) {
  assertRole(user, editorRoles);
  const article = await getForEditor(user, id);
  if (article.status !== 'draft') throw new ApiError(409, 'Only draft articles can be submitted for review');
  return EducationArticle.findByIdAndUpdate(id, { $set: { status: 'pending-review', updatedBy: user._id } }, { new: true, runValidators: true });
}

async function review(user, id, { decision, notes = '' } = {}) {
  assertRole(user, reviewerRoles);
  if (!mongoose.isValidObjectId(id) || !['approved', 'changes-requested'].includes(decision) || typeof notes !== 'string' || notes.length > 2000) throw new ApiError(400, 'Provide a valid review decision and notes');
  const article = await EducationArticle.findById(id);
  if (!article) throw new ApiError(404, 'Article not found');
  if (article.status !== 'pending-review') throw new ApiError(409, 'Only articles awaiting review can be reviewed');
  const approved = decision === 'approved';
  article.reviewStatus = approved ? 'reviewed' : 'changes-requested';
  article.reviewer = user._id;
  article.reviewerName = user.name;
  article.reviewerNotes = notes.trim();
  article.reviewedAt = new Date();
  article.status = approved ? 'pending-review' : 'draft';
  article.updatedBy = user._id;
  await article.save();
  return article;
}

async function publish(user, id) {
  assertRole(user, reviewerRoles);
  const article = await getForEditor(user, id);
  if (article.status !== 'pending-review' || article.reviewStatus !== 'reviewed' || !article.reviewer) throw new ApiError(409, 'A medical reviewer must approve this article before publication');
  return EducationArticle.findByIdAndUpdate(id, { $set: { status: 'published', publishedAt: new Date(), updatedBy: user._id } }, { new: true, runValidators: true });
}

async function archive(user, id) {
  assertRole(user, editorRoles);
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid article id');
  const article = await EducationArticle.findByIdAndUpdate(id, { $set: { status: 'archived', updatedBy: user._id } }, { new: true, runValidators: true });
  if (!article) throw new ApiError(404, 'Article not found');
  return article;
}

module.exports = { publishedList, editorList, getPublished, getForEditor, create, update, submitForReview, review, publish, archive };
