# Aarogya Drishti Existing Project Analysis

**Audit date:** 2026-11-10  
**Scope:** The initial review of the existing workspace, source structure, configuration names/status, and local service health was read-only. After approval, two frontend/API contract fixes and regression tests were added. No environment values, database records, or existing data were changed.

## Executive summary

This is an established React/Vite, Express/Mongoose application with a separate FastAPI service, not a blank project. It contains substantial authentication, role dashboards, patient records, screening upload/review, appointment/video, education, notification, and analytics functionality. The frontend compiles successfully, and 13 selected backend unit tests passed.

It is **not currently verifiable end-to-end**: at the time of this audit, ports 5173, 5000, and 8000 were unavailable. The Windows MongoDB service was running and TCP port 27017 accepted a connection, but API-level database readiness could not be checked. The configured AI-service virtual environment is absent, MSG91 OTP credentials are blank, and SMTP settings are blank. A Gemini key is present in the backend environment, but its validity and model access could not be tested while the API was offline.

The audit found two client/API contract defects, both fixed after approval: the consultation-notes URL mismatch and an offline-screening header that conflicted with the production CORS allow-list. Other material gaps remain: the deliberately unavailable image-analysis endpoint, synthetic facility search/map content, no standalone questionnaire workflow, incomplete emergency booking support, and no separate doctor credential-document workflow.

## Post-approval implementation update

After review approval, the two confirmed client/API contract issues were corrected:

- The frontend consultation-notes helper now calls the existing `/telemedicine/appointments/:id/notes` route.
- Offline screening metadata sync no longer sends the CORS-blocked `Idempotency-Key` header; the request ID remains in the JSON body.
- Session restore now distinguishes an expired refresh token from a transient API/network outage, with English, Telugu, and Hindi user messages.
- Admin pending-doctor, active-doctor assignment, and patient lists now use backend pagination rather than stopping at 100 records.
- The user confirmed that existing roles and accounts must be preserved, with `hospital` mapped to the Hospital Manager product label.
- The user confirmed that administrators should receive aggregate analytics and operational metadata only, with no default access to patient-level clinical records.
- The user confirmed that Hospital Managers should receive facility operations and assignment metadata only; clinical access requires a separate clinician role.
- Backend routes, resource permissions, response projections, and dashboard data were updated to enforce these clinical-access boundaries; isolated tests and the production build pass, while live integration remains unverified.
- Added isolated regression tests for the client API contracts and clinical-access boundaries. The frontend production build and all 16 isolated backend unit tests pass. API integration against a live service/database has not been run.

## Evidence and limits

- Inspected frontend/backend/AI-service structure, route registration, representative controllers and services, Mongoose models, auth/session logic, upload/storage, telemedicine, i18n, CSS, environment-variable names, and existing project documentation.
- A production frontend build completed into a temporary directory, which was then removed.
- Ran 16 isolated backend unit tests that do not seed or write database data: all passed.
- Did not run the general backend test command: its script runs database seed scripts before tests. No database writes were made.
- Did not run browser end-to-end tests because the frontend and API servers were unreachable.
- The project brief PDF was not attached to the active workspace. A project PDF exists in Downloads, but no local PDF extraction utility/library was available and the browser could not access it as a trusted local file. Requirement comparison therefore uses the explicit requirements in the conversation plus the repository README and code, not a claim that the PDF was fully parsed.
- The workspace is not a Git repository, so this review could not compare branch history or pre-existing changes.

## Architecture and folder map

| Area | Existing structure and entry points |
|---|---|
| Frontend | React 18/Vite. Entry: `../frontend/src/main.jsx`; hash routing and language/auth providers; route shell in `../frontend/src/App.jsx`; feature-heavy `../frontend/src/components/`; API client in `../frontend/src/services/api.js`; English/Telugu/Hindi dictionaries under `../frontend/src/i18n/locales/`; global and per-feature CSS. |
| Backend | Node.js/Express. Server and Mongo connection in `../backend/src/server.js` and `../backend/src/config/db.js`; route registration in `../backend/src/app.js`; routes/controllers/services/middleware/utils are separated by responsibility. |
| Database | MongoDB/Mongoose. Model schemas and indexes are centralized in `../backend/src/models/index.js`; service methods enforce additional validation and record scope. |
| AI | Separate FastAPI app in `../ai-service/app/main.py`; Node calls it server-to-server for image analysis. Backend Gemini assistant code is in `../backend/src/services/geminiLiveService.js`. |
| Files | `../backend/src/services/fileStorageService.js` stores encrypted file objects using local private storage in development or S3-compatible storage when configured. |
| Realtime | Socket.IO for notifications/signaling and WebRTC for media; appointment participation is checked by backend telemedicine services. |

The Vite development server proxies `/api` and `/socket.io` to localhost port 5000. The expected local ports are frontend 5173, API 5000, AI service 8000, and MongoDB 27017.

## Current runtime and configuration check

| Check | Result at audit time |
|---|---|
| Frontend `http://localhost:5173` | Unavailable. |
| Backend `http://localhost:5000/api/health` | Unavailable; database/API health response could not be collected. |
| AI `http://localhost:8000/health` | Unavailable. |
| MongoDB Windows service / port 27017 | Service running; local TCP connection succeeded. This does not prove that the configured URI/database is usable by the application. |
| Backend `.env` | Present. Required variable names were checked without displaying values. MongoDB URI, Gemini key, AI service token/URL, JWT secrets, image-encryption key and local storage driver were non-empty. MSG91 auth key/template, SMTP host/user/password, S3 bucket and TURN configuration were blank. |
| Frontend `.env` | Present; no variable assignments were found. `frontend/.env.example` sets the API base path to `/api`, which the Vite proxy supports. |
| AI `.env` | Present; names for cloud speech configuration and AI service token exist. Values were withheld and not validated. |
| AI Python virtual environment | `ai-service/.venv` was absent. The repository start script explicitly exits when this virtual environment is missing. |

The repository root `.gitignore` excludes `.env`, `node_modules`, `dist`, Python virtual environments, and private backend storage. Do not copy secret values into reports, source, frontend bundles, or chat. Presence of a Gemini key is not proof that the key is valid, enabled for the configured model, or safe/appropriate for clinical image analysis.

## Feature and integration findings

| Priority | Finding | Evidence / impact |
|---|---|---|
| Resolved | Video consultation notes used a frontend URL that was not registered by the backend. | The frontend helper now calls `/telemedicine/appointments/:id/notes`, matching the registered route. A regression test covers the frontend helper, backend route, and API mount. Live API behavior remains unverified. |
| P1 | Oral-image AI screening is unavailable by design, not an operating Gemini model. | `../ai-service/app/main.py` validates image format/quality, then returns HTTP 503 because no validated oral-image model is configured. `../backend/src/services/screeningService.js` depends on that endpoint. Uploaded image screening therefore cannot produce an AI result at present; this is a safe failure, not a diagnosis. |
| P1 | Real patient OTP delivery is not configured in the current backend environment. | MSG91 auth key and template ID are blank. `../backend/src/services/msg91Service.js` returns 503 when either is missing. The OTP path is implemented, but real SMS delivery cannot work until provider setup is completed and tested. |
| P1 | Application services are not running at audit time. | Frontend/API/AI health checks were unreachable. The shared browser tab did not establish current runtime health. Database process availability alone is not sufficient. |
| Resolved | Offline metadata sync sent an unapproved CORS header. | The frontend no longer sends `Idempotency-Key`; its request ID continues in the body. The backend CORS allow-list remains unchanged. A regression test ensures the helper does not reintroduce the header. |
| P2 | Facility search/map results are sample data rather than live provider discovery. | `../frontend/src/components/MapsPage.jsx` filters `../frontend/src/data/sampleFacilities.js`, whose entries are explicitly fictional. The component only matches a sample name to loaded hospitals for referral selection; location permission does not calculate distances/routes from real facility coordinates. |
| P2 | Patient symptom questionnaire is not a dedicated, persisted workflow. | Symptom strings exist in offline screening metadata and voice/transcript data, but there is no versioned questionnaire response model or complete patient questionnaire endpoint. |
| P2 | Patient self-service image upload is not established. | The screening upload is a care-worker workflow requiring a selected patient. The route is now limited to ASHA and doctor roles; patient self-upload is not implemented. |
| P2 | Emergency/urgent appointment workflow is not modeled separately. | `Appointment` has schedule, mode, provider, hospital, and status but no priority/triage or emergency request fields. A normal booking slot should not be treated as urgent clinical response. |
| P2 | Production video reliability depends on TURN not currently configured. | TURN URLs/shared secret are blank. STUN-only WebRTC may work on permissive networks but may fail behind restrictive NAT/firewalls; no live call test was possible. |
| P2 | Password-reset email delivery is unconfigured. | SMTP settings are blank. Development can expose a reset token in the response; production code returns 503 when SMTP host/from are missing. Do not use the development token behavior in production. |
| P2 | Admin management UI fetches only the first 100 patients and up to 100 doctors per status. | Backend supports pagination, but `../frontend/src/components/AdminDashboard.jsx` requests `limit: 100` and does not expose page navigation. Larger deployments would leave records inaccessible from that dashboard view. |
| P3 | Account language schema and application-supported languages differ. | `User.language` permits `ta` and `kn`; frontend and auth flows support `en`, `te`, and `hi`. Keep one agreed supported set to avoid stored preferences the UI cannot select. |
| P3 | One voice widget file is a likely unused duplicate/legacy candidate. | `../frontend/src/components/VoiceAssistantWidget.jsx` has no import/reference in the frontend source scan. `PersistentVoiceAssistant` is mounted in `FloatingWidgets`; dashboard `VoiceAssistant` serves a different transcript workflow. Confirm before deleting anything. |
| P3 | Scaffold directories are currently empty. | `frontend/src/pages`, `layouts`, `hooks`, and `assets` contain only `.gitkeep` placeholders. This is not a runtime defect, but the current structure centralizes screens in a large components directory. |

## MongoDB and data-model review

Existing models cover users, patients, hospitals, appointments, doctor availability, consultations, screenings, consent, referrals, medical records, prescriptions, clinical documents, notifications, audit logs, QR tokens, OTP challenges, transcripts, education, and operational directories. Existing representations should be reused rather than creating duplicate collections simply to match names in a requirements list. See `DATABASE_SCHEMA.md` for the detailed mapping and indexes.

Material model considerations:

- `Patient.user` is optional and has no unique index. This can be appropriate for staff-created records without a portal account, but the schema does not enforce one linked patient profile per user. If that is the intended invariant, verify current data first and add a partial unique constraint only through an approved migration.
- `Consultation.chatMessages` is an embedded growing array without a document-level cap. Per-message length/rate checks do not bound lifetime size; MongoDB documents have a hard 16 MiB limit. Define a retention/maximum policy or move long-lived messages to referenced records after approval.
- Consent is represented by both `Consent` documents and screening-image consent fields on `OralScreening`. Define which record is authoritative for each purpose and ensure revocation affects subsequent processing/access.
- `Consent.grantedAt` is not schema-required when `granted` is true; service-level guarantees and stored data were not verified.
- Mongoose has strict schema validation and indexes, but live index presence, legacy data integrity, collection sizes, duplicate patient-user links, and validators in MongoDB were not queried.
- Some references are intentionally separate because clinical records/files have independent lifecycles; keep file bytes in object storage rather than embedding them in MongoDB.

## Security and privacy review (static, not penetration testing)

**Positive controls observed:** short-lived access JWTs, refresh-token hash storage/rotation, active-account and auth-version checks, bcrypt password hashing, OTP challenge expiry/attempt limits, timing-safe hash comparison, role guards, patient/doctor/facility scoping in services, API rate limits, Helmet, explicit CORS origins, upload size/MIME/signature checks, AES-GCM application-level file encryption, private object keys, user-scoped notifications, and appointment participant checks for video rooms.

**Items needing attention/verification:**

1. The session restore path in `../frontend/src/context/AuthContext.jsx` catches refresh errors and clears user state without distinguishing expired authentication from API/database outage. This can make a service outage look like a logged-out user; no server response was available to diagnose the earlier reported 401.
2. AuditLog exists and important mutations write audit events, but the reviewed code does not establish a comprehensive audit trail for all sensitive reads, exports, or administrator access.
3. Use default development JWT/service tokens only locally. Production guards reject placeholder secrets, but deployment configuration and secret rotation were not independently reviewed.
4. Ensure seeded demo identities/default demo passwords are never enabled in production.
5. A production setup needs verified private S3 storage, HTTPS, least-privilege credentials, backup/retention rules, and TURN. The current local configuration is not production evidence.
6. This review is static source inspection plus selected unit tests, not a penetration test, external dependency scan, database-data review, or compliance/legal assessment.

## Validation results

- Frontend production build: **passed** (3106 modules transformed); Vite warned the main JavaScript chunk is about 1.49 MB minified, above the 500 kB advisory threshold.
- Selected isolated backend unit tests: **13 passed, 0 failed** (`security.unit.test.js`, `telemedicine.unit.test.js`, `education-videos.unit.test.js`).
- Backend API integration, OTP provider, MongoDB data/model state, AI endpoint, and browser e2e: **not validated** because the application services/provider were unavailable and the general backend test script seeds the database.

## Overall status

The application has a substantial working code foundation, but it is not operationally verified end-to-end and does not meet all stated product requirements yet. Remaining release blockers include service startup/health, real OTP provider configuration, safe and honest screening behavior (currently no model), real facility data, emergency workflow, and unresolved clinical/privacy decisions. The session-restore and admin-list updates have only been build- and source-validated, not browser-tested.
