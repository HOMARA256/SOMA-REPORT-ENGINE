# Approval workflow verification — 2026-10-01

## Implemented scope

1. Approval Delegation settings: connected route, eligible-user validation, time range, approval types, amount limit, revocation reason and live policy matrix.
2. Approval requests: tenant-scoped live queues and permission-checked decisions using Supabase RPCs.
3. Notifications and audit: submission, delegation and decision notifications; immutable audit events; expiry processing function.
4. Report generation: readiness remains mandatory and ready batches create idempotent background job records.
5. Test-role catalogue: Head Teacher, Deputy Head Teacher, Director of Studies, Teacher and Learner are present. Bursar and Parent were excluded from test-user provisioning.
6. Browser/build verification: production build passed; Approval Centre, Delegation Settings and Report Cards loaded under the authenticated school session.

## Evidence

- Production build: PASS (`tsc -b` and `vite build`).
- Live Approval Centre route: PASS; connected request queue rendered.
- Live Approval Delegation route: PASS; school membership resolved, policy matrix loaded, and activation correctly disabled because no eligible delegate account exists.
- Live Report Cards route: PASS; empty configured-school state rendered without layout failure.
- Supabase verification: five requested role definitions, 14 active approval policies, decision-notification trigger, and report-job queue RPC found.

## Remaining test-data dependency

Only the existing School Administrator identity is active in the tested school. End-to-end impersonation is intentionally unavailable. Separate invited/authenticated identities (unique email addresses) must be created and assigned the five roles before cross-role decision, rejection, return, escalation and delegation scenarios can be executed truthfully.

No fictional credentials or shared-password role accounts were created.
