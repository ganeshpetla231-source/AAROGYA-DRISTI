# Deployment runbook

The project includes starter manifests, but no cloud account, Atlas cluster, domain, service-account file, mail account, TURN provider, or Cloudinary account is connected from this workspace. No production deployment has been published or verified.

## 1. MongoDB Atlas

1. Create a production cluster in the selected region and a database user with only the app database permissions required by the service.
2. Restrict network access to the API host's documented egress ranges or a private network connection. Do not use `0.0.0.0/0` as a permanent rule.
3. Store the SRV URI as Render `MONGODB_URI`; URL-encode credentials and do not commit the URI.
4. Configure backups, retention, encryption, and an operational restore drill.

## 2. Cloudinary storage

Create a Cloudinary product environment and configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` as Render environment secrets. Alternatively, configure `CLOUDINARY_URL`. `FILE_STORAGE_DRIVER=cloudinary` is mandatory in production. Uploaded assets are encrypted by the application before storage and use Cloudinary's authenticated raw-asset delivery; downloads remain proxied through the API after its existing role and patient-scope checks. Keep the credentials server-side and never expose them through frontend environment variables. Existing local or S3-backed files must be migrated to Cloudinary before switching an existing database to the Cloudinary driver.

## 3. AI service on Render

Use the Python service in `render.yaml` (`rootDir: ai-service`, health path `/health`). Add a protected Google Cloud service-account secret file and set `GOOGLE_APPLICATION_CREDENTIALS` to its mounted path. Set `GOOGLE_CLOUD_PROJECT`, enable Speech-to-Text, Cloud Translation, and Text-to-Speech APIs with billing, and grant the service account only the corresponding API user roles. Set a random, high-entropy `AI_SERVICE_TOKEN` on both AI and API services; the API passes it server-to-server and AI routes reject unauthenticated calls. The local development placeholder is not valid in production. Review provider terms/privacy controls before sending any patient information. The image adapter remains a demo; do not use it for clinical decisions.

## 4. API on Render

Use the Node service in `render.yaml`; health path `/api/health`. Set:

- `NODE_ENV=production`, `MONGODB_URI`, and exact `CLIENT_URL=https://<your-vercel-domain>`.
- Unique `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SCREENING_IMAGE_ENCRYPTION_KEY`, and `PATIENT_AADHAAR_ENCRYPTION_KEY` values (at least 32 random characters each; JWT keys must differ). Keep the Aadhaar key separate and stable so registered Aadhaar values remain decryptable by authorized services if needed.
- `FILE_STORAGE_DRIVER=cloudinary`, the three `CLOUDINARY_*` credentials (or `CLOUDINARY_URL`), HTTPS `AI_SERVICE_URL`, and the same production `AI_SERVICE_TOKEN` set on the AI service.
- `STAFF_REGISTRATION_CODES` as JSON secrets, SMTP settings, and TURN credentials. Use unique staff codes and rotate operational credentials.
- `COOKIE_SAME_SITE=none` if frontend/API are cross-site; cookies are Secure and httpOnly in production.

Verify that logs contain request metadata only, error bodies do not include record data, and no secret values are printed. Health must report `database: connected` before routing traffic.

## 5. Frontend on Vercel

Import the repository with root directory at repository root and use `vercel.json`. Set `VITE_API_BASE_URL=https://<render-api-host>/api` for Production, Preview, and Development as appropriate. Add the exact deployed frontend origin to API `CLIENT_URL`; redeploy the API after changing it. Vite embeds this URL in public browser JavaScript, so it must be an API URL and never a secret or key.

## 6. Release checks

1. Use a staging Atlas database and staging Cloudinary environment. Seed only synthetic data.
2. Run `npm ci`, `npm test`, `npm run build`, and `python -m pytest ai-service/tests -q` in CI.
3. Verify HTTPS, CORS rejection for an unlisted origin, security headers, role-denied endpoints, refresh/revocation, QR consent/revocation/audit, multipart signature and size rejection, notification delivery/read, and analytics filters/privacy.
4. Run Playwright at desktop and mobile viewports; complete an authorized telemedicine test with two accounts and confirm the denied third-party room join.
5. Conduct a production threat-model and penetration review, provider privacy/contract review, vulnerability scan, and backup restore rehearsal before enabling real users.
6. Deploy services, check `/api/health` and `/health`, then run a smoke test using synthetic accounts and records only.

Do not claim a deployed release or “no critical security issues” until these external account, security review, and live acceptance steps have been completed.
