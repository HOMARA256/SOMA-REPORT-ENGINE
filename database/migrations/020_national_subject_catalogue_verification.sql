-- National secondary subject catalogue verification.
-- Codes and paper references are populated only where the UNEB 2025 secondary
-- registration circular states them explicitly. Stable subject IDs and statuses
-- are preserved; the legacy Religious Education alias remains an audit finding.

update public.system_subjects set subject_code = '112', exam_body='UNEB', verification_status='VERIFIED', updated_at = now()
where programme = 'O_LEVEL' and subject_name = 'English Language';
update public.system_subjects set subject_code = '456', exam_body='UNEB', verification_status='VERIFIED', updated_at = now()
where programme = 'O_LEVEL' and subject_name = 'Mathematics';
update public.system_subjects set subject_code = '535', exam_body='UNEB', verification_status='VERIFIED', updated_at = now()
where programme = 'O_LEVEL' and subject_name = 'Physics';
update public.system_subjects set subject_code = '545', exam_body='UNEB', verification_status='VERIFIED', updated_at = now()
where programme = 'O_LEVEL' and subject_name = 'Chemistry';
update public.system_subjects set subject_code = '553', exam_body='UNEB', verification_status='VERIFIED', updated_at = now()
where programme = 'O_LEVEL' and subject_name = 'Biology';
update public.system_subjects set subject_code = '273', exam_body='UNEB', verification_status='VERIFIED', updated_at = now()
where programme = 'O_LEVEL' and subject_name = 'Geography';
update public.system_subjects set subject_code = '241', exam_body='UNEB', verification_status='VERIFIED', updated_at = now()
where programme = 'O_LEVEL' and subject_name in ('History & Political Education', 'History and Political Education');
update public.system_subjects set subject_code = 'S101', exam_body='UNEB', verification_status='VERIFIED', updated_at = now()
where programme = 'A_LEVEL' and subject_name = 'General Paper';
