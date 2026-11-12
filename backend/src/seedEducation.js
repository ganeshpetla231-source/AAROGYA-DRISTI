require('dotenv').config();
const connectDB = require('./config/db');
const models = require('./models');
const articles = require('./educationSeed');
const videos = require('./educationVideoSeed');

async function seedEducation() {
  await connectDB();
  const author = await models.User.findOne({ role: { $in: ['admin', 'doctor', 'specialist'] }, isActive: true }).sort({ role: 1 });
  if (!author) throw new Error('Create an authorized admin or clinical account before seeding education drafts.');
  let inserted = 0;
  for (const article of articles) {
    const seededRecord = {
      ...article,
      createdBy: author._id,
      updatedBy: author._id,
      status: 'draft',
      reviewStatus: 'unreviewed',
      reviewer: undefined,
      reviewerName: undefined,
      reviewerNotes: '',
      reviewedAt: undefined,
      publishedAt: undefined
    };
    const result = await models.EducationArticle.updateOne(
      { slug: article.slug },
      { $set: seededRecord },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    if (result.upsertedCount) inserted += 1;
  }
  let videoInserted = 0;
  for (const video of videos) {
    const { importantSymptoms, precautions, ...videoOnInsert } = video;
    const result = await models.EducationVideo.updateOne(
      { slug: video.slug },
      { $set: { importantSymptoms, precautions }, $setOnInsert: { ...videoOnInsert, status: 'published', createdBy: author._id } },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    if (result.upsertedCount) videoInserted += 1;
  }
  console.log(`Education seed complete: ${inserted} new draft articles and ${videoInserted} curated videos added; existing content was preserved.`);
}

seedEducation().catch(error => {
  console.error(`Education seed failed: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  const mongoose = require('mongoose');
  await mongoose.disconnect();
});
