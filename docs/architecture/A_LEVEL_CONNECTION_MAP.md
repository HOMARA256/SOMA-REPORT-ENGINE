# SOMA REPORT ENGINE A-Level connection map

## Current authoritative foundations

| Workflow area | Existing source | Connection status |
| --- | --- | --- |
| School identity and membership | `schools`, `users`, `school_memberships` in migrations 001–002 | Database/RLS foundation exists; school UI still uses the demo principal. |
| Academic year and term | `academic_years`, `terms`; shared top-bar context | Shared in the web workspace, but not yet loaded from an authenticated API session. |
| System subjects and papers | `system_subjects`, `system_subject_papers` in migration 004 | Versioned reference structure exists. Paper content remains pending verification where no authority is supplied. |
| School offerings and classes | `school_subject_offerings`, `class_subject_offerings`, `academic_classes`, `class_streams` | Relational schema exists; the web demo currently uses in-memory records. |
| Combinations and learner resolution | `subject_combinations`, `combination_subjects`, `learner_*_enrolments` | Relational schema exists; connected A-Level services and pages are still required. |
| Teachers and allocations | Existing staff/users plus `teacher_allocations` | One teacher identity model exists. A-Level allocation service and paper scope are still required. |
| Assessment and marks | Reusable assessment/marks UI; paper-aware A-Level entry | A-Level paper calculation is connected in shared web state. Persistent assessment/mark tables and APIs are still required. |
| Grading | Versioned A-Level web configuration | Category-safe grading exists in shared web state. Persistent grading tables/API and immutable result records are still required. |
| Moderation/results/reports | Existing O-Level workflow, report snapshots and API service contracts | Must be extended with programme-aware A-Level records; it must not reuse O-Level calculation. |
| Import/export and audit | Migration 008 and service contracts | Reusable foundation exists; A-Level paper imports must target the same future mark service. |

## Connected route strategy

- `/school/alevel` is the A-Level workflow entry point.
- Existing school pages remain canonical where they already provide the capability: learners, subjects, teachers, assessments, marks, missing marks, moderation, results, reports, imports and settings.
- Workflow links preserve `programme=A_LEVEL` and the applicable level in the query string until route-level context is moved to the authenticated API session.
- No second learner, teacher, school, subject-catalogue or report identity model is introduced.

## Required backend phases

1. AC-2: extend the verified subject/paper catalogue and school-offering API.
2. AC-3: transactional combination assignment and learner-subject resolution.
3. AC-4: teacher/paper allocation service with assignment authorization.
4. AC-5: assessment expectations and persistent paper marks.
5. AC-6–AC-9: immutable calculation, grading, moderation, results and report snapshots.
6. AC-10–AC-12: shared imports, security tests, RLS tests and end-to-end hardening.

The browser must not claim persistence until these services are connected. The current demo label remains visible for that reason.
