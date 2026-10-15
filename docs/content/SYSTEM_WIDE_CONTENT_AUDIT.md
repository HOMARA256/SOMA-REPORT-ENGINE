# SOMA REPORT ENGINE content and terminology audit

## Language standard

- Product name: **SOMA REPORT ENGINE** in user-facing copy. Internal storage keys and stable subscription identifiers are not display text; they are retained to avoid invalidating existing sessions or billing records.
- Use **learner**, **staff member**, **class**, **stream**, **academic year**, **term**, **admission**, **subject offering**, **teacher allocation**, **assessment**, **marks**, **report**, and **subscription** consistently.
- Use direct action labels that name the operation. Distinguish a saved database record from an in-memory/session-only preview or draft.
- Do not show a success state until its stated result has actually completed. Explain the data and workflow boundary before the user acts.
- Do not call a policy or curriculum rule official unless its configured source and version have been verified.

## First implementation pass

| Route/component | Old wording | New wording | Reason |
| --- | --- | --- | --- |
| `/import-export` — photo import tab | “Student Photos” | “Learner photos” | Use the agreed role terminology. |
| `/import-export` — photo matching help | “Student photos match…” | “Learner photos match…” | Align instructions with the learner directory and its matching keys. |
| `/marks/marksheet` — screen and CSV heading | “Student Name” | “Learner name” | Keep exported and on-screen labels consistent. |
| `/learners/:id` — photo editor | “Student photo” | “Learner photo” | Use the learner term in profile actions. |
| `/id-cards` — learner card preview and generated PDF | “Student identity / Student ID card” | “Learner identity / Learner ID card” | The approved document title was not specified, so do not retain an unapproved “Student ID Card” exception. |
| `/learners/:id` — issue-card action | “Issue student ID” | “Issue learner ID” | Name the existing learner-card action using standard terminology. |
| `/admissions` — connected learner links | “Student ID cards” | “Learner ID cards” | Keep connected navigation consistent. |
| `/settings/school-profile` — profile text action | “Save School Profile” and “saved successfully” | “Apply for this session”; message states that profile text is session-only and not persisted | The underlying provider stores profile text in React state; it does not write it to the database. The prior copy overstated persistence. |
| `/settings/report-card/header` — report settings action | “Save” / “Save & Close” and “saved successfully” | Message states that settings apply for this session only and are not persisted | The settings provider is in-memory; success language must not imply durable storage. |

## Scope and remaining review

This pass changes user-facing copy only; no permissions, calculations, records, or workflow logic were changed. Stable schema names such as `student_id`, CSS identifiers such as `id-card--student`, auth storage keys, and plan codes remain untouched because they are not user-facing terminology and changing them could affect compatibility.

The route surface includes Platform Control Centre, School Control Centre, Admissions, O-Level and A-Level, Learners, Staff, Subjects, Assessments, Marks, Approvals, Reports, Subscriptions, Payments, Messages, Notifications, Settings, and authentication. These routes still need a state-by-state content review (loading, empty, success, warning, failure, restricted, and completed). This inventory is therefore a first implementation pass, not a claim that every route has been reviewed.

Items requiring a separate implementation/policy decision:

- School Profile and Report Card Settings are currently session-only; durable database persistence needs a separately authorized backend/settings change.
- Platform demo-school tools are test-fixture actions, not production school records. Their visibility and environment gating need review before removing them, since hiding them changes capability rather than copy.
- The term “Student ID Card” is only retained if the product owner explicitly approves it as the formal document title; current copy uses “Learner ID Card”.
- Invitation email and PDF output copy should be reviewed with their actual templates and generated files, not only the React screens.
- System-wide rendering/browser checks at desktop and mobile widths remain to be completed for pages not changed in this pass.
