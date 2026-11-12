const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { EducationVideo, EducationVideoHistory } = require('../models');

const categories = ['ulcers', 'oral-cancer-awareness', 'white-patches', 'red-patches', 'oral-hygiene', 'tongue-infections', 'oral-symptoms', 'precautions-prevention', 'when-to-visit-doctor'];
const languages = ['en', 'te', 'hi'];
const trustedSources = ['Doctor O\'Donovan', 'NHS England Workforce, Training and Education', 'Cancer Research UK', 'University College London Hospitals NHS Foundation Trust'];
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function validateVideo(input) {
  const allowed = ['slug', 'category', 'title', 'description', 'durationSeconds', 'youtubeId', 'sourceTitle', 'sourceUrl', 'attribution', 'licenseNote', 'subtitleLanguages', 'explanation', 'importantSymptoms', 'precautions', 'relatedTopics'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new ApiError(400, 'Video data contains unsupported fields');
  if (typeof input.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || input.slug.length > 100) throw new ApiError(400, 'Provide a valid video slug');
  if (!categories.includes(input.category)) throw new ApiError(400, 'Choose a supported video category');
  for (const field of ['title', 'description', 'explanation']) {
    if (!input[field] || typeof input[field] !== 'object' || Object.keys(input[field]).some(language => !languages.includes(language)) || languages.some(language => typeof input[field][language] !== 'string' || !input[field][language].trim())) throw new ApiError(400, `Provide ${field} in English, Telugu, and Hindi`);
  }
  for (const field of ['importantSymptoms', 'precautions']) {
    if (!input[field] || typeof input[field] !== 'object' || Object.keys(input[field]).some(language => !languages.includes(language)) || languages.some(language => !Array.isArray(input[field][language]) || input[field][language].length > 8 || input[field][language].some(item => typeof item !== 'string' || !item.trim() || item.length > 300))) throw new ApiError(400, `Provide up to 8 short, trusted ${field} items in English, Telugu, and Hindi`);
  }
  if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 1 || input.durationSeconds > 86400) throw new ApiError(400, 'Duration must be between 1 second and 24 hours');
  if (typeof input.youtubeId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(input.youtubeId) || input.sourceUrl !== `https://www.youtube.com/watch?v=${input.youtubeId}`) throw new ApiError(400, 'Only a canonical YouTube video URL is allowed');
  if (!trustedSources.includes(input.sourceTitle)) throw new ApiError(400, 'Choose an approved medical or public-health education source');
  for (const field of ['sourceTitle', 'attribution', 'licenseNote']) if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 500) throw new ApiError(400, `Provide source attribution and licensing information (${field})`);
  if (!Array.isArray(input.subtitleLanguages) || input.subtitleLanguages.some(language => !languages.includes(language))) throw new ApiError(400, 'Subtitle languages must be English, Telugu, or Hindi');
  if (!Array.isArray(input.relatedTopics) || input.relatedTopics.length > 9 || input.relatedTopics.some(topic => !categories.includes(topic))) throw new ApiError(400, 'Related topics must be supported categories');
}

async function list({ category, q, language = 'en' } = {}) {
  const query = { status: 'published' };
  const filters = [];
  if (category) {
    if (!categories.includes(category)) throw new ApiError(400, 'Choose a supported video category');
    filters.push({ $or: [{ category }, { relatedTopics: category }] });
  }
  if (q) {
    if (typeof q !== 'string' || q.length > 120) throw new ApiError(400, 'Search must be 120 characters or fewer');
    const pattern = new RegExp(escapeRegex(q.trim()), 'i');
    filters.push({ $or: [...languages.flatMap(code => [{ [`title.${code}`]: pattern }, { [`description.${code}`]: pattern }]), { sourceTitle: pattern }, { category: pattern }] });
  }
  if (filters.length) query.$and = filters;
  const selectedLanguage = languages.includes(language) ? language : 'en';
  return EducationVideo.find(query).sort({ category: 1, updatedAt: -1 }).limit(100).lean().then(videos => videos.map(video => ({ ...video, localizedTitle: video.title[selectedLanguage] || video.title.en, localizedDescription: video.description[selectedLanguage] || video.description.en, localizedExplanation: video.explanation[selectedLanguage] || video.explanation.en })));
}

async function getHistory(userId, query = {}) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
  const limit = Math.max(1, Math.min(50, Number.parseInt(query.limit, 10) || 20));
  const publishedVideoIds = await EducationVideo.find({ status: 'published' }).distinct('_id');
  const filter = { user: userId, video: { $in: publishedVideoIds } };
  const [all, total] = await Promise.all([
    EducationVideoHistory.find(filter).sort({ lastWatchedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('video').lean(),
    EducationVideoHistory.countDocuments(filter)
  ]);
  const items = all.filter(item => item.video);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function recordView(userId, videoId) {
  if (!mongoose.isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video id');
  const video = await EducationVideo.findOne({ _id: videoId, status: 'published' }).select('_id').lean();
  if (!video) throw new ApiError(404, 'Published educational video not found');
  return EducationVideoHistory.findOneAndUpdate({ user: userId, video: videoId }, { $set: { lastWatchedAt: new Date() }, $inc: { watchCount: 1 }, $setOnInsert: { user: userId, video: videoId } }, { upsert: true, new: true, runValidators: true });
}

async function createDraft(user, input) {
  if (user?.role !== 'admin') throw new ApiError(403, 'Only an administrator can add educational videos');
  validateVideo(input);
  try { return await EducationVideo.create({ ...input, status: 'draft', createdBy: user._id }); }
  catch (error) { if (error.code === 11000) throw new ApiError(409, 'A video with this slug already exists'); if (error.name === 'ValidationError') throw new ApiError(400, 'Video details failed validation'); throw error; }
}

async function publish(user, id) {
  if (user?.role !== 'admin') throw new ApiError(403, 'Only an administrator can publish educational videos');
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid video id');
  const video = await EducationVideo.findById(id);
  if (!video) throw new ApiError(404, 'Video not found');
  video.status = 'published';
  await video.save();
  return video;
}

module.exports = { categories, trustedSources, validateVideo, list, getHistory, recordView, createDraft, publish };
