# Aarogya Drishti Role-Permission Matrix

## Status and mapping

The product request specifies Admin, Hospital Manager, Doctor, and Patient. Existing code stores `hospital` for hospital staff and additionally supports `asha`, `specialist`, and `district`. The user approved preserving all existing roles and records, mapping `hospital` to the Hospital Manager product label, and not migrating the additional roles. The user also approved limiting platform administrators to aggregate analytics and operational metadata, with no default access to patient-level clinical records. Hospital Managers are limited to facility operations and assignment metadata; clinical access requires a separate clinician role. Frontend hiding is not security; the backend must enforce every permission.

| Product role | Existing `User.role` | Scope |
|---|---|---|
| Patient | `patient` | Own account, linked Patient profile, screenings, appointments, consent, notifications and records shared through authorized clinical workflows. |
| Doctor | `doctor` | Own availability; patients reached through assignment, appointment, or referral relationships; associated clinical records and consultations. Doctor approval is required by the login service. |
| Hospital Manager | `hospital` | Current hospital staff role, scoped by `User.hospital` to facility operations and assignment metadata. It has no clinical-record access; this is not a separate `HospitalManager` model. |
| Admin | `admin` | Platform-wide administration, aggregate analytics, and operational metadata; no default access to patient-level clinical records. |
| Existing additional role | `asha` | Assigned community/patient scope and consent-based screening workflows. |
| Existing additional role | `specialist` | Referral/facility-scoped clinical workflows. |
| Existing additional role | `district` | District-scoped aggregate analytics; no routine patient-level data. |

## Permission matrix

`Own` means records linked to the authenticated user; `Scoped` means an existing assignment, care relationship, facility, referral, or appointment establishes access. Writes remain subject to service validation and audit policy.

| Resource/action | Patient | Doctor | Hospital Manager (`hospital`) | Admin |
|---|---|---|---|---|
| View/update account language and own profile | Own | Own | Own | Own/admin support |
| Read patient profile | Own | Scoped | Facility operational and assignment fields only | Operational identifiers and assignment metadata only; no clinical history |
| Create/approve staff identities | No | No | No | Yes |
| View/edit hospital directory data | Read/search | Read/search | Scoped facility updates | Create/manage |
| Publish doctor availability | No | Own | No | Administrative support only |
| Book video appointment | Own patient | No | No | No routine booking |
| Confirm/decline appointment | No | Participating doctor | No | Administrative support |
| Cancel/reschedule appointment | Own | Participating doctor | No | Administrative support |
| Upload oral screening image | No direct privileged staff upload in current route | Scoped | Not enabled by screening scope today | No |
| Review AI screening | Own preliminary results only | Scoped clinician review | Not currently established | No |
| Create medical notes/prescriptions/follow-ups | No | Scoped | No clinical authoring by default | No |
| Read/upload patient clinical documents | Own/shared records | Scoped care relationship | No; use a separate clinician role | No |
| Read own notifications | Own | Own | Own | Own |
| Read aggregate analytics | No | As authorized staff | Facility-scoped where enabled | Platform aggregates |
| Read district aggregate analytics | No | No | No | Yes; district accounts are separately district-scoped |
| Join video room / signaling | Own appointment | Own appointment | No | No routine participation |
| Read/write audit log | No | No | No | Restricted operational access |

## Existing implementation observations

- Express authentication verifies the bearer token, active-account state, and account `authVersion`; `authorize()` enforces role allow-lists.
- Resource authorization policies and individual services add relationship checks. A role allow-list alone must not be interpreted as patient ownership.
- Doctor patient access is relationship-based, including assignments, appointments, or referrals as implemented by clinical/doctor-assignment services.
- Hospital users are connected through `User.hospital`. Current resource policies and service projections restrict managers to facility operations and assignment metadata, including omission of appointment notes and referral reasons; endpoint-by-endpoint integration testing remains outstanding.
- Notification queries are restricted to the notification owner. Socket.IO rooms are keyed to the authenticated user.
- District analytics are aggregate-only and constrain the district filter. Preserve this distinction.
- Admin routes include doctor approvals, patient assignment, dashboard and reports. Current route/resource policies deny platform admins clinical workflows and generic patient-record access; dashboard/report data uses aggregates and operational projections. Endpoint-by-endpoint integration testing remains outstanding.

## Recommended authorisation rules for implementation review

1. Resolve the patient's `Patient` document from the authenticated account for patient self-service; do not trust a client-supplied patient ID.
2. A doctor can read or mutate a clinical record only while an approved care relationship exists; use the same relationship helper consistently across REST, downloads, and realtime features.
3. A hospital manager can update only the facility linked to their account. Verify this explicitly for every write, not just by role name.
4. Keep patient documents and screening images private; authorize each download at the API boundary, then stream/decrypt the file.
5. Restrict platform administrators to aggregate analytics and operational metadata. Do not expose clinical history, notes, screening images, questionnaire answers, or patient documents by default; any exception requires a separately approved policy and audit design.
6. For video, both participants must be authorized for the same appointment; never accept arbitrary room IDs from the client as proof of access.
7. Record consent for each specific purpose and check current consent before access or processing where required. Consent revocation must stop future processing/access as policy specifies.
8. Use deny-by-default checks for new routes and test both allowed and denied roles, including cross-patient and cross-hospital attempts.

## Decisions requiring approval

- Whether ASHA workers remain screening uploaders as a supported community care role.
- Whether staff login IDs, approval requirements, and account provisioning are consistent for all non-patient roles.
