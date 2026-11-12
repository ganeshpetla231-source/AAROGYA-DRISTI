import { test, expect } from '@playwright/test';

test('first visit requires a language choice and then opens the requested route in that language', async ({ page }) => {
  await page.goto('/#/login');
  await page.evaluate(() => localStorage.removeItem('aarogya-language'));
  await page.reload();

  const gate = page.locator('.language-gate');
  await expect(gate).toBeVisible();
  await expect(gate.getByRole('group', { name: 'Select language' }).getByRole('button')).toHaveCount(3);
  await expect(page.locator('.auth-card')).toHaveCount(0);

  await gate.getByRole('button', { name: 'తెలుగు' }).click();
  await expect(page.locator('.language-gate')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  await expect(page.getByRole('heading', { name: 'మీ ఖాతాలోకి సైన్ ఇన్ చేయండి' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('aarogya-language'))).toBe('te');
});

test('changing language keeps the current route and registration form values', async ({ page }) => {
  await page.goto('/#/login?mode=register');
  await page.getByLabel('Full name').fill('Test Patient');
  await page.getByLabel('Email address').fill('patient@example.test');
  await page.getByLabel('Mobile number').fill('9876543210');

  await page.locator('.auth-top .language-selector select').selectOption('hi');

  await expect(page).toHaveURL(/#\/login\?mode=register$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expect(page.getByLabel('पूरा नाम')).toHaveValue('Test Patient');
  await expect(page.getByLabel('ईमेल पता')).toHaveValue('patient@example.test');
  await expect(page.getByLabel('मोबाइल नंबर')).toHaveValue('9876543210');
});
