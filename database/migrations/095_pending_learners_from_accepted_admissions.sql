begin;

-- Accepted applicants become visible school-scoped learner records, but remain
-- inactive until the final class, stream, and subject setup is completed.
alter table public.learners drop constraint if exists learners_status;
alter table public.learners add constraint learners_status
  check (status in ('ACTIVE','INACTIVE','WITHDRAWN','COMPLETED','GRADUATED','PENDING_APPROVAL'));

alter table public.admission_applications
  add column if not exists pending_learner_id uuid references public.learners(id) on delete restrict;
create unique index if not exists admission_applications_pending_learner_key
  on public.admission_applications(pending_learner_id) where pending_learner_id is not null;

-- Include the staging link and keep the staged learner out of the duplicate
-- candidate list shown beside its own application.
create or replace function public.get_school_admissions_workspace(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.can_manage_admissions(p_school_id) then raise exception 'ADMISSIONS_PERMISSION_REQUIRED'; end if;
  return jsonb_build_object(
    'academicYears',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status) order by starts_on desc),'[]'::jsonb) from public.academic_years where school_id=p_school_id),
    'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'yearId',c.academic_year_id,'name',c.class_name,'level',c.level,'programme',c.programme,'status',c.status,'electiveMin',(select case when c.level<=2 then rules.elective_min_s1_s2 else rules.elective_min_s3_s4 end from public.o_level_curriculum_rule_sets rules where rules.id=c.o_level_rule_set_id),'electiveMax',(select case when c.level<=2 then rules.elective_max_s1_s2 else rules.elective_max_s3_s4 end from public.o_level_curriculum_rule_sets rules where rules.id=c.o_level_rule_set_id),'streams',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.stream_name) order by s.stream_name),'[]'::jsonb) from public.class_streams s where s.school_id=c.school_id and s.class_id=c.id and s.status='ACTIVE'),'offerings',(select coalesce(jsonb_agg(jsonb_build_object('id',co.id,'name',coalesce(so.display_name_override,ss.subject_name,so.school_subject_code),'code',coalesce(so.school_subject_code,ss.subject_code),'compulsory',co.is_compulsory,'requirement',rule.requirement) order by co.is_compulsory desc,coalesce(so.display_name_override,ss.subject_name,so.school_subject_code)),'[]'::jsonb) from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id left join public.system_subjects ss on ss.id=so.system_subject_id left join public.o_level_curriculum_subject_rules rule on rule.system_subject_id=so.system_subject_id and rule.rule_set_id=c.o_level_rule_set_id and rule.class_level=c.level and rule.is_active where co.school_id=c.school_id and co.class_id=c.id and co.academic_year_id=c.academic_year_id and co.status='ACTIVE' and so.status='ACTIVE')) order by level,class_name),'[]'::jsonb) from public.academic_classes c where c.school_id=p_school_id),
    'aLevelCombinations',(select coalesce(jsonb_agg(jsonb_build_object('id',ac.id,'academicYearId',ac.academic_year_id,'yearName',y.name,'code',ac.code,'name',ac.name,'level',ac.level,'subjects',(select coalesce(jsonb_agg(jsonb_build_object('code',so.school_subject_code,'name',coalesce(so.display_name_override,ss.subject_name,so.school_subject_code),'role',acs.subject_role) order by acs.display_order),'[]'::jsonb) from public.a_level_combination_subjects acs join public.school_subject_offerings so on so.id=acs.school_subject_offering_id and so.school_id=p_school_id and so.status='ACTIVE' left join public.system_subjects ss on ss.id=so.system_subject_id where acs.combination_id=ac.id)) order by y.starts_on desc,ac.code),'[]'::jsonb) from public.a_level_combinations ac join public.academic_years y on y.id=ac.academic_year_id and y.school_id=p_school_id where ac.school_id=p_school_id and ac.status='ACTIVE'),
    'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'role',r.code,'email',u.email) order by u.full_name),'[]'::jsonb) from public.users u join public.school_memberships m on m.user_id=u.id join public.roles r on r.id=m.role_id where m.school_id=p_school_id and m.status='ACTIVE' and u.is_active and u.account_status='ACTIVE' and r.code not in ('SCHOOL_ADMIN','PLATFORM_ADMIN','LEARNER','PARENT_GUARDIAN')),
    'admissionsOfficers',(select coalesce(jsonb_agg(jsonb_build_object('userId',hist.user_id,'name',u.full_name,'email',u.email,'assignedAt',hist.assigned_at,'previousRole',prev.name) order by u.full_name),'[]'::jsonb) from public.school_admission_officer_role_history hist join public.users u on u.id=hist.user_id join public.roles prev on prev.id=hist.previous_role_id where hist.school_id=p_school_id and hist.restored_at is null),
    'openings',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'yearId',o.academic_year_id,'yearName',y.name,'title',o.title,'targetClassLevels',o.target_class_levels,'openingDate',o.opening_date,'closingDate',o.closing_date,'status',o.status,'reportingRequirements',o.reporting_requirements,'requiredDocuments',o.required_documents,'applicationCount',(select count(*) from public.admission_applications a where a.admission_opening_id=o.id)) order by o.created_at desc),'[]'::jsonb) from public.admission_openings o join public.academic_years y on y.id=o.academic_year_id where o.school_id=p_school_id),
    'applications',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'openingId',a.admission_opening_id,'openingTitle',o.title,'academicYearId',o.academic_year_id,'classLevel',a.intended_class_level,'reference',a.application_reference,'learner',a.learner_details,'guardian',a.guardian_details,'status',a.status,'submittedAt',a.submitted_at,'decisionReason',a.decision_reason,'interviewAt',a.interview_at,'convertedLearnerId',a.converted_learner_id,'pendingLearnerId',a.pending_learner_id,'possibleLearners',(select coalesce(jsonb_agg(jsonb_build_object('id',candidate.id,'fullName',concat_ws(' ',candidate.first_name,candidate.other_name,candidate.last_name),'admissionNumber',candidate.admission_number,'status',candidate.status,'dateOfBirth',candidate.date_of_birth)),'[]'::jsonb) from (select l.* from public.learners l where l.school_id=p_school_id and l.id is distinct from a.pending_learner_id and lower(trim(l.first_name))=lower(trim(a.learner_details->>'firstName')) and lower(trim(l.last_name))=lower(trim(a.learner_details->>'lastName')) and coalesce(nullif(trim(l.guardian_phone),''),'')=coalesce(nullif(trim(a.guardian_details->>'phone'),''),'') and (nullif(a.learner_details->>'dateOfBirth','') is null or l.date_of_birth is null or l.date_of_birth=(a.learner_details->>'dateOfBirth')::date) limit 5) candidate),'missingRequiredDocuments',(select coalesce(jsonb_agg(req->>'type'),'[]'::jsonb) from jsonb_array_elements(o.required_documents) req where coalesce((req->>'required')::boolean,false) and not exists(select 1 from public.admission_application_documents d where d.admission_application_id=a.id and d.document_type=req->>'type' and d.status='VERIFIED')),'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'fileName',d.file_name,'mimeType',d.mime_type,'fileSize',d.file_size,'path',d.storage_path,'status',d.status)),'[]'::jsonb) from public.admission_application_documents d where d.admission_application_id=a.id)) order by a.submitted_at desc nulls last,a.created_at desc),'[]'::jsonb) from public.admission_applications a join public.admission_openings o on o.id=a.admission_opening_id where a.school_id=p_school_id)
  );
end;
$$;

create or replace function public.review_school_admission_application(
  p_school_id uuid,p_application_id uuid,p_status text,
  p_decision_reason text default null,p_interview_at timestamptz default null
)
returns uuid language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare
  v_app public.admission_applications%rowtype;
  v_actor uuid;
  v_year uuid;
  v_next integer;
  v_code text;
  v_number text;
  v_learner_id uuid;
  v_first text;
  v_last text;
  v_dob date;
  v_duplicate boolean;
begin
  if not public.can_manage_admissions(p_school_id) then raise exception 'ADMISSIONS_PERMISSION_REQUIRED'; end if;
  if p_status not in ('UNDER_REVIEW','MORE_INFORMATION_REQUIRED','INTERVIEW_REQUIRED','ACCEPTED','WAITLISTED','REJECTED','WITHDRAWN','EXPIRED') then raise exception 'APPLICATION_STATUS_INVALID'; end if;
  select * into v_app from public.admission_applications where id=p_application_id and school_id=p_school_id for update;
  if v_app.id is null or v_app.status in ('DRAFT','CONVERTED_TO_LEARNER') then raise exception 'APPLICATION_NOT_REVIEWABLE'; end if;
  v_actor:=public.current_app_user_id();

  if p_status='ACCEPTED' and v_app.converted_learner_id is null and v_app.pending_learner_id is null then
    select o.academic_year_id into v_year from public.admission_openings o
      where o.id=v_app.admission_opening_id and o.school_id=p_school_id;
    if v_year is null then raise exception 'ADMISSION_OPENING_NOT_FOUND'; end if;
    v_first:=trim(v_app.learner_details->>'firstName');
    v_last:=trim(v_app.learner_details->>'lastName');
    v_dob:=nullif(v_app.learner_details->>'dateOfBirth','')::date;
    select exists(select 1 from public.learners l where l.school_id=p_school_id
      and lower(trim(l.first_name))=lower(v_first) and lower(trim(l.last_name))=lower(v_last)
      and coalesce(nullif(trim(l.guardian_phone),''),'')=coalesce(nullif(trim(v_app.guardian_details->>'phone'),''),'')
      and (v_dob is null or l.date_of_birth is null or l.date_of_birth=v_dob)) into v_duplicate;
    -- Potential duplicate profiles require an explicit match in Admissions;
    -- do not silently make a second learner record.
    if not v_duplicate then
      insert into public.school_admission_sequences(school_id,academic_year_id,next_number)
        values(p_school_id,v_year,2)
        on conflict(school_id,academic_year_id) do update
          set next_number=public.school_admission_sequences.next_number+1
        returning next_number-1 into v_next;
      select school_code into v_code from public.schools where id=p_school_id;
      v_number:=upper(regexp_replace(coalesce(v_code,'SCHOOL'),'[^A-Za-z0-9]','','g'))||'/'||
        (select name from public.academic_years where id=v_year)||'/'||lpad(v_next::text,4,'0');
      insert into public.learners(school_id,admission_number,first_name,other_name,last_name,gender,
        date_of_birth,guardian_name,guardian_phone,status,created_by,updated_by)
      values(p_school_id,v_number,v_first,nullif(trim(v_app.learner_details->>'otherName'),''),v_last,
        nullif(v_app.learner_details->>'gender',''),v_dob,trim(v_app.guardian_details->>'fullName'),
        nullif(trim(v_app.guardian_details->>'phone'),''),'PENDING_APPROVAL',v_actor,v_actor)
      returning id into v_learner_id;
      update public.admission_applications set pending_learner_id=v_learner_id where id=v_app.id;
    end if;
  elsif p_status<>'ACCEPTED' and v_app.pending_learner_id is not null then
    update public.learners set status='INACTIVE',updated_at=now(),updated_by=v_actor
      where id=v_app.pending_learner_id and school_id=p_school_id and status='PENDING_APPROVAL';
  end if;

  update public.admission_applications set status=p_status,
    decision_reason=nullif(trim(coalesce(p_decision_reason,'')),''),
    interview_at=case when p_status='INTERVIEW_REQUIRED' then p_interview_at else null end,
    reviewed_by=v_actor,updated_at=now() where id=v_app.id;
  insert into public.admission_applicant_notifications(admission_application_id,event_type,title,message)
    values(v_app.id,p_status,replace(p_status,'_',' '),
      coalesce(nullif(trim(p_decision_reason),''),case when p_status='MORE_INFORMATION_REQUIRED'
        then 'Please contact the school or sign in to your application to review the information requested.'
        when p_status='ACCEPTED' then 'Your application has been accepted. The school will complete approval, class placement, and subject setup.'
        else 'Your application status has been updated.' end));
  insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
  select p_school_id,u.auth_user_id,'ADMISSIONS','ADMISSION_STATUS_CHANGED','Admission application updated',
    'Application '||v_app.application_reference||' is now '||p_status||'.','admission_application',v_app.id,
    'admission:status:'||v_app.id||':'||p_status||':'||floor(extract(epoch from clock_timestamp()))::text
  from public.users u where u.auth_user_id is not null and u.id in
    (select m.user_id from public.school_memberships m join public.roles r on r.id=m.role_id
      where m.school_id=p_school_id and m.status='ACTIVE' and r.code='SCHOOL_ADMIN');
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  select u.id,u.full_name,r.code,'ADMISSION_APPLICATION_'||p_status,'admission_application',v_app.id::text,
    jsonb_build_object('decision_reason',p_decision_reason,'interview_at',p_interview_at,
      'pending_learner_id',coalesce(v_app.pending_learner_id,v_learner_id))
  from public.users u join public.school_memberships m on m.user_id=u.id
    join public.roles r on r.id=m.role_id
  where m.school_id=p_school_id and u.auth_user_id=auth.uid() and m.status='ACTIVE' limit 1;
  return v_app.id;
end;
$$;

-- Reuse the existing atomic validator/converter. The wrapper only supplies the
-- already staged learner ID, so the final conversion activates the same record.
alter function public.admit_school_applicant_as_learner(uuid,uuid,uuid,uuid,date,uuid[],uuid[],uuid,uuid)
  rename to admit_school_applicant_as_learner_before_pending_workflow;
revoke all on function public.admit_school_applicant_as_learner_before_pending_workflow(uuid,uuid,uuid,uuid,date,uuid[],uuid[],uuid,uuid)
  from public,anon,authenticated;
create or replace function public.admit_school_applicant_as_learner(
  p_school_id uuid,p_application_id uuid,p_class_id uuid,p_stream_id uuid,p_admission_date date,
  p_religion_offering_ids uuid[] default '{}',p_elective_offering_ids uuid[] default '{}',
  p_a_level_combination_id uuid default null,p_existing_learner_id uuid default null
)
returns uuid language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare v_pending uuid; v_selected uuid;
begin
  if not public.can_manage_admissions(p_school_id) then raise exception 'ADMISSIONS_PERMISSION_REQUIRED'; end if;
  select pending_learner_id into v_pending from public.admission_applications
    where id=p_application_id and school_id=p_school_id and status='ACCEPTED' for update;
  if not found then raise exception 'ACCEPTED_APPLICATION_REQUIRED'; end if;
  if v_pending is not null and p_existing_learner_id is not null and v_pending<>p_existing_learner_id then
    raise exception 'PENDING_LEARNER_LINK_MISMATCH';
  end if;
  v_selected:=coalesce(v_pending,p_existing_learner_id);
  return public.admit_school_applicant_as_learner_before_pending_workflow(
    p_school_id,p_application_id,p_class_id,p_stream_id,p_admission_date,
    p_religion_offering_ids,p_elective_offering_ids,p_a_level_combination_id,v_selected);
end;
$$;
revoke all on function public.admit_school_applicant_as_learner(uuid,uuid,uuid,uuid,date,uuid[],uuid[],uuid,uuid)
  from public,anon;
grant execute on function public.review_school_admission_application(uuid,uuid,text,text,timestamptz),
  public.admit_school_applicant_as_learner(uuid,uuid,uuid,uuid,date,uuid[],uuid[],uuid,uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
