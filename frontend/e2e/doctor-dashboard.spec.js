import { test, expect } from '@playwright/test';
import { signIn } from './auth.helpers.js';

test('doctor sidebar exposes only clinical pages and each item selects its route', async ({ page }) => {
  test.skip(!process.env.DEMO_PASSWORD, 'Seed a development doctor account and set DEMO_PASSWORD.');
  await signIn(page, 'ananya.demo@aarogya.test', 'doctor');

  const nav = page.locator('.sidebar nav');
  const buttons = nav.locator('button');
  const labels = await buttons.evaluateAll(items => items.map(item => {
    const clone = item.cloneNode(true);
    clone.querySelectorAll('.nav-icon, .nav-count').forEach(child => child.remove());
    return clone.textContent.trim();
  }));
  const expected = [
    'Overview', 'Patients', 'Appointments', 'Referrals', 'Doctor review queue',
    'Screening history', 'Scan patient QR', 'Clinical workspace', 'Reports & analytics', 'Settings'
  ];
  expect(labels).toEqual(expected);

  await expect(page.locator('.overview-photo-stat')).toHaveCount(4);
  await expect(page.locator('.role-dashboard-greeting')).toContainText('Welcome back');
  await expect(page.locator('.role-dashboard-hero h1')).toContainText('AAROGYA');
  await expect(page.locator('.role-overview-quick-actions .role-overview-action')).toHaveCount(4);
  await expect(page.locator('.doctor-overview-panels .doctor-overview-card')).toHaveCount(3);
  for (const label of expected) {
    const item = buttons.filter({ hasText: label });
    await item.click();
    await expect(item).toHaveClass(/nav-current/);
    if (label !== 'Overview') await expect(page.locator('.page-heading h1')).toBeVisible();
    if (label === 'Settings') {
      await expect(page.getByRole('heading', { name: 'Professional profile' })).toBeVisible();
      await expect(page.locator('.doctor-profile-form')).toBeVisible();
    }
  }

  await page.goto('/#/app/doctor?voicePage=voice-review');
  await expect(nav.locator('button.nav-current')).toContainText('Overview');
  await expect(buttons).toHaveCount(expected.length);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(390);
  const menuToggle = page.locator('.mobile-menu');
  await menuToggle.click();
  await expect(page.locator('.sidebar')).toHaveClass(/sidebar-open/);
  await page.locator('.close-sidebar').click();
  await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar-open/);
});
