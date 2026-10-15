-- Connected approval operations, notifications and report-job queue.

insert into public.roles(code,name,description,is_system_role) values
('HEAD_TEACHER','Head Teacher','Highest school-level approver.',true),
('DIRECTOR_OF_STUDIES','Director of Studies','Academic quality, moderation and workflow approver.',true),
('TEACHER','Teacher','Submits assigned academic work for review.',true),
('LEARNER','Learner','Views own authorised school records and published reports.',true)
on conflict(code) do update set name=excluded.name,description=excluded.description;

alter table public.approval_audit_events alter column approval_request_id drop not null;

create or replace function public.current_app_user_id()
returns uuid language sql stable security definer set search_path=public as $$
  select id from public.users where auth_user_id=auth.uid() and is_active=true limit 1
$$;
revoke all on function public.current_app_user_id() from public,anon;
grant execute on function public.current_app_user_id() to authenticated;

create or replace function public.create_approval_delegation(
 p_school_id uuid,p_delegate_from_user_id uuid,p_delegate_to_user_id uuid,p_approval_types text[],
 p_maximum_amount_minor bigint,p_starts_at timestamptz,p_ends_at timestamptz,p_reason text)
returns public.approval_delegations language plpgsql security definer set search_path=public as $$
declare v_actor uuid; v_actor_role text; v_from_role text; v_to_role text; v_row public.approval_delegations; v_auth uuid;
begin
 v_actor:=public.current_app_user_id();
 select r.code into v_actor_role from public.school_memberships m join public.roles r on r.id=m.role_id where m.school_id=p_school_id and m.user_id=v_actor and m.status='ACTIVE' limit 1;
 if v_actor_role not in ('HEAD_TEACHER','SCHOOL_ADMIN') then raise exception 'Only the Head Teacher or School Administrator may configure school delegation'; end if;
 if p_delegate_from_user_id<>v_actor and v_actor_role<>'SCHOOL_ADMIN' then raise exception 'Head Teachers may delegate only their own authority'; end if;
 select r.code into v_from_role from public.school_memberships m join public.roles r on r.id=m.role_id where m.school_id=p_school_id and m.user_id=p_delegate_from_user_id and m.status='ACTIVE';
 select r.code,u.auth_user_id into v_to_role,v_auth from public.school_memberships m join public.roles r on r.id=m.role_id join public.users u on u.id=m.user_id where m.school_id=p_school_id and m.user_id=p_delegate_to_user_id and m.status='ACTIVE';
 if v_from_role is null or v_to_role is null then raise exception 'Both users require active membership in this school'; end if;
 if v_to_role not in ('DEPUTY_HEAD_TEACHER','DIRECTOR_OF_STUDIES','HEAD_TEACHER') then raise exception 'Selected role cannot receive delegated approval authority'; end if;
 if p_starts_at>=p_ends_at or p_ends_at<=now() then raise exception 'Delegation requires a valid future end date'; end if;
 if cardinality(p_approval_types)=0 or nullif(trim(p_reason),'') is null then raise exception 'Approval types and reason are required'; end if;
 insert into public.approval_delegations(school_id,delegate_from_user_id,delegate_from_role,delegate_to_user_id,delegate_to_role,approval_types,maximum_amount_minor,starts_at,ends_at,reason)
 values(p_school_id,p_delegate_from_user_id,v_from_role,p_delegate_to_user_id,v_to_role,p_approval_types,p_maximum_amount_minor,p_starts_at,p_ends_at,trim(p_reason)) returning * into v_row;
 insert into public.approval_audit_events(school_id,approval_request_id,actor_user_id,actor_role,action,note,metadata)
 values(p_school_id,null,v_actor,v_actor_role,'DELEGATION_CREATED',trim(p_reason),jsonb_build_object('delegation_id',v_row.id,'delegate_to_role',v_to_role,'ends_at',p_ends_at));
 if v_auth is not null then insert into public.system_notifications(category,event_type,title,message,idempotency_key,recipient_user_id,school_id,entity_type,entity_id)
 values('Academic','APPROVAL_DELEGATION_STARTED','Approval delegation assigned',format('%s authority is delegated to you until %s.',array_to_string(p_approval_types,', '),p_ends_at),concat('delegation:',v_row.id),v_auth,p_school_id,'approval_delegation',v_row.id); end if;
 return v_row;
end $$;

create or replace function public.revoke_approval_delegation(p_delegation_id uuid,p_reason text)
returns public.approval_delegations language plpgsql security definer set search_path=public as $$
declare v_actor uuid; v_role text; v_row public.approval_delegations;
begin
 v_actor:=public.current_app_user_id(); select * into v_row from public.approval_delegations where id=p_delegation_id for update;
 select r.code into v_role from public.school_memberships m join public.roles r on r.id=m.role_id where m.school_id=v_row.school_id and m.user_id=v_actor and m.status='ACTIVE';
 if v_role not in ('HEAD_TEACHER','SCHOOL_ADMIN') or nullif(trim(p_reason),'') is null then raise exception 'Authorised role and revocation reason required'; end if;
 update public.approval_delegations set is_active=false,revoked_at=now(),revoked_by=v_actor where id=p_delegation_id returning * into v_row;
 insert into public.approval_audit_events(school_id,approval_request_id,actor_user_id,actor_role,action,note,metadata) values(v_row.school_id,null,v_actor,v_role,'DELEGATION_REVOKED',trim(p_reason),jsonb_build_object('delegation_id',v_row.id)); return v_row;
end $$;

create or replace function public.submit_approval_request(
 p_school_id uuid,p_request_type text,p_title text,p_reason text,p_supporting_evidence jsonb,
 p_related_record_type text,p_related_record_id text,p_related_record_path text,p_priority text default 'NORMAL',p_amount_minor bigint default null)
returns public.approval_requests language plpgsql security definer set search_path=public as $$
declare v_actor uuid; v_policy public.approval_policies; v_assignee uuid; v_assignee_auth uuid; v_row public.approval_requests;
begin
 v_actor:=public.current_app_user_id(); if v_actor is null or not public.is_active_school_member(p_school_id) then raise exception 'Active school membership required'; end if;
 select * into v_policy from public.approval_policies where is_active and request_type=p_request_type and (school_id=p_school_id or school_id is null) order by school_id nulls last limit 1;
 if v_policy.id is null then raise exception 'No active approval policy for request type'; end if;
 select m.user_id,u.auth_user_id into v_assignee,v_assignee_auth from public.school_memberships m join public.roles r on r.id=m.role_id join public.users u on u.id=m.user_id where m.school_id=p_school_id and m.status='ACTIVE' and r.code=v_policy.primary_role and m.user_id<>v_actor limit 1;
 insert into public.approval_requests(school_id,request_type,title,requested_by,primary_approver_role,fallback_approver_role,assigned_approver_id,original_approver_role,status,priority,reason,supporting_evidence,related_record_type,related_record_id,related_record_path,amount_minor,due_at)
 values(p_school_id,p_request_type,trim(p_title),v_actor,v_policy.primary_role,v_policy.fallback_role,v_assignee,v_policy.primary_role,'PENDING_APPROVAL',p_priority,trim(p_reason),coalesce(p_supporting_evidence,'[]'),p_related_record_type,p_related_record_id,p_related_record_path,p_amount_minor,now()+make_interval(hours=>v_policy.deadline_hours)) returning * into v_row;
 insert into public.approval_audit_events(school_id,approval_request_id,actor_user_id,actor_role,action,to_status,note) values(p_school_id,v_row.id,v_actor,'REQUESTER','SUBMITTED','PENDING_APPROVAL',trim(p_reason));
 if v_assignee_auth is not null then insert into public.system_notifications(category,event_type,title,message,idempotency_key,recipient_user_id,school_id,entity_type,entity_id)
 values('Academic','APPROVAL_REQUESTED',trim(p_title),format('A %s request requires your decision.',replace(p_request_type,'_',' ')),concat('approval-request:',v_row.id),v_assignee_auth,p_school_id,'approval_request',v_row.id); end if;
 return v_row;
end $$;

create or replace function public.queue_report_generation_job(p_school_id uuid,p_academic_year_id uuid,p_term_id uuid,p_class_id uuid,p_stream_id uuid,p_programme text,p_output_type text,p_request_key text)
returns public.report_generation_jobs language plpgsql security definer set search_path=public as $$
declare v_actor uuid; v_row public.report_generation_jobs;
begin
 v_actor:=public.current_app_user_id(); if v_actor is null or not public.is_active_school_member(p_school_id) then raise exception 'Active school membership required'; end if;
 insert into public.report_generation_jobs(school_id,academic_year_id,term_id,class_id,stream_id,programme,output_type,request_key,requested_by)
 values(p_school_id,p_academic_year_id,p_term_id,p_class_id,p_stream_id,p_programme,p_output_type,p_request_key,v_actor)
 on conflict(school_id,request_key) do update set request_key=excluded.request_key returning * into v_row; return v_row;
end $$;

revoke all on function public.create_approval_delegation(uuid,uuid,uuid,text[],bigint,timestamptz,timestamptz,text),public.revoke_approval_delegation(uuid,text),public.submit_approval_request(uuid,text,text,text,jsonb,text,text,text,text,bigint),public.queue_report_generation_job(uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.create_approval_delegation(uuid,uuid,uuid,text[],bigint,timestamptz,timestamptz,text),public.revoke_approval_delegation(uuid,text),public.submit_approval_request(uuid,text,text,text,jsonb,text,text,text,text,bigint),public.queue_report_generation_job(uuid,uuid,uuid,uuid,uuid,text,text,text) to authenticated;

;
