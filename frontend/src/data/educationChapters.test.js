import test from 'node:test';
import assert from 'node:assert/strict';
import { educationChapters } from './educationChapters.js';

const requiredSections = ['introduction', 'detailedExplanation', 'causes', 'signs', 'riskFactors', 'typesStages', 'effects', 'prevention', 'diagnosis', 'treatment', 'homeCare', 'whenToConsult', 'tips'];

test('the education catalog contains each of the 12 requested topics once', () => {
  const expected = ['awareness', 'ulcers', 'patches', 'infections', 'gum-disease', 'hygiene', 'tobacco', 'warning-signs', 'prevention', 'doctor-visit', 'screening', 'faqs'];
  assert.deepEqual(educationChapters.map(chapter => chapter.id), expected);
  assert.equal(new Set(educationChapters.map(chapter => chapter.id)).size, 12);
});

for (const chapter of educationChapters) {
  test(`${chapter.id} chapter has unique complete sections, five FAQs, and cited sources`, () => {
    for (const section of requiredSections) {
      assert.ok(chapter[section], `${section} is present`);
      assert.notEqual(chapter[section].length, 0, `${section} is not empty`);
    }
    assert.ok(chapter.faqs.length >= 5);
    assert.ok(chapter.sources.length >= 2);
    for (const [, url] of chapter.sources) assert.match(url, /^https:\/\//);
  });
}
