# Missing and Incomplete Aarogya Drishti Features

Statuses below reflect the reviewed code and the follow-up implementation. "Implemented in code" does not mean production-verified: live integrations, clinical approval, deployment configuration, and end-to-end testing are still required.

## Requirement comparison

| Requirement | Status | Gap / evidence |
|---|---|---|
| Admin dashboard | Partial | The administrator control center now has sections for hospitals, hospital-manager accounts, doctors, staff, patients, appointments, cases, referrals, reports, activity, PHCs, departments, notifications, users, permissions, and settings. Existing MongoDB data backs summary cards, hospital create/list/activation, manager listing/activation, doctor approval/provisioning, staff management, patient assignment, appointment/case/referral aggregates, reports, and sanitized activity logs. PHC registry, department, notification broadcast, and configurable permissions/settings workflows are not modeled and are explicitly unavailable. Browser checks passed for the dashboard, hospital manager table, hospital management and aggregate case view; broader operational testing remains. |
| Hospital Manager dashboard | Partial | Existing `hospital` role maps to Hospital Manager. Hospital profile editing, doctor onboarding, professional document verification, and activation workflows now exist in code. The role has no separate `HospitalManager` model; live authorization and end-to-end verification remain outstanding. |
| Doctor dashboard | Partial | Doctor role dashboard, review queue, clinical workspace and appointment tools exist. Live role/login and API integration were not tested. |
| Patient dashboard | Partial | Patient dashboard/profile/history surfaces exist. The patient screening page now supports consented camera/upload image analysis, AI observations, and private image history. Results can be routed to a verified clinician or reviewed later when the patient is assigned to care; production provider readiness and clinical validation remain outstanding. |
| Patient OTP authentication | Partial | Backend request/verify implementation and MSG91 adapter exist, but provider auth key/template are blank; real SMS delivery is unavailable. |
| Patient profile management | Implemented in code | Own-profile endpoint and form exist; cross-account ownership was not live-tested. |
| Oral health symptom questionnaire | Partial | A bounded questionnaire remains supported by the legacy patient submission API, but the simplified patient screening page now focuses on image-based screening. Clinical approval and questionnaire versioning remain outstanding. |
| Oral image upload and camera capture | Partial | Patient camera capture/upload, preview, consent, JPG/PNG type and signature checks, 8 MB size limit, encrypted private storage, and patient ownership checks are implemented. Clinician selection is optional; without an assigned reviewer, the record remains private to the patient until a care relationship is established. Production storage/configuration and end-to-end authorization tests remain outstanding. Staff uploads remain limited to authorized clinical roles. |
| Gemini API integration | Partial | Backend Gemini assistant/live integration exists. The patient image-screening endpoint now sends consented image bytes to the configured Gemini multimodal model; provider availability, production configuration, and clinical validation remain outstanding. |
| AI-assisted preliminary screening | Partial / not clinically validated | Patient screening now stores constrained Gemini visual observations and a non-diagnostic result category, with no confidence score. It is not a validated or calibrated oral-image model and must not be used to diagnose or rule out disease; professional evaluation remains recommended for suspicious or persistent changes. Staff FastAPI analysis still fails safely when no validated model is configured. |
| Oral cancer risk awareness/categories | Partial | Education content and broad screening categories exist. The present system cannot support an actual image-derived oral cancer risk prediction. |
| Hospital and doctor search | Partial | Patient screening can query active, approved, verified doctors and their hospital details; distance is only calculated when real coordinates exist. The map/facility experience still contains synthetic sample entries and must not be treated as a real directory. |
| Appointment booking | Partial | Video appointment availability and patient booking are implemented. A general clinic appointment flow and end-to-end live booking were not verified. |
| Emergency consultation requests | Missing operational workflow | An `UrgentRequest` schema exists, but no complete request, response, scheduling, notification, or accountable escalation workflow is wired. The schema alone is not emergency care; explicit emergency guidance and a staffed response process remain required. |
| Secure video consultation | Partial | Appointment participant checks, signaling and WebRTC components exist. Consultation note save has a route mismatch; TURN is unconfigured and live calls were not tested. |
| Medical records and reports | Partial | Existing medical records, prescriptions, referrals and encrypted clinical documents exist. Patient/doctor access and live upload/download were not validated. |
| Notifications and alerts | Partial | User-scoped in-app notifications and reminders exist. SMS/email delivery is not configured; successful external alerts are not established. |
| Role-based access control | Partial | The user approved preserving all seven existing roles, mapping `hospital` to Hospital Manager, limiting platform administrators to aggregate/operational metadata, and restricting Hospital Managers to facility operations/assignment metadata. Backend route/resource/service restrictions now enforce these clinical-data boundaries; full integration verification remains outstanding. |
| Data privacy/security | Partial | Several strong controls exist; live production setup, comprehensive PHI read/export auditing, consent revocation behavior, backup retention and formal security review remain unverified. |
| Admin analytics/reports | Partial | Dashboard metrics, monthly patient registration counts, hospital-associated patient counts, appointment/referral/case status counts, district screening counts, and paginated activity entries now come from MongoDB. Full date/hospital filters, CSV/PDF export, and some requested metrics are not implemented. |
| Full multilingual UI | Partial | English/Telugu/Hindi switching is present, and the patient image-screening flow now has localized copy in all three languages. Translation quality across the rest of the application, all static strings, error/empty/modal states, and mobile layouts have not been comprehensively accepted. |

## Confirmed integration and runtime blockers

1. **Resolved: consultation note save contract:** frontend now calls the registered telemedicine appointment notes route. The client-to-route contract is covered by an isolated regression test; live API behavior remains unverified.
2. **Resolved: offline sync CORS mismatch:** frontend no longer supplies `Idempotency-Key`; request identity remains in the body and backend CORS policy was not broadened. A regression test covers the client contract.
3. **Services stopped:** frontend/API/AI endpoints did not respond at audit time. The MongoDB service alone was reachable.
4. **AI environment not startable as configured:** `ai-service/.venv` is missing, and `scripts/start-ai-service.js` requires that virtual environment.
5. **SMS OTP unavailable:** MSG91 credentials/template are blank; adapter returns service unavailable.
6. **Reset-email delivery unavailable:** SMTP host/from credentials are blank; production password reset cannot send email.
7. **Map search remains illustrative:** map pins and some facility examples are hardcoded; do not treat them as real providers, distances, availability, or care referrals. The patient screening provider list is a separate verified-doctor API.
8. **Database state unknown:** no live API health response, collection/index inspection, or record integrity check was possible.

## Data-model and maintainability gaps

- Professional-document storage, upload, review, and doctor activation gates now exist in code; production storage setup and negative-path tests remain.
- The patient questionnaire is embedded in the screening record, but has no explicit schema version or clinical approval lifecycle.
- Urgent-request data is modeled but has no operational workflow, response SLA, or emergency escalation.
- No dedicated consultation notes/follow-up collections; current equivalent fields exist on `Consultation` and `MedicalRecord`.
- `Patient.user` is optional and not unique; confirm whether multiple portal profiles per user are valid before adding a constraint.
- `Consultation.chatMessages` is an unbounded embedded array; define a lifetime cap/retention or a referenced-message design before scale, to stay comfortably below MongoDB's 16 MiB document limit.
- Consent purpose/revocation and screening image-consent fields need one authoritative lifecycle and verified revoke handling.
- `User.language` allows `ta`/`kn`, whereas the current client/auth supports `en`/`te`/`hi`.
- `VoiceAssistantWidget.jsx` is unreferenced in the source import scan and appears to be a legacy candidate. Do not delete it until its intended use is confirmed.

## Not confirmed as broken

- The Gemini API key value was not disclosed or validated. A configured/non-empty key is not evidence that authentication, quota, model access, or the user's selected model works.
- An earlier browser showed a 401 during session restore, but it was not reproducible in this audit because the services are stopped. The current refresh error path clears session state without showing whether the cause was network outage or expired session.
- No actual MongoDB documents or indexes were inspected. Schema-level observations are not proof of corrupted data.
