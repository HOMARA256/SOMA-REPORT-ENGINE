-- Extend the existing school-scoped ID register with the staff telephone.
-- No phone number is exposed by the public card-verification endpoint.
create or replace function public.get_school_id_card_register(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
 if not public.is_school_admin_for(p_school_id) and not public.is_active_platform_admin() then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
 return jsonb_build_object(
  'learners',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',l.id,'fullName',concat_ws(' ',l.first_name,l.other_name,l.last_name),'admissionNumber',l.admission_number,'photoPath',l.profile_photo_path,
   'card',(select jsonb_build_object('id',c.id,'reference',c.card_reference,'verificationToken',c.secure_verification_token,'status',c.status,'issueDate',c.issue_date,'expiryDate',c.expiry_date)
      from public.identity_cards c where c.learner_id=l.id and c.school_id=p_school_id order by c.created_at desc limit 1),
   'cardHistory',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'reference',c.card_reference,'status',c.status,'issueDate',c.issue_date,'expiryDate',c.expiry_date) order by c.created_at desc),'[]'::jsonb) from public.identity_cards c where c.learner_id=l.id and c.school_id=p_school_id),
   'className',cl.class_name,'streamName',st.stream_name,'academicYear',y.name) order by l.last_name,l.first_name),'[]'::jsonb)
   from public.learners l left join lateral(select e.* from public.learner_class_enrolments e where e.learner_id=l.id and e.school_id=p_school_id and e.status='ACTIVE' and e.effective_to is null order by e.effective_from desc limit 1)e on true
   left join public.academic_classes cl on cl.id=e.class_id and cl.school_id=p_school_id left join public.class_streams st on st.id=e.stream_id and st.school_id=p_school_id left join public.academic_years y on y.id=e.academic_year_id and y.school_id=p_school_id where l.school_id=p_school_id and l.status='ACTIVE'),
  'staff',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',u.id,'fullName',u.full_name,'staffNumber',u.staff_number,'telephone',u.telephone,'department',u.department,'photoPath',u.profile_photo_path,'role',membership_role.code,
   'card',(select jsonb_build_object('id',c.id,'reference',c.card_reference,'verificationToken',c.secure_verification_token,'status',c.status,'issueDate',c.issue_date,'expiryDate',c.expiry_date) from public.identity_cards c where c.staff_id=u.id and c.school_id=p_school_id order by c.created_at desc limit 1),
   'cardHistory',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'reference',c.card_reference,'status',c.status,'issueDate',c.issue_date,'expiryDate',c.expiry_date) order by c.created_at desc),'[]'::jsonb) from public.identity_cards c where c.staff_id=u.id and c.school_id=p_school_id)) order by u.full_name),'[]'::jsonb)
   from public.users u join lateral(select r.code from public.school_memberships m join public.roles r on r.id=m.role_id where m.user_id=u.id and m.school_id=p_school_id and m.status='ACTIVE' and r.code not in ('LEARNER','PARENT_GUARDIAN','PLATFORM_ADMIN') order by (r.code='TEACHER') desc limit 1) membership_role on true
   where u.is_active and u.account_status='ACTIVE'));
end;
$$;
