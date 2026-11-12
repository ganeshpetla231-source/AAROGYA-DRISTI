import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../backend/.env', import.meta.url)) });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:5173', localStorage: [{ name: 'aarogya-language', value: 'en' }] }] },
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {})
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node backend/src/server.js', cwd: '..', url: 'http://localhost:5000/api/health', reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'node node_modules/vite/bin/vite.js frontend --host 0.0.0.0', cwd: '..', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 60_000 }
  ]
});
