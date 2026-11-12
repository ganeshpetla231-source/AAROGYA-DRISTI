import { expect } from '@playwright/test';

const demoPatientEmail = 'patient.demo@aarogya.test';
const demoPatientPhone = process.env.E2E_PATIENT_PHONE || '+919876543210';

export async function signIn(page, identifier, requestedCategory, loginPath = '/#/login') {
  await page.goto(loginPath);
  const category = requestedCategory || (
    identifier === demoPatientEmail ? 'patient' :
      /doctor|ananya/i.test(identifier) ? 'doctor' :
        /admin/i.test(identifier) ? 'admin' : 'staff'
  );
  const categoryLabels = {
    patient: 'Patient · mobile OTP',
    doctor: 'Doctor login',
    admin: 'Administrator login',
    staff: 'Staff · ID and password'
  };
  await page.getByRole('button', { name: categoryLabels[category] }).click();

  if (category === 'patient') {
    if (process.env.PATIENT_OTP_DEV_MODE !== 'true') {
      throw new Error('Set PATIENT_OTP_DEV_MODE=true for patient E2E sign-in; this prevents sending live SMS.');
    }
    await page.getByLabel('Mobile number').fill(demoPatientPhone);
    const responsePromise = page.waitForResponse(response => response.url().includes('/api/auth/patient-otp/request'));
    await page.getByRole('button', { name: 'Send verification code' }).click();
    const response = await responsePromise;
    const payload = await response.json();
    if (!payload.data?.developmentCode) throw new Error('Patient E2E sign-in requires PATIENT_OTP_DEV_MODE=true in the test backend.');
    await page.getByLabel('Six-digit verification code').fill(payload.data.developmentCode);
    await page.getByRole('button', { name: 'Verify and continue' }).click();
  } else {
    const labels = {
      doctor: 'Doctor ID or email address',
      admin: 'Admin ID or email address',
      staff: 'Staff ID or email address'
    };
    const password = category === 'admin' ? process.env.INITIAL_ADMIN_PASSWORD : process.env.DEMO_PASSWORD;
    if (!password) throw new Error(`Set ${category === 'admin' ? 'INITIAL_ADMIN_PASSWORD' : 'DEMO_PASSWORD'} for E2E sign-in.`);
    await page.getByLabel(labels[category]).fill(identifier);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: /Sign in/ }).click();
  }
  await expect(page).toHaveURL(/\/(?:patient|doctor|admin)\/dashboard|\/app\//);
}
