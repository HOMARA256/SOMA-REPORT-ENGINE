import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL("../database/migrations/096_shared_guardians_and_religious_education_groups.sql", import.meta.url);
const deployedMigration = new URL("../supabase/migrations/20261011200000_shared_guardians_and_religious_education_groups.sql", import.meta.url);

test("guardian identity is school-scoped and each learner link keeps its own relationship and permissions", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create table if not exists public\.school_guardians/);
  assert.match(sql, /unique \(id,school_id\)/);
  assert.match(sql, /foreign key\(guardian_id,school_id\) references public\.school_guardians\(id,school_id\)/);
  assert.match(sql, /is_emergency boolean not null default false/);
  assert.match(sql, /communication_permissions jsonb not null/);
  assert.match(sql, /Existing rows are each\s+-- migrated to their own guardian record: similar names\/phones are NOT merged/);
  assert.match(sql, /on public\.learner_guardians\(learner_id,guardian_id\)/);
});

test("admissions supports explicit same-school matches or a separate new guardian and atomically links the learner", async () => {
  const [sql, page] = await Promise.all([readFile(migration, "utf8"), readFile(new URL("../apps/web/src/features/admissions/AdmissionsPage.tsx", import.meta.url), "utf8")]);
  assert.match(sql, /function public\.search_school_guardians\(p_school_id uuid,p_query text/);
  assert.match(sql, /where school_id=p_school_id/);
  assert.match(sql, /function public\.admit_school_applicant_as_learner_with_guardian/);
  assert.match(sql, /function public\.link_school_guardian_to_learner/);
  assert.match(sql, /relationship=excluded\.relationship,is_primary=excluded\.is_primary,is_emergency=excluded\.is_emergency/);
  assert.match(sql, /communication_permissions=excluded\.communication_permissions/);
  assert.match(sql, /public\.admit_school_applicant_as_learner\(p_school_id,p_application_id/);
  assert.match(page, /Search only this school’s guardian directory/);
  assert.match(page, /A similar name or shared phone is only a possible match/);
  assert.match(page, /Create a new guardian record/);
  assert.match(page, /p_communication_permissions: guardianPermissions/);
});

test("guardian self-service only returns same-school linked learners and shared-contact edits synchronize learner views", async () => {
  const [sql, page] = await Promise.all([readFile(migration, "utf8"), readFile(new URL("../apps/web/src/features/learners/GuardianLearnersPage.tsx", import.meta.url), "utf8")]);
  assert.match(sql, /function public\.get_guardian_linked_learners\(p_school_id uuid\)/);
  assert.match(sql, /g\.school_id=p_school_id and g\.auth_user_id=auth\.uid\(\)/);
  assert.match(sql, /lg\.school_id=p_school_id/);
  assert.match(sql, /sync_guardian_contact_to_learner_links/);
  assert.match(sql, /update public\.learners l set guardian_name=new\.full_name,guardian_phone=new\.phone/);
  assert.match(page, /get_guardian_linked_learners/);
  assert.match(page, /update_school_guardian_profile/);
  const profile = await readFile(new URL("../apps/web/src/features/learners/LearnerGuardianLinksPanel.tsx", import.meta.url), "utf8");
  assert.match(profile, /link_school_guardian_to_learner/);
  assert.match(profile, /without changing sibling links/);
});

test("CRE and IRE are a rule-set-configured group with available-offering validation, not a religion inference", async () => {
  const [sql, existingValidator, catalogue, page, learnerPage] = await Promise.all([
    readFile(migration, "utf8"),
    readFile(new URL("../database/migrations/067_o_level_subject_selection_rules.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/migrations/054_ncdc_o_level_curriculum.sql", import.meta.url), "utf8"),
    readFile(new URL("../apps/web/src/features/admissions/AdmissionsPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../apps/web/src/features/learners/LearnerSubjectsPage.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(sql, /religion_min_s1_s2 integer not null default 1/);
  assert.match(sql, /religion_max_s1_s2 integer not null default 1/);
  for (const code of ["223", "225"]) assert.match(catalogue, new RegExp(`\\(1,'${code}','RELIGION_OPTION'`));
  assert.match(sql, /v_religion_count<v_rules\.religion_min_s1_s2 or v_religion_count>v_rules\.religion_max_s1_s2/);
  assert.match(existingValidator, /v_valid_religion<>v_religion_count/);
  assert.match(learnerPage, /p_enrolment_id: data\.enrolmentId/);
  assert.match(sql, /RELIGIOUS_EDUCATION_GROUP_SELECTION_LIMIT/);
  assert.match(page, /actually available to this class and stream/);
  assert.match(page, /item\.streamId === streamId/);
  assert.match(learnerPage, /learner-specific and does not infer religion/);
  assert.match(learnerPage, /class\/stream/);
  assert.match(existingValidator, /academic_mark_records/);
  assert.match(existingValidator, /set status='DROPPED'/);
  assert.match(existingValidator, /class_subject_offerings/);
  assert.match(existingValidator, /assessment_subject_papers/);
  assert.match(existingValidator, /report_snapshots/);
});

test("the deployable migration is byte-identical to its database source", async () => {
  const [source, deployed, pushScript] = await Promise.all([
    readFile(migration), readFile(deployedMigration),
    readFile(new URL("../scripts/push-admissions-completion.ps1", import.meta.url), "utf8"),
  ]);
  const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
  assert.equal(digest(source), digest(deployed));
  assert.match(pushScript, /20261011200000_shared_guardians_and_religious_education_groups\.sql/);
});

test("teacher invitation uses a single-use manual link fallback when Auth email delivery is blocked", async () => {
  const [fn, page, acceptPage, migration, mirror, resolver, context] = await Promise.all([
    readFile(new URL("../supabase/functions/invite-school-teacher/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../apps/web/src/features/staff/staffUsersPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../apps/web/src/features/auth/TeacherInvitationAcceptPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20261013110000_school_scoped_teacher_invitations.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/migrations/097_school_branded_teacher_invitations.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/resolve-current-user/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../apps/web/src/features/context/SchoolContext.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(fn, /auth\.admin\.generateLink/);
  assert.match(fn, /properties\?\.action_link/);
  assert.match(fn, /p_auth_user_id: targetAuthUserId/);
  assert.match(fn, /activationLink: invitationSent \? null : actionLink/);
  assert.match(fn, /SCHOOL_INVITATION_FROM_EMAIL/);
  assert.match(fn, /email_confirmed_at \? "magiclink" : "invite"/);
  assert.match(page, /One-time teacher activation link/);
  assert.match(page, /verified channel/);
  assert.match(acceptPage, /Your membership was accepted, but this school session could not be refreshed yet/);
  assert.match(migration, /lower\(v_auth\.email\) is distinct from v_invitation\.invited_email/);
  assert.match(migration, /target_auth_user_id<>v_auth\.id/);
  assert.match(migration, /insert into public\.school_memberships\(school_id,user_id,role_id,status\)/);
  assert.match(migration, /status in \('PENDING','SENT'\)/);
  assert.equal(migration, mirror);
  assert.match(resolver, /school_user_context_preferences/);
  assert.match(resolver, /item\.school_id===preference\?\.school_id/);
  assert.match(context, /rpc\("set_my_school_context"/);
  assert.match(context, /applyResolvedIdentity\(resolved\.user\)/);
});
