# Existing Aarogya Drishti Features

This inventory describes functionality present in the existing code. "Implemented in code" is not equivalent to a successful live integration: the frontend/API/AI services were unreachable during the audit. Refer to [PROJECT_ANALYSIS.md](./PROJECT_ANALYSIS.md) for environment status and issues.

## Frontend

| Area | Existing implementation | Verification |
|---|---|---|
| App shell and routing | React/Vite SPA with hash routing, login, language gate, topic routes, protected role dashboards, route redirects. See `../frontend/src/App.jsx` and `../frontend/src/main.jsx`. | Frontend build passed. Runtime unavailable during audit. |
| Language support | English, Telugu, Hindi dictionaries; language gate; local preference persistence; header language selector; locale-aware labels in some screens; Telugu/Hindi font styles. | All three dictionary structures had matching normalized keys in static comparison (zero missing relative to English; three language-specific extras). Translation accuracy, untranslated hardcoded strings, and all page states were not manually verified. |
| Authentication UI | Patient OTP and registration states; doctor/admin/staff password login; password reset UI; error/status states. | Backend calls are wired in code; MSG91 configuration is blank and services are offline. |
| Patient dashboard/profile | Patient dashboard metrics/views and profile form connected to own-profile APIs. | Code present; API unavailable. |
| Admin dashboard | Admin summary counts, doctor creation/approval/rejection, patient-doctor assignment. | Code present; UI fetches a maximum of 100 records per request and live API unavailable. |
| Hospital/other role dashboard | Shared role-aware dashboard shell and facility overview for the existing `hospital` role; UI also supports ASHA, specialist, district and admin roles. | Code present; these are not exactly a four-role-only product and require a product decision. |
| Oral screening UI | Staff image upload, local preview, camera capture/switch, consent checkbox, size checks, offline metadata queue, clinician review queue/history. | UI and API client present. Analysis result cannot be produced because AI service returns 503 until a validated image model is configured. |
| Symptom guidance | Symptom checker and oral-health education modules. | Present; not equivalent to a persisted, versioned clinical questionnaire. |
| Facilities and maps | Map/search UI, location-permission request, directions link, referral form. | Map/search pins and distances are expressly synthetic sample facility data; not a live locator. |
| Appointments/video | Doctor availability, patient video-slot booking, request confirmation/decline/cancel/reschedule, WebRTC call UI, chat, follow-up, and consultation note UI. | Backend/API workflow exists; note-save URL mismatch confirmed; no live service/TURN test. |
| Clinical records | Clinical workspace, notes, prescriptions, follow-ups, referrals and lab-report UI. | API functions/routes exist; no live database/API validation. |
| Notifications | Notification bell/list and realtime updates. | Code exists; API and socket service offline. |
| Education and voice | Translated education articles/videos, assistant, transcript workflow, accessibility/offline components. | Gemini key is present but service unreachable; speech provider credentials not verified. |
| Responsive styling | Global and per-feature stylesheets include responsive rules and a mobile navigation layout. | Static CSS review only; desktop/tablet/mobile browser acceptance was not run. |

## Backend and services

| Area | Existing implementation |
|---|---|
| API structure | Express app mounts separate auth, admin, resource, patient QR, education, worker, assistant, clinical, telemedicine, notification, analytics, voice, and directory routes. |
| Authentication | Patient OTP request/verify; staff ID/email-password login; JWT access tokens; httpOnly refresh cookie; refresh rotation/revocation; password reset; account language setting. |
| Authorization | Authentication and role middleware plus service-level patient ownership, doctor assignment/referral/appointment relationship, hospital, notification owner, and district scope checks. |
| Admin operations | Doctor account creation and approval, patient assignment, and aggregate counts/reports. |
| Database models | Mongoose models for users, patients, hospitals, screenings, appointments, availability, consultations, clinical records/files, referrals, consent, notifications, audit, OTP/session tokens, education, transcripts and worker/directory data. |
| Image pipeline | Multer memory upload; size/type/signature checks; consent requirement; image quality validation at the AI service; AES-GCM encryption for stored images; private storage interface. Model output is deliberately disabled until a validated model is configured. |
| Gemini | Backend-only Gemini integration for assistant/live interactions; no Gemini key is embedded in the frontend source. Image screening does not currently use a verified Gemini pipeline. |
| File storage | Encrypted local private filesystem for development and authenticated Cloudinary raw-asset storage for production. |
| Telemedicine | Appointment availability/booking and Socket.IO/WebRTC signaling; room access checks appointment participant; optional time-limited TURN credentials. |
| Notifications | Persisted per-user notifications, Socket.IO delivery, appointment reminder scheduler and dedupe key. |
| Safety/operations | Helmet, explicit CORS origin list, rate limits, production configuration guards, bounded request/upload sizes, hashed refresh/QR/OTP tokens, and selected audit events. |

## Existing validation performed

- Frontend production build: passed; large-chunk advisory warning remains.
- 15 isolated backend unit tests passed, including the two new frontend/API contract regression tests, CORS/security configuration, file-signature checks, TURN configuration, and video model status/language checks.
- The initial audit made no source or database changes. After approval, the consultation-notes route and offline-sync request header were updated with focused tests; no environment or database writes were made.
