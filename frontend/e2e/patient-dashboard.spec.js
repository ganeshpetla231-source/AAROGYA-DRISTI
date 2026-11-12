import { test, expect } from '@playwright/test';
import { signIn } from './auth.helpers.js';

test('patient dashboard keeps its primary navigation and all patient features accessible', async ({ page }) => {
  test.skip(process.env.PATIENT_OTP_DEV_MODE !== 'true', 'Set PATIENT_OTP_DEV_MODE=true for local patient E2E sign-in.');
  await signIn(page, 'patient.demo@aarogya.test', 'patient');

  const nav = page.locator('.sidebar nav');
  const buttons = nav.locator('button');
  await expect(buttons.first()).toBeVisible();
  const getLabels = () => buttons.evaluateAll(items => items.filter(item => !item.classList.contains('patient-more-toggle')).map(item => {
    const clone = item.cloneNode(true);
    clone.querySelectorAll('.nav-icon, .nav-count').forEach(child => child.remove());
    return clone.textContent.trim();
  }));
  const primaryLabels = [
    'Dashboard', 'Book Appointment', 'Video Consultation', 'Screening', 'My Records',
    'Notifications', 'Settings'
  ];
  const additionalLabels = [
    'My Profile', 'My QR Card', 'Oral Health Education', 'Government Hospital Directory',
    'Educational Videos', 'Voice Assistant', 'My Transcripts', 'My Referrals',
    'Maps & care locations'
  ];

  expect(await getLabels()).toEqual(primaryLabels);
  await nav.locator('.patient-more-toggle').click();
  expect((await getLabels()).slice(primaryLabels.length)).toEqual(additionalLabels);
  await expect(page.getByText('Welcome back', { exact: false })).toBeVisible();
  await expect(page.locator('.patient-dashboard-stat')).toHaveCount(4);
  await expect(page.locator('.patient-quick-action')).toHaveCount(4);
  await expect(page.locator('.patient-dashboard-panels > article')).toHaveCount(3);

  for (const label of [...primaryLabels, ...additionalLabels]) {
    const item = buttons.filter({ hasText: label });
    await item.click();
    await expect(item).toHaveClass(/nav-current/);
    if (label === 'Book Appointment') {
      await expect(page.locator('.clinic-appointments-workspace')).toBeVisible();
      await expect(page.getByText('Find a doctor by department')).toBeVisible();
    }
    if (label === 'Video Consultation') {
      await expect(page.locator('.telemedicine-workspace')).toBeVisible();
      await expect(page.getByText('Book a video appointment', { exact: false })).toBeVisible();
    }
    if (label === 'My Profile') {
      await expect(page.locator('.patient-profile-form')).toBeVisible();
      await expect(page.locator('.patient-photo-upload input[type="file"]')).toBeAttached();
    }
    if (label === 'Screening') {
      await expect(page.getByRole('note')).toContainText('not a diagnosis');
    }
    if (label === 'My Records') await expect(page.locator('.patient-screening-history')).toBeVisible();
    if (label === 'Voice Assistant') {
      await page.getByRole('button', { name: 'Open the AI voice assistant' }).click();
      await expect(page.getByRole('dialog', { name: /voice/i })).toBeVisible();
    }
    if (label === 'My Referrals') await expect(page.locator('.patient-referrals-panel h2')).toHaveText('My Referrals');
  }

  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
});
