# Aarogya Drishti

Phase 12 security, testing, and deployment preparation for the Aarogya Drishti demonstration platform. The app includes the 12-step roadmap; role-based dashboards; patient QR and consent workflows; oral screening with a clearly labelled demonstration AI adapter; multilingual voice; clinical records; referrals and maps; telemedicine; live notifications; and aggregate analytics. All seeded records are synthetic and the AI adapter is not clinically validated.

## Requirements

- Node.js 20.19+ or 22.12+, npm
- MongoDB 7+ locally, or a MongoDB Atlas SRV URI
- Python 3.10+ for the FastAPI speech and image service
- A Chromium browser for browser end-to-end tests (`npx playwright install chromium`)

## Local install and run

```sh
npm ci
```

`npm run seed --workspace backend` creates synthetic development records and requires an explicitly configured `DEMO_PASSWORD`; it refuses to run in production. It is not required for real user registration or sign-in.

Create the local environment files from their `.env.example` files. Configure a unique administrator ID, email, and password in `backend/.env`, then provision the administrator from the backend:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
Copy-Item ai-service/.env.example ai-service/.env
```

Set `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_STAFF_ID`, and `INITIAL_ADMIN_PASSWORD` in `backend/.env`, then run:

```powershell
npm run provision:admin --workspace backend
```

The command creates a MongoDB administrator account without a public registration route. Remove the `INITIAL_ADMIN_*` values after provisioning. Additional administrators must also be provisioned from the server with the same command. For development sample records only, set `DEMO_PASSWORD` explicitly before running the demo seed. Create the local Python environment as follows:

```powershell
python -m venv ai-service/.venv
.\ai-service\.venv\Scripts\python.exe -m pip install -r ai-service/requirements.txt
```

Optionally populate synthetic workflow samples in a development database with `npm run seed --workspace backend` after setting `DEMO_PASSWORD`. The seed script is not required for live account creation and refuses to run in production.

Set `MONGODB_URI`, `FILE_STORAGE_DRIVER=cloudinary`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `backend/.env` to store uploads in Cloudinary. Alternatively, configure a `CLOUDINARY_URL`. For offline local development, explicitly set `FILE_STORAGE_DRIVER=local`; uploaded files then remain encrypted in `backend/storage/private`. Start the backend and frontend together with:

```sh
npm run dev
```

For the full local stack, start all three services together instead:

```powershell
npm run dev:full
```

This requires Python 3.10+ and the AI service dependencies from `ai-service/requirements.txt`. To run only that service:

```sh
npm run dev:ai
```

Open http://localhost:5173. The backend health check is http://localhost:5000/api/health and reports MongoDB connectivity. Local development can store encrypted uploads in `backend/storage/private`; production uses authenticated Cloudinary raw storage for encrypted uploads.

On a first visit, choose English, Telugu, or Hindi before entering the application. The choice is saved in browser storage, applies immediately across the current page, and is restored on later visits; signed-in users also have the preference saved to their account. English is not preselected for new visitors. To intentionally configure an initial language for a deployment, set `VITE_INITIAL_LANGUAGE` to `en`, `te`, or `hi` at frontend build time.

### Role dashboards and account access

Patient accounts can self-register. Staff and administrator accounts cannot be created through public registration: an authenticated administrator provisions doctor accounts from the Admin dashboard and must approve them before sign-in. Existing operational staff roles remain available through their existing administrator-controlled accounts.

After sign-in, patient, doctor, and administrator accounts are routed to `/patient/dashboard`, `/doctor/dashboard`, and `/admin/dashboard`. The patient profile APIs resolve the patient record from the authenticated account (`GET/PUT /api/patients/me`); screening and appointment history are available from `/api/patients/my-screenings` and `/api/patients/my-appointments`. Admin doctor approval, patient assignment, and aggregate statistics are under `/api/admin`. Doctor record access is limited to patients assigned to that doctor or linked by the existing appointment/referral workflows. Existing resource, clinical, screening, QR, and transcript APIs retain their server-side ownership and relationship checks.

The doctor **Review screenings** workspace uses `GET /api/screenings/review-queue` with optional `q`, `from`, `to`, and `reviewStatus` filters, and saves an independent clinical decision through `PATCH /api/screenings/:id/review`. Reviews are appended to screening history; optional referrals link back to the screening and appear in the existing patient/referral records. Only doctors with an existing care relationship can open a screening or its private image. The queue distinguishes preliminary AI observations from clinician findings and also supports patient-submitted screenings for which no AI result was generated.

Patient sign-in and registration use mobile OTP verification through MSG91. Configure `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID`, and (if needed) `MSG91_COUNTRY_CODE` in `backend/.env`; the MSG91 OTP template must be enabled for the account and display its supplied OTP. Do not put these credentials in frontend settings. For local-only workflow testing without SMS, explicitly set `PATIENT_OTP_DEV_MODE=true` while `NODE_ENV` is not `production`; this generates a random code and labels the response as development-only. The default country code is India (`91`), and a ten-digit local number is normalized to `+91`; international numbers must include `+` and their country code. Verification codes expire after five minutes by default, have a one-minute resend cooldown, and are limited to five attempts. Existing patient accounts must have a verified, normalized phone number on their User record before OTP sign-in can find them. The legacy password registration endpoint is disabled; patient registration requires OTP verification. Optional Aadhaar values are encrypted before being saved, including in the pending OTP challenge; set a unique, stable `PATIENT_AADHAAR_ENCRYPTION_KEY` (at least 32 characters) in production.

Password sign-in categories are enforced by the backend against the MongoDB account role, not by the frontend selection. Doctor login accepts only approved doctor accounts, administrator login accepts only administrator accounts, and staff login accepts operational roles (`asha`, `specialist`, `hospital`, or `district`). Administrators create ASHA, specialist, and district accounts in the dashboard's Staff section; hospital-manager accounts are created through hospital provisioning, and doctors through the doctor approval workflow. Generic user APIs cannot create accounts or change account roles.

Patient oral-image analysis sends the consented image from the authenticated backend to Gemini using `GEMINI_API_KEY` and `GEMINI_ASSISTANT_MODEL` (defaults to `gemini-3.8-flash`). The report includes a visible finding, cautious possible causes when the image supports them, and next steps; Gemini never receives the API key from the browser. Results are preliminary image observations, not a diagnosis. Do not upload identifiable images unless the patient has consented, and arrange an in-person dental or medical examination for concerning or persistent changes.

Staff accounts authenticate with their assigned `staffId` or email and password. Admin-created doctor and staff accounts receive generated IDs when one is not supplied. Hospital manager accounts are created through hospital provisioning.

### Enable the AI voice assistant

The floating assistant supports real-time, two-way voice and text conversations in English, Telugu, and Hindi through Gemini Live. Audio is captured locally, resampled to 16 kHz PCM, and streamed in short chunks only while voice mode is active. Gemini's streamed speech and transcription events drive the speaking state, transcript, and conversation history; the microphone waveform reflects measured audio levels. Users can interrupt speech, mute the microphone, change response language, adjust playback speed, and reset the conversation. Text mode uses the same Live session and spoken response. If browser microphone or WebSocket support is unavailable, typed questions remain available.

1. Create a Gemini API key in Google AI Studio.
2. Set `GEMINI_API_KEY` in `backend/.env`. Optionally set `GEMINI_ASSISTANT_MODEL` (defaults to `gemini-3.8-flash`). The key stays on the backend; never put it in `frontend/.env`, source control, or chat.
3. Restart the backend and frontend with `npm run dev`, then sign in and open the floating microphone button. Allow microphone access to use voice input; text mode does not require microphone access. The browser receives a short-lived, single-use Gemini Live token from the authenticated backend; the Gemini API key is never sent to the browser.

Gemini Live token requests are authenticated, rate-limited, and validated; conversations are not stored by this app. During voice mode, audio is streamed to Gemini; during text mode, typed messages are sent to Gemini. Review provider data-use terms and do not share identifying information, passwords, or patient records. The assistant provides general oral-health education only, not diagnosis or treatment, and cannot access patient records. Seek professional evaluation for concerning symptoms. Gemini usage may incur billing and depends on provider availability, quotas, and model access. Google Cloud Speech-to-Text/Translation/Text-to-Speech remain separate dependencies for the authenticated clinical transcript workflow.

## Video consultations

Patients book a doctor's published video slot. The assigned doctor accepts or declines the pending request from Appointments; confirmed participants then join the same authenticated consultation room. The call uses browser WebRTC media and Socket.IO signaling, and stores appointment/chat/doctor-note data only—audio/video recordings are not created. Patient history shown in the doctor call panel comes from the existing doctor-authorized clinical record API. AI-assisted screening remains informational and is not a diagnosis.

For local testing, sign in as a patient and a doctor in two separate browser profiles/windows. With a future slot published by that doctor, book it as the patient, accept the request as the doctor, then join on both accounts. Use `localhost` (or HTTPS) and grant microphone/camera permissions; browsers deny media capture on insecure non-local origins. Test mute, camera, camera switch on a mobile device, audio-only mode, chat, end-call, and the request decline path.

For production, deploy behind HTTPS so Socket.IO uses secure WebSockets and browser media permissions are available. Configure `TURN_URLS` with your TURN server's `turn:`/`turns:` endpoints and set `TURN_SHARED_SECRET` only in the backend environment to the shared secret for TURN REST (time-limited HMAC) credentials. The API returns one-hour per-user credentials; never put the shared secret in Vite/frontend environment variables. STUN alone may not connect clients behind restrictive NAT/firewalls, so a secured TURN deployment is required for reliable calls. Allow the chosen TURN UDP/TCP/TLS ports through the network firewall and monitor service capacity. The current room and doctor-busy coordination is process-local; use one signaling instance, or add a shared Socket.IO adapter and distributed busy lock before horizontal scaling. No managed video vendor or recording service is used.

## MongoDB clinical and assistant data

The app reuses the existing collections instead of creating parallel clinical records: `Appointment` is the doctor appointment collection; `Consultation` is the video consultation (one per appointment, with doctor notes and text chat messages embedded); `EducationVideo` is the verified educational video catalog; and `EducationVideoHistory` is per-authenticated-user viewing history. `VoiceTranscript` remains the separate patient symptom-intake transcript and is not used as an AI assistant chat. New `VoiceConversation` and `VoiceMessage` collections store assistant text turns for signed-in patient and doctor accounts. A patient conversation links to that account's existing `Patient` record; a doctor's conversation links to the authenticated doctor `User`. Audio/video media is never stored. The schemas use Mongoose timestamps, strict field validation, owner/relationship indexes, and access is scoped to authenticated IDs.

| Collection/model | Ownership and purpose | Indexes / validation |
| --- | --- | --- |
| `VoiceConversation` | Authenticated owner; links patient conversations to `Patient` and doctor conversations to `User` | owner and `lastMessageAt`; supported language enum; timestamps |
| `VoiceMessage` | Owner + conversation; user/assistant text, language and timestamp | `(conversation, createdAt)`, `(owner, createdAt)`; role/language enums; 10,000 character limit; strict schema |
| `EducationVideo` | Admin-curated and published catalog | unique slug; status/category and localized search indexes; HTTPS source/attribution validation |
| `EducationVideoHistory` | Authenticated user + published video | unique `(user, video)` and `(user, lastWatchedAt)`; watch count validation |
| `Appointment` | Existing patient record + assigned provider | patient/provider schedules and status indexes; visit mode/status enums |
| `Consultation` | Existing appointment, patient and provider | unique appointment and patient index; notes limit; chat message language/text limits; room ID excluded by default |
| Consultation notes | `Consultation.notes` embedded in the consultation document | Only the assigned doctor may write notes; 5,000 character limit |

Assistant conversation API (all routes require a bearer access token; history is restricted to the authenticated owner):

| Method and path | Purpose | Request / response |
| --- | --- | --- |
| `POST /api/assistant/conversations` | Start a text-only history record | `{ "language": "en" }` (also `te`, `hi`, `auto`); returns the conversation |
| `GET /api/assistant/conversations?page=1&limit=20` | List own conversations, newest first | `{ items, pagination: { page, limit, total, pages } }` |
| `POST /api/assistant/conversations/:id/messages` | Save one completed turn | `{ "language": "en", "messages": [{"role":"user","text":"..."},{"role":"assistant","text":"..."}] }` |
| `GET /api/assistant/conversations/:id/messages?page=1&limit=20` | Read own messages oldest first | `{ items, pagination }` |
| `DELETE /api/assistant/conversations/:id` | Delete own conversation and messages | `{ id, deleted: true }` |

Both pagination endpoints default to 20 records and cap page size at 50. The assistant saves transcript text only after a completed turn; its microphone audio continues to stream to Gemini and is not persisted. Reset deletes the saved conversation. Other relevant APIs are `GET /api/voice-transcripts?page=1&limit=50` (role/relationship-filtered symptom transcripts), `GET /api/education/videos/history?page=1&limit=20`, `POST /api/education/videos/:id/views`, and the authenticated `/api/telemedicine` appointment, room, and notes routes. History responses include `{ items, pagination }`; video viewing is limited to the authenticated account, and clinical record routes enforce patient/doctor relationships.

Run the database-backed integration suite against the configured test MongoDB after loading demo accounts with `npm run seed --workspace backend` and `npm run seed:education --workspace backend`. The tests use randomized records and remove their created records and refresh sessions. Do not point test/seed commands at production data.

## Test and build

```sh
npm test
npm run build
```

## Interactive topic experience

The public home screen starts with the animated oral-health illustration; activating it reveals the 12-topic navigation. Each topic has a shareable route at `/#/topics/<topic-slug>`, with a localized detail page, workflow, benefits, related-topic links, and return navigation. English, Telugu, and Hindi use the saved device preference when signed out and the authenticated account preference when signed in; account preferences are loaded on session restore and updated through `PUT /api/auth/language`. The AI screening topic also includes translated oral-health safety guidance and WHO, NCI, and NHS links; the illustration and AI output are not diagnoses.

Topic titles, translations, color accents, icons, diagram labels, and page content are maintained in `frontend/src/data/topicExperience.js`. The central non-clinical mouth illustration is an inline SVG in `frontend/src/components/TopicNavigation.jsx`; edit that SVG to change the home illustration. Topic-specific detail diagrams use the Lucide icon selected in the topic data plus its localized workflow labels. For a licensed replacement image, add the asset under `frontend/src/assets`, render it in `TopicVisual`, and include localized descriptive alt text, a caption, and source attribution.

The Playwright coverage for the landing interaction, all topic routes, language switching, and mobile layout is in `frontend/e2e/phase12.spec.js`. Run it with `npm run test:e2e --workspace frontend` after installing Chromium as described under Requirements. Patient sign-in tests use the synthetic patient fixture and require `PATIENT_OTP_DEV_MODE=true` in a non-production `backend/.env`; set `DEMO_PASSWORD` and seed the test data first. The administrator dashboard test runs when an administrator has been provisioned for the E2E environment.

## Voice assistant privacy and fallback

The floating widget is available across public and signed-in pages, but starting a Gemini conversation requires an authenticated account. It includes automatic language detection with a manual English, Telugu, or Hindi override, transcript display, session conversation history, microphone mute, stop speech, adjustable playback speed, and conversation reset. While voice mode is active, microphone audio is streamed to Gemini and is not recorded by this app. Do not speak passwords, identifying details, or patient-record information. Closing the widget stops microphone capture and speech playback. Gemini Live session-resumption handles are used when the user reconnects after an interruption. Configuration, network, permission, and speech errors are shown in the selected UI language.

## Oral health education library

The role-based dashboard includes an English, Telugu, and Hindi oral health education library with topic filters, multilingual search, printable articles, safety guidance, and an editor/reviewer workflow. After the usual backend database is available and an authorized account exists, add the starter articles with:

```sh
npm run seed:education --workspace backend
```

This additive seed creates 12 translated draft articles only when their slugs are absent; it does not change patient records, accounts, credentials, or existing articles. Seeded clinical content is explicitly marked **unreviewed** and is not visible to public readers until a doctor or specialist reviews and publishes it. A qualified clinician must verify the translations and medical advice before publication. Medical reviewers can use the education library’s **Manage articles** workflow; administrators can create, edit, and archive articles. No additional environment variables or database migration are required.

The public API is `GET /api/education` and `GET /api/education/:slug`; only reviewed, published articles are returned. Authenticated editors use `/api/education/manage`; doctor and specialist roles record medical review and publish. Medical sources included with the starter articles link to WHO, NCI, and NHS patient information.

### Educational video library

The separate **Educational videos** dashboard page provides nine topic categories, localized search and explanations, responsive YouTube embeds, source/license attribution, available-caption preferences, related topics, and per-account viewing history in MongoDB. The starter catalog currently includes three attributed videos; additional records can be created and published by an administrator through `POST /api/education/videos/manage` and `POST /api/education/videos/manage/:id/publish`. Video records are constrained to canonical YouTube watch URLs and require English, Telugu, and Hindi metadata plus source and license notes. Playback uses YouTube's standard embedded player; videos are not copied, downloaded, or rehosted. Uploaded video files are not supported. Run `npm run seed:education --workspace backend` to add starter video records; existing video curation and publication status is preserved.

Signed-in users can read `GET /api/education/videos/history`; selecting a published video records or updates their own history at `POST /api/education/videos/:id/views`. Public callers cannot read histories or create/publish videos. Captions depend on what the original video publisher provides; available tracks may differ by video and language.

Each video detail view also includes an AI explanation panel. It sends the published video ID with a question to the existing authenticated `POST /api/assistant/message` endpoint; the backend loads the trusted metadata itself and passes only the localized title, description, explanation, symptoms, precautions, and related topics to Gemini. The panel supports typed questions, browser speech recognition where available, and speech-synthesis replay. It does not upload video or claim a transcript exists. Its handoff button can pass the same curated context into the existing live Voice Assistant.

## Healthcare worker management

The authenticated `/#/healthcare-workers` page is available to admin and district accounts (the app uses React Router's existing hash-based routing). The API supports paginated/filterable directory reads (`GET /api/healthcare-workers`), profile reads (`GET /api/healthcare-workers/:id`), database-derived statistics (`GET /api/healthcare-workers/stats`), registration (`POST /api/healthcare-workers`), profile updates (`PATCH /api/healthcare-workers/:id`), and activation changes (`PATCH /api/healthcare-workers/:id/status`). Admins can manage all records; district administrators are restricted to their assigned district. Other roles are denied access by the backend. Administrative changes are audited, and worker records do not contain or return authentication credentials.

Worker profiles are separate staff-directory records and do not create login accounts. PHC assignment uses the existing `Hospital` model; screening, patient, referral, and appointment totals are read from existing records. Mandal and village values remain profile text fields because this project does not currently have separate Mandal/Village management models or a Sync Centre module. The `HealthcareWorker` collection and indexes are created by Mongoose; there is no migration or seed step, and no demo workers are created.

`npm test` seeds synthetic application data and education drafts, runs backend unit/API/QR/authorization tests, then launches the local API and Vite server for Playwright integration and mobile viewport tests. Install the browser once with `npx playwright install chromium`. FastAPI tests run separately:

```sh
python -m pip install -r ai-service/requirements-dev.txt
python -m pytest ai-service/tests -q
```

See [development sample-data guide](docs/DEMO_ACCOUNTS.md) for the development-only seeded records. Seed passwords must be explicitly configured with `DEMO_PASSWORD`; never seed demo data in production. Administrator login credentials are never seeded.

## ITDA Paderu government health directory

Seed or refresh the supplied directory records with `npm run seed:directory --workspace backend`. The operation is idempotent and stores directory records in the existing MongoDB `Hospital` collection using unique `directoryKey` values. PHC telephone numbers and PIN codes are stored as strings. No additional environment variables are required.

Public, read-only JSON endpoints:

| Method and path | Purpose |
| --- | --- |
| `GET /api/government-directory` | Hospitals, PHCs, DMHO contact, and summary counts |
| `GET /api/government-directory/summary` | Hospital, PHC, mandal, bed, and mandal-wise counts |
| `GET /api/government-directory/hospitals` | Four listed government hospitals |
| `GET /api/government-directory/hospitals/:id` | One listed government hospital |
| `GET /api/government-directory/phcs` | PHCs; optional `mandal` and `q` filters |
| `GET /api/government-directory/phcs/mandal/:mandalName` | PHCs in one mandal |
| `GET /api/government-directory/phcs/search?q=` | Search PHC name, mandal, PIN code, and phone |
| `GET /api/government-directory/phcs/:id` | One listed PHC |
| `GET /api/government-directory/dmho` | District Medical and Health Officer contact |

The displayed contact values and bed counts are the information supplied for this directory. Phone numbers are listed contact-person numbers and do not confirm current availability; the page tells users to verify numbers with the DMHO office. Existing authenticated `/api/hospitals` clinical workflows remain separate.

## Security and operations

- Helmet headers, strict explicit-origin CORS, request-size limits, API/auth/upload rate limits, and HTTPS-only production origin validation are enabled.
- Access tokens expire, refresh tokens are httpOnly cookies, refresh-token IDs are stored hashed and rotated, and account `authVersion` invalidates access tokens after password changes, role changes, and logout.
- User-controlled writes are allowlisted, role/relationship scopes are checked server-side, generic appointment writes cannot bypass slot booking, and district dashboards expose aggregate analytics rather than individual patient records.
- Image/audio/report uploads are size/MIME/signature checked. Clinical files are AES-256-GCM encrypted before local development storage or authenticated Cloudinary storage; Cloudinary credentials remain server-side and clinical downloads remain behind API authorization.
- API errors and audit metadata omit medical content. Audit entries retain actor, action, resource type, and record reference for traceability.
- Production startup refuses weak/missing JWT and encryption keys, non-HTTPS service URLs, a non-Atlas database URI, or non-cloud upload storage.

Security controls do not replace a production threat-model review, external penetration test, provider privacy/BAA review, or operational monitoring. Never send identifiable patient data to the demonstration AI adapter.

## Deployment preparation

Deployment manifests are included in `vercel.json` and `render.yaml`. Set the Vercel root to the repository and configure `VITE_API_BASE_URL=https://<render-api-host>/api`. Configure the Render backend with the Atlas `MONGODB_URI`, the Vercel origin in `CLIENT_URL`, strong generated secrets, `FILE_STORAGE_DRIVER=cloudinary`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` (or `CLOUDINARY_URL`), SMTP, `TURN_URLS`, and `TURN_SHARED_SECRET` when TURN is enabled. The Render Python service needs Google Cloud Speech, Translation, and Text-to-Speech enabled and a mounted service-account secret file. Existing local or S3-backed files must be migrated before changing an existing database to Cloudinary storage.

The repository is deployment-ready, but it has not been published to Vercel, Render, Atlas, Google Cloud, or S3. Those deployments require connected accounts, production secrets, domain/origin values, and service-region decisions. See [Deployment runbook](docs/DEPLOYMENT.md) before publishing.

## Documentation

- [API reference](docs/API.md)
- [Database schema](docs/DATABASE_SCHEMA.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Demo account guide](docs/DEMO_ACCOUNTS.md)
- [Deployment runbook](docs/DEPLOYMENT.md)

## Project structure

```text
frontend/      React + Vite UI and Playwright browser tests
backend/       Express + Mongoose API, auth, role policy, storage adapters
ai-service/    FastAPI image and multilingual speech service
docs/          API, database, architecture, demo, and deployment guides
```
