import { test, expect } from '@playwright/test';

test('patient registration is available from the patient login screen', async ({ page }) => {
  await page.goto('/#/login');

  await page.getByRole('button', { name: 'New patient? Register here' }).click();

  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await expect(page.getByLabel('Full name')).toBeVisible();
  await expect(page.getByLabel('Mobile number')).toBeVisible();
});

test('patient registration shows the OTP field and lets patients edit their details', async ({ page }) => {
  await page.route('**/api/auth/patient-otp/request', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { developmentCode: '123456' } })
  }));
  await page.goto('/#/login?mode=register');
  await page.getByLabel('Full name').fill('Test Patient');
  await page.getByLabel('Street address').fill('12 Test Street');
  await page.getByLabel('Mandal').selectOption({ label: 'Paderu' });
  await page.getByLabel('Village / town').fill('Test Village');
  await page.getByLabel('Date of birth (optional)').fill('1990-01-15');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByLabel('Email address').fill('patient@example.test');
  await page.getByRole('button', { name: /Send verification code/ }).click();

  const otp = page.getByLabel('Six-digit verification code');
  await expect(otp).toBeVisible();
  await expect(otp).toBeFocused();
  await expect(page.getByLabel('Full name')).toBeDisabled();
  await expect(page.getByLabel('Date of birth (optional)')).toBeDisabled();
  await page.getByRole('button', { name: 'Edit registration details' }).click();
  await expect(page.getByLabel('Full name')).toBeEnabled();
  await expect(page.getByLabel('Full name')).toHaveValue('Test Patient');
  await expect(page.getByLabel('Date of birth (optional)')).toBeEnabled();
  await expect(page.getByLabel('Date of birth (optional)')).toHaveValue('1990-01-15');
});

test('home page shows patient sign-up beside sign-in', async ({ page }) => {
  await page.goto('/#/');

  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.locator('.marketing-nav-actions .nav-login[href="#/login"]')).toBeVisible();
  await expect(navigation.locator('.marketing-nav-actions .nav-login[href="#/register"]')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Already have an account? Sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New patient? Sign up' })).toBeVisible();
});
