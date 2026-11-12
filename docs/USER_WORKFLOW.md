# Aarogya Drishti User Workflows

## Status and scope

This document combines existing workflows with proposed end-to-end behavior needed for the four requested roles. Proposed steps are requirements for review, not claims that the current application implements every step. No application code or data has been changed.

## 1. Patient workflow

1. **Choose language and enter the application.** Select English, Telugu, or Hindi; the preference is persisted by the frontend and can be changed without logging out.
2. **Register or sign in.** Patient access uses mobile OTP when provider configuration is available. The server normalizes the phone number, rate-limits requests, verifies an expiring one-time challenge, and links the account to a `Patient` profile. A legacy password flow may remain for compatibility.
3. **Review profile and consent.** The patient checks profile details and gives purpose-specific consent before a screening image is processed/stored or a care worker uses consent-gated QR access.
4. **Complete symptom intake.** Capture reported symptoms and relevant context. The current system has symptom/transcript data in existing screening/voice-related models but does not have a standalone questionnaire response workflow; treat that as a design gap pending approval.
5. **Upload an oral image.** A patient-facing image upload should provide preview, file validation, and explicit consent. Current upload API is restricted to authorized staff roles, so a direct patient upload is not currently established.
6. **View a preliminary result.** Show only the recorded preliminary observation, uncertainty/quality information, and next-step guidance. State prominently that this is not a diagnosis and a qualified clinician must evaluate concerning findings. Current image output is demonstration-only.
7. **Find a facility/provider and book care.** Browse active hospitals and doctor availability, choose an appointment mode, and book an available slot. Current online booking supports patient booking of video availability; emergency priority is not represented as a separate appointment field.
8. **Attend consultation.** Join the authenticated appointment room; view own appointment details and receive in-app notifications. Video uses Socket.IO signaling and WebRTC.
9. **Review records and follow-up.** View own screenings, appointments, profile, and authorized clinical records/documents; receive reminders and care-plan updates.

## 2. Doctor workflow

1. Admin provisions a doctor identity; the doctor account remains pending until approved.
2. Doctor signs in with staff credentials. An unapproved or inactive account must be denied.
3. Doctor publishes future availability and reviews only patients in an authorized assignment, appointment, or referral relationship.
4. For a screening, review AI output separately from clinical assessment; record a clinician decision/notes and next steps. Never treat a demonstration score as a diagnosis.
5. Create clinical notes, prescriptions, referrals, and follow-ups for authorized patients; upload/read documents only through private server-mediated access.
6. Confirm/decline or reschedule appointments; join a video consultation only as a participant in that appointment.
7. Patient communications and notifications are scoped to the intended patient/participants. Sensitive views and mutations should be audited.

## 3. Hospital Manager workflow

1. Admin creates/provisions a hospital staff account and links it to one `Hospital` record.
2. The account signs in and can manage only authorized information for its linked facility.
3. The manager maintains facility contact/service data and handles facility-scoped operational referrals/appointments only where current route/service authorization allows.
4. The manager does not receive clinical authoring or unrestricted patient access by implication. This boundary must be confirmed before a dedicated manager dashboard is enabled.

Current code maps this role to `User.role === 'hospital'` and `User.hospital`; it does not have a `HospitalManager` collection or a fully independent manager profile.

## 4. Admin workflow

1. Admin signs in through staff authentication.
2. Admin reviews aggregate service metrics and operational queues.
3. Admin creates and approves/rejects doctor accounts, assigns doctors to patients, and maintains facility/provider directory data.
4. Admin accesses patient-level clinical data only when explicitly necessary and authorized; sensitive access and changes should be auditable.
5. Admin reviews reports and analytics with data minimization; district analytics remain aggregated and district-scoped.

## Existing versus missing workflow support

| Capability | Current evidence in code | Design gap / caution |
|---|---|---|
| Language preference | First-visit language gate, i18next, saved preference | Complete coverage of every string across every module still requires verification. |
| OTP authentication | Request/verify endpoints and provider adapter | Real delivery requires configured credentials and provider test; demo behavior is not proof of SMS delivery. |
| Patient profile | `Patient` linked to `User` and patient self-service surfaces | Confirm every editable field and ownership guard. |
| Questionnaire | Symptom fields exist in some screening/transcript records | No dedicated questionnaire response model/workflow currently identified. |
| Oral images | Consent, validation, encryption, private storage metadata | Upload is staff-scoped today; direct patient upload is not established. |
| AI screening | Backend-to-FastAPI image adapter and structured categories | Output is demonstration-only; no validated Gemini oral-image flow is established. |
| Hospital/provider search | Hospital directory and doctor availability | Search/assignment and manager-specific requirements must be confirmed against deployed data. |
| Appointments | Appointment and DoctorAvailability models; patient video booking | No explicit emergency-priority field; ensure clinic/urgent flows are fully wired before claiming completion. |
| Video consultation | Socket.IO signaling, WebRTC, appointment participants | No default recording; provider/network/TURN configuration affects connectivity. |
| Medical records | MedicalRecord, Prescription, ClinicalDocument, Referral | Existing data is split across these equivalent models, not the requested separate names. |
| Notifications | MongoDB notifications, in-app realtime events, reminder scheduler | External SMS/email delivery is configuration-dependent. |
| Admin dashboard | Admin endpoints and UI | Confirm metrics and access auditing against production database and real workflows. |

## Cross-cutting safety and privacy

- Use server-enforced authorization on every read/write and download.
- Collect only necessary data and explain purpose at collection time.
- Keep consent purpose- and timestamp-specific; record revocation and stop applicable future processing.
- Do not use sample data as live clinical advice. Clearly mark synthetic/demo content.
- Retain clinical data only according to an approved jurisdictional/organizational schedule; do not invent a universal expiry duration.
- Delete encrypted object bytes as well as database references when an approved deletion/retention action applies.
- Never store secrets in browser code, logs, analytics payloads, or public object URLs.
