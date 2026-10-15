# SOMA REPORT ENGINE Supabase database audit — 25 September 2026

## Scope and safety decision

The live Supabase project was inspected without reading password hashes, invitation tokens, reset tokens, provider credentials, or private academic record contents. No database object or record was deleted. Nothing currently satisfies every deletion-approval condition.

## Authentication inventory

| Area | Count | Finding | Classification | Action |
|---|---:|---|---|---|
| Supabase Auth identities | 2 | Both are linked to persistent application identities | SUPABASE_AUTH | Keep |
| Application user profiles | 2 | No missing or broken `auth_user_id` links | CORE_SYSTEM | Keep |
| Platform Administrators | 1 | Correctly has no school membership | CORE_SYSTEM | Keep |
| School memberships | 1 | Linked to the non-platform identity | CORE_SYSTEM | Keep |
| Schools | 1 | Tenant relationship is intact | CORE_SYSTEM | Keep |
| Duplicate normalized emails | 0 | Uniqueness is safe to enforce | CORE_SYSTEM | Enforced |
| Broken Auth links | 0 | No repair required | CORE_SYSTEM | Keep |

Passwords remain exclusively in Supabase Auth. SOMA REPORT ENGINE does not create a second `passwordHash` column because that would introduce a second password authority and risk hash drift or accidental re-hashing.

## Public-schema inventory summary

| Classification | Objects | Estimated records | FK dependency links | RLS policies | Triggers | Recommended action |
|---|---:|---:|---:|---:|---:|---|
| ACTIVE_FEATURE | 89 | 245 | 465 | 96 | 29 | Keep |
| CORE_SYSTEM | 14 | 334 | 26 | 13 | 1 | Keep |
| Initially unmatched by name rule | 17 | 10 | 53 | 18 | 2 | Reviewed individually; keep |

Record counts are PostgreSQL planner estimates used for a non-invasive audit. Exact record contents were not exported.

## Individually reviewed objects

| Object | Purpose | Dependencies / controls | Final classification | Action |
|---|---|---|---|---|
| `attendance` | Learner attendance | 3 FK links, 3 policies | ACTIVE_FEATURE | Keep |
| `bursaries` | School finance support | 3 FK links, RLS | ACTIVE_FEATURE | Keep |
| `comment_generation_jobs` | Report narrative workflow | 4 FK links, RLS | ACTIVE_FEATURE | Keep |
| `comment_rules` | Comment engine rules | 2 FK links, RLS, trigger | ACTIVE_FEATURE | Keep |
| `comment_templates` | Comment engine templates | 3 FK links, RLS, trigger | ACTIVE_FEATURE | Keep |
| `data_exchange_approvals` | Import/export governance | 4 FK links, RLS | CORE_SYSTEM | Keep |
| `device_health` | Offline/sync operational health | FK and RLS policies | ACTIVE_FEATURE | Keep |
| `feature_flags` | Platform entitlement controls | Referenced by school overrides | CORE_SYSTEM | Keep |
| `finance_approval_rules` | School finance governance | FK and RLS | ACTIVE_FEATURE | Keep |
| `media_assets` | Logos, photos and report media | 7 FK links, RLS | ACTIVE_FEATURE | Keep |
| `platform_action_rate_limits` | Registration/auth abuse protection | Used by Edge Functions | CORE_SYSTEM | Keep |
| `platform_admins` | Platform identities | 15 FK links, RLS | CORE_SYSTEM | Keep |
| `platform_data_exchange_policies` | Import/export policy | 2 FK links, RLS | CORE_SYSTEM | Keep |
| `support_concessions` | Billing discounts/support programmes | 2 FK links, RLS | ACTIVE_FEATURE | Keep |
| `sync_conflicts` | Offline conflict handling | 3 FK links, RLS | ACTIVE_FEATURE | Keep |
| `sync_queue` | Offline synchronization | FK and RLS | ACTIVE_FEATURE | Keep |
| `system_jobs` | Idempotent background jobs | FK and RLS | CORE_SYSTEM | Keep |

## Deletion candidates and backups

- `UNUSED_CANDIDATE`: none confirmed.
- `UNRELATED_CANDIDATE`: none confirmed.
- Tables deleted: none.
- Backup created for deletion: not applicable because no deletion was approved or performed.

## Authentication root cause and correction

Supabase Auth was already configured with persistent sessions, automatic refresh and URL-session detection. The application-level weakness was separate client-side authorization logic plus a hard-coded school user identity. This could make a valid persistent Supabase session appear unauthorised or display the wrong role/school after refresh.

The correction introduces one JWT-protected `resolve-current-user` server endpoint. It resolves Platform Administrator or school membership from persistent database records, checks account/membership/school status, updates `last_login_at`, and returns only safe profile fields. School and platform login now clear password state after every attempt. Suspended schools receive an explicit suspension message rather than a false password error.

## Remaining acceptance-test limitation

The live project currently contains only two real identities. It is therefore impossible to truthfully execute login/logout/restart tests for School B, Teacher, Bursar, Parent and Learner without first creating authorised test identities and receiving their credentials. No demo accounts or passwords were invented during this audit.

