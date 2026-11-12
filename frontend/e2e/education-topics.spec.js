import { test, expect } from '@playwright/test';
import { signIn } from './auth.helpers.js';
const topics = [
  ['awareness', 'Oral cancer awareness'], ['ulcers', 'Mouth ulcers'], ['patches', 'White and red patches'],
  ['infections', 'Thrush and mouth infections'], ['gum-disease', 'Gum disease and dental infections'],
  ['hygiene', 'Oral hygiene'], ['tobacco', 'Tobacco, gutka, pan masala, and smoking'],
  ['warning-signs', 'Early warning signs'], ['prevention', 'Prevention and healthy habits'],
  ['doctor-visit', 'When to visit a doctor'], ['screening', 'Screening and follow-up care'],
  ['faqs', 'Frequently asked questions']
];

test('topic dropdown opens each complete chapter and All topics returns the catalog', async ({ page }) => {
  await signIn(page, 'patient.demo@aarogya.test');
  await page.getByRole('link', { name: /Oral health education/ }).click();

  const selector = page.locator('.education-category select');
  for (const [id, title] of topics) {
    await selector.selectOption(id);
    await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    await expect(page.locator('.education-chapter-toc')).toBeVisible();
    await expect(page.locator('.education-chapter .education-topic-illustration')).toBeVisible();
    await expect.poll(() => page.locator('.education-chapter .education-topic-illustration').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('.education-chapter #chapter-faqs details')).toHaveCount(5);
    await expect(page.getByRole('heading', { name: /Causes|Signs and symptoms|Risk factors/ }).first()).toBeVisible();
  }

  await selector.selectOption('');
  await expect(page.locator('.education-topic-card')).toHaveCount(12);
  const topicImages = page.locator('.education-topic-card .education-topic-illustration');
  await expect(topicImages).toHaveCount(12);
  for (let index = 0; index < await topicImages.count(); index++) {
    const image = topicImages.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(element => element.naturalWidth)).toBeGreaterThan(0);
  }
  await page.getByRole('button', { name: 'Read this topic' }).nth(0).click();
  await expect(page.getByRole('heading', { level: 2, name: topics[0][1] })).toBeVisible();
});

test('topic chapters remain usable on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'patient.demo@aarogya.test');
  await expect(page).toHaveURL(/\/app\//);
  await page.getByRole('link', { name: /Oral health education/ }).click();
  await page.locator('.education-category select').selectOption('ulcers');
  await expect(page.locator('.education-chapter-header')).toBeVisible();
  await expect(page.locator('.education-chapter-toc a').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
