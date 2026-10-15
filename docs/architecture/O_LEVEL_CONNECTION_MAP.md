# O-Level compulsory curriculum connection map

Audit baseline: 2026-10-03. The authoritative compulsory-subject rules are based on the NCDC Lower Secondary curriculum and are versioned in migration 054.

| Concern | Authoritative record or route | Connected consumers | Remaining risk |
| --- | --- | --- | --- |
| National subject identity | `system_subjects`, seeded in migrations 023/054 | Subject catalogue and school subject activation | Migration 054 now fails with an explicit list if a required code/level is missing. |
| School activation | `school_subject_offerings`, managed from `/setup/subjects` | `/setup/classes/new`, class detail, health checks | Live push was attempted but Supabase CLI stopped before executing SQL: its temporary `cli_login_postgres` role lacks permission to alter that role. |
| Class curriculum | `o_level_curriculum_rule_sets`, `o_level_curriculum_subject_rules`, `class_subject_offerings`; `/setup/classes/new` and `/setup/classes/:classId` | Class register, teacher allocation, assessment, marks, reports | The edit route currently reuses the form without a complete edit workflow; do not treat it as a second writer. |
| Learner placement | `learner_class_enrolments`; learner register | Required subject trigger, class counts, expected marks | Check uniqueness for one active placement per learner and academic year in the persistent schema. |
| Learner subject load | `learner_subject_enrolments`; `/school/learners/:learnerId/subjects` | Marks roster, results and report subject list | SNE exception approval has a database operation but no platform control-centre form yet. |
| Teacher authority | `teacher_allocations`, migration 046 | Teacher workspace and marks eligibility | Current O-Level mark save checks for an active primary allocation; verify effective-date and stream scope end-to-end. |
| Marks | `academic_mark_records`, migrations 047/048/054 | Marks entry, missing marks and report inputs | Deployment and authenticated browser workflow are still unverified. |
| Curriculum compliance | `get_academic_setup_health`, extended in migration 054 | Academic Setup Health and correction links | Teacher-allocation issue coverage needs an O-Level-specific verification pass. |
| Browser/session state | No intended browser-session source for class or learner subjects | React pages load through Supabase RPCs | Browser verification could not be completed in the current desktop session. |

## Compulsory load rules

- Senior 1–2: 10 fixed catalogue subjects plus one learner-selected CRE/IRE option; exactly one learner elective.
- Senior 3–4: seven fixed catalogue subjects; one or two learner electives.
- An approved SNE General Science replacement applies to that learner only. Earlier Physics, Biology, Chemistry and mark records remain historical.

## Duplicate-writer review

- The UI exposes one Create Class route, `/setup/classes/new`; programme-specific forms call the corresponding persistent creation RPC.
- O-Level class offerings are managed from the class workspace and derive from the school catalogue offerings. They must not be edited through the generic A-Level subject picker.
- Learner elective assignment has one manager page; marks and report pages are consumers, not subject-selection writers.
- The legacy `/setup/classes/:classId/edit` route does not currently have a complete O-Level edit implementation and must route to the class workspace or be implemented before use.

## Deployment control

Run `npm run migrate` to first synchronize migrations 053–054 from `database/migrations` to the matching Supabase migration files, then invoke `supabase db push`. Local source/mirror synchronization succeeds; the linked database has not received this change because the CLI role-permission failure occurs during login-role initialization, before SQL execution. Resolve that Supabase CLI role/bootstrap permission issue, retry the push, then verify the migration in the live schema and test authenticated workflows.
