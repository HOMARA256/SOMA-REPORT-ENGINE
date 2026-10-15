import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const copies = [
  ["database/migrations/053_a_level_class_foundation.sql", "supabase/migrations/20261002113000_a_level_class_foundation.sql"],
  ["database/migrations/054_ncdc_o_level_curriculum.sql", "supabase/migrations/20261002140000_ncdc_o_level_curriculum.sql"],
  ["database/migrations/055_o_level_workspace_rpc_hotfix.sql", "supabase/migrations/20261003120000_o_level_workspace_rpc_hotfix.sql"],
  ["database/migrations/056_persistent_platform_school_controls.sql", "supabase/migrations/20261004100000_persistent_platform_school_controls.sql"],
  ["database/migrations/057_platform_school_control_rpc_refresh.sql", "supabase/migrations/20261004120000_platform_school_control_rpc_refresh.sql"],
  ["database/migrations/058_idempotent_teacher_allocations.sql", "supabase/migrations/20261004140000_idempotent_teacher_allocations.sql"],
  ["database/migrations/060_fix_school_subject_activation_audit_fk.sql", "supabase/migrations/20261004150000_fix_school_subject_activation_audit_fk.sql"],
  ["database/migrations/059_persistent_academic_assessments.sql", "supabase/migrations/20261004160000_persistent_academic_assessments.sql"],
  ["database/migrations/061_fix_school_subject_activation_profile_audit_fk.sql", "supabase/migrations/20261004170000_fix_school_subject_activation_profile_audit_fk.sql"],
  ["database/migrations/062_persistent_mark_submission_moderation.sql", "supabase/migrations/20261005100000_persistent_mark_submission_moderation.sql"],
  ["database/migrations/063_persistent_result_locks_and_approvals.sql", "supabase/migrations/20261005110000_persistent_result_locks_and_approvals.sql"],
  ["database/migrations/064_activate_compulsory_o_level_subjects.sql", "supabase/migrations/20261005120000_activate_compulsory_o_level_subjects.sql"],
  ["database/migrations/065_fix_subject_activation_actor_and_required_offerings.sql", "supabase/migrations/20261005130000_fix_subject_activation_actor_and_required_offerings.sql"],
  ["database/migrations/066_platform_school_coordination_health.sql", "supabase/migrations/20261005140000_platform_school_coordination_health.sql"],
  ["database/migrations/068_persistent_school_teacher_accounts.sql", "supabase/migrations/20261005170000_persistent_school_teacher_accounts.sql"],
  ["database/migrations/075_separate_people_directories.sql", "supabase/migrations/20261008170000_separate_people_directories.sql"],
  ["database/migrations/077_fix_school_branding_storage_rls.sql", "supabase/migrations/20261008190000_fix_school_branding_storage_rls.sql"],
  ["database/migrations/078_mobile_money_payment_initiation.sql", "supabase/migrations/20261009100000_mobile_money_payment_initiation.sql"],
  ["database/migrations/079_school_branding_storage_select_policy.sql", "supabase/migrations/20261009110000_school_branding_storage_select_policy.sql"],
  ["database/migrations/080_person_profile_photos.sql", "supabase/migrations/20261009120000_person_profile_photos.sql"],
  ["database/migrations/081_school_platform_message_centre.sql", "supabase/migrations/20261009130000_school_platform_message_centre.sql"],
  ["database/migrations/082_fix_school_platform_message_notifications.sql", "supabase/migrations/20261009140000_fix_school_platform_message_notifications.sql"],
  ["database/migrations/083_unread_message_notification_bell.sql", "supabase/migrations/20261009150000_unread_message_notification_bell.sql"],
  ["database/migrations/084_online_admissions_digital_ids_document_library.sql", "supabase/migrations/20261009160000_online_admissions_digital_ids_document_library.sql"],
  ["database/migrations/085_lock_school_admission_sequences.sql", "supabase/migrations/20261009170000_lock_school_admission_sequences.sql"],
  ["database/migrations/086_school_entered_admission_drafts.sql", "supabase/migrations/20261011100000_school_entered_admission_drafts.sql"],
  ["database/migrations/087_versioned_admission_records.sql", "supabase/migrations/20261011110000_versioned_admission_records.sql"],
  ["database/migrations/088_identity_card_print_snapshots.sql", "supabase/migrations/20261011120000_identity_card_print_snapshots.sql"],
  ["database/migrations/089_identity_card_print_documents.sql", "supabase/migrations/20261011130000_identity_card_print_documents.sql"],
  ["database/migrations/090_school_admission_document_uploads.sql", "supabase/migrations/20261011140000_school_admission_document_uploads.sql"],
  ["database/migrations/092_fix_identity_card_random_bytes_and_audit_profile_fk.sql", "supabase/migrations/20261011160000_fix_identity_card_random_bytes_and_audit_profile_fk.sql"],
  ["database/migrations/093_school_admin_staff_number_for_identity_cards.sql", "supabase/migrations/20261011170000_school_admin_staff_number_for_identity_cards.sql"],
  ["database/migrations/094_fix_public_admission_digest_search_path.sql", "supabase/migrations/20261011180000_fix_public_admission_digest_search_path.sql"],
  ["database/migrations/095_pending_learners_from_accepted_admissions.sql", "supabase/migrations/20261011190000_pending_learners_from_accepted_admissions.sql"],
  ["database/migrations/096_shared_guardians_and_religious_education_groups.sql", "supabase/migrations/20261011200000_shared_guardians_and_religious_education_groups.sql"],
  ["database/migrations/097_school_branded_teacher_invitations.sql", "supabase/migrations/20261013110000_school_scoped_teacher_invitations.sql"],
  ["database/migrations/098_teacher_recovery_dashboard_scope.sql", "supabase/migrations/20261013130000_teacher_recovery_dashboard_scope.sql"],
  ["database/migrations/099_teacher_invitation_admin_activation.sql", "supabase/migrations/20261014100000_teacher_invitation_admin_activation.sql"],
  ["database/migrations/100_school_admin_teacher_reactivation.sql", "supabase/migrations/20261014110000_school_admin_teacher_reactivation.sql"],
  ["database/migrations/101_teacher_invitation_states_and_decline.sql", "supabase/migrations/20261014120000_teacher_invitation_states_and_decline.sql"],
  ["database/migrations/102_persistent_teacher_membership_lifecycle.sql", "supabase/migrations/20261014130000_persistent_teacher_membership_lifecycle.sql"],
  ["database/migrations/103_teacher_invitation_membership_status_text.sql", "supabase/migrations/20261014140000_teacher_invitation_membership_status_text.sql"],
  ["database/migrations/104_school_scoped_teacher_access.sql", "supabase/migrations/20261014150000_school_scoped_teacher_access.sql"],
  ["database/migrations/105_teacher_account_access_escalation.sql", "supabase/migrations/20261014160000_teacher_account_access_escalation.sql"],
  ["database/migrations/106_teacher_account_access_notification_retry.sql", "supabase/migrations/20261014170000_teacher_account_access_notification_retry.sql"],
  ["database/migrations/107_teacher_invitation_global_account_status.sql", "supabase/migrations/20261014180000_teacher_invitation_global_account_status.sql"],
  ["database/migrations/108_fix_teacher_invitation_membership_status_enum.sql", "supabase/migrations/20261014190000_fix_teacher_invitation_membership_status_enum.sql"],
  ["database/migrations/109_teacher_invitation_platform_review_status.sql", "supabase/migrations/20261014200000_teacher_invitation_platform_review_status.sql"],
  ["database/migrations/110_distinguish_teacher_onboarding_from_platform_lock.sql", "supabase/migrations/20261014210000_distinguish_teacher_onboarding_from_platform_lock.sql"],
  ["database/migrations/111_teacher_invitation_activated_context.sql", "supabase/migrations/20261014220000_teacher_invitation_activated_context.sql"],
  ["database/migrations/112_platform_operational_observability.sql", "supabase/migrations/20261014230000_platform_operational_observability.sql"],
  ["database/migrations/113_teacher_id_signatures.sql", "supabase/migrations/20261015090000_teacher_id_signatures.sql"],
  ["database/migrations/114_school_headteacher_signature.sql", "supabase/migrations/20261015100000_school_headteacher_signature.sql"],
  ["database/migrations/115_o_level_integration_activity_marks.sql", "supabase/migrations/20261015110000_o_level_integration_activity_marks.sql"],
  ["database/migrations/116_o_level_dynamic_activities_report_policy.sql", "supabase/migrations/20261015120000_o_level_dynamic_activities_report_policy.sql"],
  ["database/migrations/117_school_teacher_message_centre.sql", "supabase/migrations/20261015130000_school_teacher_message_centre.sql"],
];

for (const [sourcePath, destinationPath] of copies) {
  let sourceBytes;
  const destination = resolve(root, destinationPath);
  const sourceFile = resolve(root, sourcePath);
  let existing;
  try {
    sourceBytes = await readFile(sourceFile);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    existing = await readFile(destination);
    await writeFile(resolve(root, sourcePath), existing);
    sourceBytes = existing;
  }

  try { existing = await readFile(destination); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }

  if (!existing || !sourceBytes.equals(existing)) await writeFile(destination, sourceBytes);
  const digest = createHash("sha256").update(sourceBytes).digest("hex");
  console.log(`${sourcePath} -> ${destinationPath} (${digest})`);
}
