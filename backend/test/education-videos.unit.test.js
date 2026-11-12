const test = require('node:test');
const assert = require('node:assert/strict');
const videoSeed = require('../src/educationVideoSeed');
const videoService = require('../src/services/educationVideoService');

test('curated starter videos use attributed, canonical YouTube embeds and localized education text', () => {
  assert.equal(videoSeed.length, 3);
  for (const video of videoSeed) {
    assert.doesNotThrow(() => videoService.validateVideo(video));
    assert.match(video.sourceUrl, new RegExp(`^https://www\\.youtube\\.com/watch\\?v=${video.youtubeId}$`));
    assert.ok(video.attribution.length > 0);
    assert.ok(video.licenseNote.length > 0);
    for (const language of ['en', 'te', 'hi']) {
      assert.ok(video.title[language]);
      assert.ok(video.description[language]);
      assert.ok(video.explanation[language]);
    }
  }
});

test('video validation rejects arbitrary hosts, absent attribution, invalid subtitle codes, and unsupported fields', () => {
  const valid = structuredClone(videoSeed[0]);
  assert.throws(() => videoService.validateVideo({ ...valid, sourceUrl: `https://example.com/watch?v=${valid.youtubeId}` }), /canonical YouTube/);
  assert.throws(() => videoService.validateVideo({ ...valid, sourceTitle: 'Unverified Creator' }), /approved medical/);
  assert.throws(() => videoService.validateVideo({ ...valid, attribution: '' }), /attribution/);
  assert.throws(() => videoService.validateVideo({ ...valid, subtitleLanguages: ['fr'] }), /Subtitle languages/);
  assert.throws(() => videoService.validateVideo({ ...valid, uploadPath: '/uploads/video.mp4' }), /unsupported fields/);
});

test('the public video topic list includes all requested categories', () => {
  assert.deepEqual(videoService.categories, ['ulcers', 'oral-cancer-awareness', 'white-patches', 'red-patches', 'oral-hygiene', 'tongue-infections', 'oral-symptoms', 'precautions-prevention', 'when-to-visit-doctor']);
});
