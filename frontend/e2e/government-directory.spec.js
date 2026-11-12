import { test, expect } from '@playwright/test';
import { signIn } from './auth.helpers.js';

test('government directory loads facilities, searches, filters, and opens contact details', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedDirectoryNumber = value; } } });
  });
  await signIn(page, 'patient.demo@aarogya.test');
  await page.getByRole('button', { name: /Government Hospital Directory/ }).click();
  await expect(page.getByText('Total hospitals')).toBeVisible();
  await expect(page.getByText('430', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'District Hospital, Paderu' })).toBeVisible();
  await expect(page.locator('.directory-phc-card')).toHaveCount(35);

  await page.getByLabel('Select mandal').selectOption('G.K. Veedhi');
  await expect(page.locator('.directory-phc-card')).toHaveCount(7);
  await page.getByLabel('Select mandal').selectOption('');
  await page.getByLabel('Search PHCs').fill('531040');
  await expect(page.locator('.directory-phc-card')).toHaveCount(5);
  const phc = page.locator('.directory-phc-card').filter({ hasText: 'Kilagada' });
  await expect(phc.getByRole('link', { name: /Call now/ })).toHaveAttribute('href', 'tel:9441530610');
  await phc.getByRole('button', { name: 'Copy number' }).click();
  await expect(page.getByText('Phone number copied.')).toBeVisible();
  await expect(page.locator('body')).toContainText('9441530610');
  await phc.getByRole('button', { name: 'View details' }).click();
  await expect(page.getByRole('dialog')).toContainText('531040');
  await page.getByRole('button', { name: 'Close details' }).click();

  await page.getByLabel('Search PHCs').fill('no matching place');
  await expect(page.getByRole('status')).toContainText('No PHCs match');
  await expect(page.getByRole('link', { name: 'Call DMHO' })).toHaveAttribute('href', 'tel:9959055025');
  await expect(page.getByRole('link', { name: 'Email DMHO' })).toHaveAttribute('href', 'mailto:dmhoasr@gmail.com');
});

test('government directory cards fit a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'patient.demo@aarogya.test');
  await expect(page.locator('.directory-summary-card')).toHaveCount(4);
  await expect(page.locator('.directory-phc-card').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
