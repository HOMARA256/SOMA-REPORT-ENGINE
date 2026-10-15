# Platform and School Administration Security Boundary

Status: Accepted design direction; implementation pending

## Context

SOMA REPORT ENGINE is a multi-school academic platform. The original system specification names both Platform Admin and School Admin, requires capability-based authorization, and forbids routine platform alteration of school marks without an audited support procedure. The supplied administration guidance makes their separation explicit. This decision is retained in the repository so future database, API, and UI work follows the same boundary.

## Decision

- Platform administrators operate SOMA REPORT ENGINE as a service: school onboarding, account activation or suspension, plans, subscriptions, payment confirmation, platform configuration, usage and health.
- School administrators operate their own school: profile, staff and roles, academic structure, learner enrolment, allocations, assessments, grading configuration, marks, results, reports and publication.
- A platform administrator has no automatic access to learner records, marks, report cards, attendance, teacher records or academic comments. Platform status must never imply school membership or school capabilities.
- Model platform authorization separately from school authorization, for example `users`, `platform_admins`, `school_memberships` and school-only roles/capabilities. A user may hold both kinds of authorization only through separate, explicit grants; switching context must not combine their privileges.
- Keep platform routes (`/platform/*`) and the school workspace (`/dashboard`, `/setup/*`, `/people/*`, `/marks/*`, `/results/*`, `/reports/*`) under distinct server-side authorization policies. A different route prefix or dashboard is not itself a security boundary.
- Create or invite the first School Admin during onboarding. Thereafter the School Admin manages school staff and roles without routine Platform Admin involvement.
- Any exceptional support access to school data requires a separately approved, time-limited, least-privileged and audited procedure. It is not a default Platform Admin permission.
- Subscription/account controls must preserve all school academic data. Suspension may restrict defined operations, but must not delete records or silently publish, alter, or unlock results.

## Data and Payment Boundaries

- Platform entities may include `platform_admins`, `schools`, `subscription_plans`, `school_subscriptions`, `subscription_payments` and `platform_audit_logs`. The exact schema, payment provider and plan rules are not yet finalized.
- Subscription and payment logic must not become academic authorization. These entities can share PostgreSQL with academic entities if schemas, grants, API policies and audit paths keep the domains separate; a physically separate database is not required by this decision.
- Store account status separately from subscription status. Derive any displayed `schools.subscription_status` from the authoritative subscription/entitlement record, or enforce it as a controlled projection; do not maintain two independently editable status fields.
- Monetary amounts require exact decimal representation, currency and transaction reference uniqueness/idempotency. Manual payment recording requires verified evidence and an audit trail. Payment method integrations are a later decision.
- Subscription states such as TRIAL, ACTIVE, PAYMENT_DUE, GRACE_PERIOD, SUSPENDED and CANCELLED are proposed, not yet an approved lifecycle policy. Define transitions, grace periods, read-only behavior and reactivation before implementation.

## Security and Implementation Consequences

- Enforce platform and school policies in the API for every operation. Use tenant-scoped PostgreSQL constraints and RLS as defence in depth. Never infer authorization from a browser-supplied `school_id`, a role label, or an `admin` boolean.
- Ordinary school requests must not run through a database credential that bypasses RLS. A privileged Supabase secret key, if needed for narrowly scoped platform operations, stays server-side and requires its own authorization checks.
- Tests must prove that Platform Admin cannot read or mutate academic data by default, School Admin cannot manage platform subscriptions, and School A cannot access School B. Test exceptional support access separately.
- The current migrations do **not** satisfy this decision: `002_identity_and_academic_foundation.sql` inserts `PLATFORM_ADMIN` into school roles and grants it the same school permission set as `SCHOOL_ADMIN`. Future implementation must correct this through a new forward migration if the earlier migration has already been applied. Do not silently edit an applied migration.
- The current frontend has only a demo School Admin workspace; `/platform/*` routes, real authentication and server-side permission enforcement have not been implemented.

## Source Alignment

- `OURSCHOOL_HTML_System_Architecture_and_Development_Specification.docx`, sections 3, 8, 9 and 13: distinct roles, memberships, tenant scope, server authorization and audit.
- User-supplied platform/school administration guidance dated 2026-09-22: the separation and proposed platform entities.
- Security rationale: [OWASP Multi Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html), [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), and [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).
