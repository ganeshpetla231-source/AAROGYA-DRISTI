# Aarogya Drishti Implementation Roadmap

This roadmap is based on [PROJECT_ANALYSIS.md](./PROJECT_ANALYSIS.md) and [MISSING_FEATURES.md](./MISSING_FEATURES.md). The user approved implementation while preserving the existing stack, roles, and records. Code changes do not authorize production database or deployment changes.

## Phase 0 - Confirm scope and operating environment

**Before feature work**

- **Confirmed:** preserve all existing roles and records; map the current `hospital` role to the Hospital Manager product label. Existing ASHA, specialist, and district roles remain.
- **Confirmed:** platform administrators receive aggregate analytics and operational metadata only; no default patient-level clinical-record access.
- **Confirmed:** Hospital Managers receive facility operations and assignment metadata only; clinical access requires a separate clinician role.
- Confirm the ASHA screening scope.
- Provide/confirm the authoritative project brief requirements if they differ from the requirements in the conversation and repository README.
- Start the existing frontend/API/AI stack and verify API health reports the configured database as connected.
- Confirm which database is local versus shared/staging before running any seed or integration test.
- Keep all environment values secret; classify which services are intentionally local and which credentials must be provisioned.

**Exit criteria:** approved requirements, known non-production database target, all required development services start, and health checks are documented.

## Phase 1 - Stabilize existing integration contracts

1. **Complete:** aligned the consultation-note frontend URL with the existing backend route and added a regression test covering the API client/route contract.
2. **Complete:** removed the unused `Idempotency-Key` header from offline metadata sync; the request ID in the body remains the authoritative source, with regression coverage.
3. **Complete:** session restore distinguishes an expired refresh token from a transient API/network outage and displays localized feedback.
4. **Complete:** admin pending-doctor, active-doctor assignment, and patient lists use the backend's existing pagination.
5. Add route-to-client contract checks for all API helpers, especially telemedicine, education management, admin actions, and offline sync.

**Exit criteria:** the corrected URL/header contracts pass isolated regression tests, the frontend build and isolated backend unit suite pass, and the three admin lists use server pages. Browser verification, broader route-contract coverage, and disposable-database API integration tests remain outstanding.

## Phase 2 - Authentication, role scope, and configuration

**Code changes in place:** admin clinical access and Hospital Manager clinical-data exposure have been restricted in backend routes, resource policies, service projections, and dashboard data. The admin control center now consumes real MongoDB counts for overview/reports, lists hospitals and managers, updates active states, and exposes paginated sanitized activity. The frontend build and isolated backend unit suite pass; broader route-level and live integration authorization tests remain outstanding.

1. Configure and verify real MSG91 OTP delivery in a staging environment; retain rate limits, expiry, attempt caps, and generic login responses.
2. Configure SMTP for password reset and verify reset token expiry, single use, and session revocation.
3. Review staff provisioning and role mismatch behavior for all existing roles. Do not drop or rename roles without an approved migration.
4. Test patient ownership, doctor assignment/referral/appointment scope, hospital-manager facility scope, admin actions, and district aggregate restrictions.
5. Add access-denied tests for cross-patient, cross-hospital, expired/revoked-session, and unauthorized file/room access.
6. Validate deployment secrets and production requirements in secret management; never use demo credentials in production.

**Exit criteria:** role matrix agreed; positive and negative authorization tests pass; SMS/email providers work in staging; no secrets are exposed to browser assets or logs.

## Phase 3 - Patient intake and consent

1. **Implemented in code:** patient-owned screening submission with bounded questionnaire fields, explicit image/submission consent, encrypted image storage, and patient history.
2. Approve the clinical questionnaire and copy, including supported-language translations, versioning, required fields, and escalation wording.
3. Decide whether questionnaire versioning and consent linkage should remain embedded or move to dedicated records as requirements mature.
4. Unify consent semantics for questionnaire, image processing/storage, QR sharing, and care-team access, including revocation behavior.
5. Add route-level tests for account ownership, consent-required paths, and denial of cross-patient image/history access.

**Exit criteria:** clinically approved and versioned patient intake, tested consent and ownership controls, and a verified consent lifecycle. The current patient flow is implemented in code but does not yet meet these release criteria.

## Phase 4 - Screening and AI safety

1. Keep the current image-analysis failure explicit until a clinically appropriate, validated model/provider and approved data-use terms exist.
2. Select the intended inference provider (Gemini may be considered only after confirming its model capabilities and policy suitability); document data flow, retention, access, and clinical validation.
3. Define image quality failure handling, structured output contract, provenance/model version, uncertainty, patient-facing risk language, and clinician review.
4. If approved, implement backend-only provider calls with timeouts, rate limits, schema validation, safe unavailable responses, and no secret in frontend.
5. **Implemented in code:** patient upload/preview with consent and access checks. Camera capture and clinical approval remain outstanding.
6. Test size/type/signature, malformed images, poor quality, AI timeout/provider errors, no-consent behavior, clinician review, and non-diagnostic copy.

**Exit criteria:** no synthetic screening outcome presented as real; end-to-end staging test returns only validated structured preliminary observations with explicit clinician-review guidance.

## Phase 5 - Hospital/provider discovery and appointments

1. **Partially implemented:** patient provider search uses active, approved, verified doctors and hospital details. Replace remaining synthetic map pins with active `Hospital` data and trustworthy coordinates/availability; clearly indicate missing or stale data.
2. Define clinic versus video appointment workflows, slot ownership, cancellation/reschedule rules, and no-show behavior.
3. Design emergency intake and escalation with an accountable human response/SLA; do not treat a priority field alone as emergency care.
4. Preserve appointment uniqueness/concurrency so one availability slot cannot be double-booked.
5. Test search filters, real facility data, booking races, patient/provider role checks, notifications, and emergency escalation.

**Exit criteria:** patient-facing provider results are real and sourced; normal and urgent flows have distinct tested behavior and safe instructions.

## Phase 6 - Telemedicine, clinical records, and notifications

1. **Contract aligned:** the consultation-note frontend uses the registered telemedicine route. Test create/read behavior for notes and follow-ups against a disposable database.
2. Configure TURN for staging/production and validate browser media on separate networks and mobile browsers.
3. Verify Socket.IO authentication, appointment participant enforcement, chat restrictions, reconnect/end-call behavior, and no recording by default.
4. Test encrypted file upload/download and access-denied behavior with the configured storage driver.
5. Add SMS/email notification delivery only through approved provider adapters with delivery status, retry, and privacy-minimizing content.

**Exit criteria:** full patient-doctor call and clinical follow-up works in staging; private files stay private; notifications are delivered and scoped.

## Phase 7 - Data integrity, retention, and audit

1. Inspect live schema/index state read-only and resolve existing duplicate/invalid records before adding constraints.
2. Decide whether `Patient.user` must be unique for linked accounts; add a partial unique index only after data checks and migration approval.
3. Bound or externalize consultation chat history according to product retention and access patterns; avoid unbounded arrays.
4. Define retention/deletion policy for clinical records, images, documents, consent, audit, notifications, transcripts, and backups with appropriate policy/legal review.
5. Ensure sensitive reads/exports and administrator access are audited with metadata that excludes secrets and unnecessary clinical details.
6. Test file deletion, data retention, legal hold, backups, and restore.

**Exit criteria:** documented retention policy, safe migration with backup/rollback strategy, and verified data integrity.

## Phase 8 - Multilingual, responsive, and release acceptance

1. Audit visible UI strings against English/Telugu/Hindi dictionaries, including validation, empty/error states, modals, notifications, reports, and backend error messaging.
2. Test switching language while preserving route, unsaved forms, and ongoing workflows.
3. Test localized dates/numbers, medical terminology, keyboard/accessibility, reduced motion, and font rendering.
4. Run desktop/tablet/mobile Playwright flows for every role using synthetic staging data.
5. Run backend API tests only against a disposable test database; separately validate database connection, image upload, OTP, AI provider status, appointment booking, and role denial.
6. Resolve bundle-size warning using measured code splitting only if approved and within scope.
7. Complete deployment security/privacy review, provider readiness, backup restore, and a production smoke test.

**Exit criteria:** acceptance checklist passes; known limitations and missing credentials are published; no production launch is represented as verified before live acceptance.

## Approval gate

The user approved proceeding with the roadmap and confirmed the existing role mapping. Phase 1 stabilization fixes are complete. Follow-up code now includes patient consented Gemini image screening with encrypted private history and verified-clinician review, hospital-manager provisioning/management, professional-document verification, verified-provider discovery, and a data-backed admin control center for the workflows currently represented in the schema. The Gemini visual screening is not clinically validated and intentionally exposes no model confidence score. Provider readiness, clinical validation, emergency operations, PHC/department management, notification broadcast, external provider configuration, migration/index review, retention, and release acceptance remain open gates.
