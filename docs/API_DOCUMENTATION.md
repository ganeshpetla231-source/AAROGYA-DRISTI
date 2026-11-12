# Aarogya Drishti API Documentation

## Status and conventions

This reference describes the existing Express API. Base path: `/api`. This is not a new API design or a claim that every route is production-ready.

- JSON success responses use the API response envelope; errors return an error status and message.
- Protected routes require `Authorization: Bearer <access-token>`.
- The refresh token is an httpOnly cookie scoped to `/api/auth`.
- Dates are ISO-8601. Uploads use multipart form data.
- Route role checks are necessary but not sufficient: services also enforce ownership, care relationships, appointment participation, and input constraints.
- Platform administrators receive aggregate analytics and operational metadata only. Hospital Managers receive facility operations and assignment metadata only; neither role has default access to patient-level clinical records.
- Check the route/controller implementation before relying on any integration contract not documented here.

## Health and authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | API and MongoDB readiness details. |
| POST | `/auth/register` | Public, patient registration only | Creates a patient account/profile and a session. |
| POST | `/auth/login` | Public, rate-limited | Staff/password or compatible account login; issues access token and refresh cookie. |
| POST | `/auth/patient-otp/request` | Public, rate-limited | Request a patient login or registration code. Delivery requires provider configuration. |
| POST | `/auth/patient-otp/verify` | Public, rate-limited | Verify an OTP and create/login a patient session. |
| POST | `/auth/refresh` | Refresh cookie | Rotate refresh session and issue a new access token. |
| POST | `/auth/logout` | Refresh cookie or access token | Revoke the current account's sessions. |
| GET | `/auth/me` | Authenticated | Return safe current-user profile fields. |
| GET/PUT | `/auth/language` | Authenticated | Read/update supported user language preference. |
| POST | `/auth/forgot-password` | Public, rate-limited | Start password reset without disclosing whether an account exists. |
| POST | `/auth/reset-password` | Public, rate-limited | Redeem a one-time reset token. |

## Patient and administrative workflows

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET/PUT | `/patients/me` | Patient | Read or update the authenticated patient's own profile. |
| GET | `/patients` | Patient/care roles | Scoped patient list. Admins use `/admin/patients`, which returns operational fields only. |
| GET | `/patients/my-screenings` | Patient | Paginated screening history for the authenticated patient. |
| GET | `/patients/my-appointments` | Patient | Paginated appointment history for the authenticated patient. |
| GET | `/admin/dashboard` | Admin | Application counts and aggregate dashboard data. |
| GET | `/admin/reports` | Admin | Aggregate reports. |
| GET/POST | `/admin/doctors` | Admin | List doctors or create a doctor account pending approval. Doctor listing accepts `page` (1-based), `limit` (1–100), `status` (`pending`, `approved`, `rejected`, or `all`), and optional `active` (`true`/`false`). |
| PUT | `/admin/doctors/:doctorId/approve` | Admin | Approve a doctor account. |
| PUT | `/admin/doctors/:doctorId/reject` | Admin | Reject/deactivate a doctor account. |
| GET | `/admin/patients` | Admin | Paginated patient identifiers and operational assignment fields only. |
| PUT | `/admin/patients/:patientId/assign-doctor` | Admin | Assign or unassign a doctor. |

Admin doctor and patient list responses include `items` and `pagination` (`page`, `limit`, `total`, `pages`); the dashboard uses these existing server-side pages.

## Domain resources

| Method | Path | Access/notes |
|---|---|---|
| GET/POST | `/users` | Admin only; staff account management. |
| GET/POST | `/patients` | Read requires patient ownership or an authorized care scope; create is for authorized staff. |
| GET/POST | `/medical-history` | Patient or scoped care staff; clinical writes are restricted to clinician roles. Platform admins are denied. |
| GET/POST | `/screenings` | Patient and scoped care staff; upload is a dedicated workflow. Platform admins and Hospital Managers are denied. |
| POST | `/screenings/upload` | ASHA or doctor; consented image upload, rate-limited. |
| POST | `/screenings/offline-metadata` | Authorized care roles; metadata sync only, not AI analysis. |
| GET | `/screenings/review-queue` | Doctor. |
| PATCH | `/screenings/:id/review` | Doctor with care relationship. |
| GET | `/screenings/:id/image` | Authorized assigned worker or related doctor; server-mediated private download. |
| GET/POST | `/appointments` | Reads are scoped to patient/doctor or a facility manager's operational scope; manager responses omit clinical notes. Generic write restrictions differ from telemedicine booking. |
| GET/POST/PATCH | `/hospitals` | Read according to resource policy; create is admin-only; updates require hospital/admin scope. |
| GET/POST/PATCH | `/referrals` | Patient/scoped care staff reads; creation/update is limited to authorized clinicians or destination facility. Hospital responses omit clinical referral reasons. |
| GET/POST | `/patients/:id/medical-history` | Patient/authorized care reads; clinician writes. |

Resource list endpoints generally support pagination and bounded query filters. Unknown/protected fields are rejected by the resource layer; verify the exact fields accepted by the specific route before client integration.

## Patient QR and consent

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/patient-qr/me` | Patient | Read own QR metadata. |
| POST | `/patient-qr/issue` | Patient | Revoke prior token and issue a new unpredictable QR token. |
| POST | `/patient-qr/revoke` | Patient | Revoke active QR token(s). |
| POST | `/patient-qr/scan` | ASHA/doctor | Validate token, consent and scope; create an audit event. |
| GET | `/patient-qr/history` | Patient/scoped care roles/admin | Read authorized scan history. |
| GET/PUT | `/patient-qr/consent` | Patient | Read/update QR lookup consent. |

## Clinical records and documents

Under `/clinical`, current route patterns include:

| Method | Path | Purpose |
|---|---|---|
| GET | `/clinical/patients` | Scoped clinician work queue. |
| GET | `/clinical/patients/:patientKey` | Scoped clinical overview. |
| POST | `/clinical/patients/:patientKey/notes` | Create a medical record note. |
| POST | `/clinical/patients/:patientKey/prescriptions` | Create a prescription record. |
| POST | `/clinical/patients/:patientKey/follow-ups` | Schedule a follow-up. |
| POST | `/clinical/patients/:patientKey/referrals` | Create a referral. |
| POST | `/clinical/patients/:patientKey/lab-reports` | Upload a PDF/JPEG/PNG report (maximum 10 MiB). |
| PATCH | `/clinical/prescriptions/:id` | Update a prescription's status. |
| GET | `/clinical/documents/:id` | Authorized, server-mediated document access. |

These are not all separate collections: notes/follow-ups use `MedicalRecord`, prescriptions use `Prescription`, and files use `ClinicalDocument`.

## Telemedicine and appointments

Under `/telemedicine`:

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/telemedicine/config` | Patient/doctor | Return ICE server config; TURN credentials are short lived when configured. |
| GET | `/telemedicine/availability` | Patient/doctor | Find open future availability. |
| POST | `/telemedicine/availability` | Doctor | Publish time slots. |
| DELETE | `/telemedicine/availability/:id` | Owning doctor | Cancel an unbooked slot. |
| GET | `/telemedicine/appointments` | Patient/doctor | List appointments scoped to user/care relationship. |
| POST | `/telemedicine/appointments` | Patient | Book an open video appointment slot. |
| GET | `/telemedicine/appointments/:id/room` | Appointment participant | Obtain authorized room details. |
| PATCH | `/telemedicine/appointments/:id/confirm` | Doctor participant | Confirm an upcoming appointment. |
| PATCH | `/telemedicine/appointments/:id/decline` | Doctor participant | Decline a pending appointment. |
| PATCH | `/telemedicine/appointments/:id/cancel` | Patient/doctor participant | Cancel an appointment. |
| PATCH | `/telemedicine/appointments/:id/reschedule` | Patient/doctor participant | Request/update scheduling. |
| PATCH | `/telemedicine/appointments/:id/notes` | Doctor participant | Save consultation notes. |
| POST | `/telemedicine/appointments/:id/follow-ups` | Doctor participant | Schedule follow-up care. |

## Notifications, analytics, education, and assistant

- Notifications: `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`. Results and mutations are owner-scoped. Reminder generation is an API-process scheduler.
- Analytics: `GET /analytics?from=&to=&facility=&district=&mandal=`. Staff roles only; returns aggregates. District accounts are constrained to their district.
- Education: routes are under `/education` for articles/videos and user video history; content access is public or authenticated according to route.
- Healthcare workers: routes are under `/healthcare-workers`; administrative access and district scope are enforced by the route/service.
- Government directory: routes are under `/government-directory`; directory records are not patient records.
- Assistant: `/assistant/health`, `/assistant/live-token`, `/assistant/message` are authenticated and rate-limited. Gemini credentials remain server-side.
- Voice: routes under `/voice-transcripts` and `/voice/*` handle transcript, translation, and synthesis workflows; stored conversations are owner-scoped.

## AI service boundary

The separate FastAPI service exposes `/health`, `POST /analyze` (multipart `image`, max 8 MiB), and voice transcription/translation/synthesis routes. The Express backend calls it server-to-server with the AI service token. The current `/analyze` result is demonstration-only and is not a validated oral-health diagnosis. The current API surface does not prove that Gemini is used for oral-image screening.

## Realtime Socket.IO

Clients authenticate the Socket.IO connection with an access token. Notification events are delivered to the authenticated user's own room: `notification:new`, `notification:read`, and `notification:read-all`. Telemedicine signaling includes room join, peer readiness, RTC offer/answer/ICE, chat, consultation status, and call end events. The server must validate appointment participation before a client joins or relays events in a room.

## API gaps / integration cautions

1. Delivery of OTP by SMS requires real provider credentials and delivery configuration.
2. Emergency appointment priority is not represented by a dedicated Appointment field in the current schema.
3. Questionnaire answers are not exposed as a dedicated `QuestionnaireResponse` model/route today.
4. Doctor credential/document upload and approval evidence do not have a dedicated doctor-document endpoint or model.
5. Gemini image analysis is not the current screening implementation; the FastAPI image output is demonstration-only.
6. [API.md](./API.md) is a legacy pointer to this document. The implementation and tests remain authoritative.
