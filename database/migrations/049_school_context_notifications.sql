-- Safe, idempotent data-quality escalation from an authenticated school context.
create or replace function public.notify_school_context_issue(p_school_id uuid,p_issue_code text,p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_title text; v_message text; v_actor uuid;
begin
  v_actor:=public.current_app_user_id();
  if v_actor is null or not public.is_active_school_member(p_school_id) then raise exception 'Active school membership required'; end if;
  if p_issue_code not in ('PROFILE_REQUIRED','ACADEMIC_YEAR_UNAVAILABLE','TERM_UNAVAILABLE') then raise exception 'Unsupported school context issue'; end if;
  v_title:=case p_issue_code when 'PROFILE_REQUIRED' then 'School profile requires repair' else 'School academic context requires review' end;
  v_message:=case p_issue_code when 'PROFILE_REQUIRED' then 'A required School Profile is missing, incomplete, or contains a placeholder name.' when 'ACADEMIC_YEAR_UNAVAILABLE' then 'A saved academic-year selection does not belong to the active school.' else 'A saved term selection does not belong to the active school and academic year.' end;
  insert into public.school_provisioning_alerts(school_id,severity,status,title,action_code,safe_details)
  values(p_school_id,case when p_issue_code='PROFILE_REQUIRED' then 'URGENT' else 'WARNING' end,'OPEN',v_title,'REPAIR_SCHOOL_CONFIGURATION',jsonb_build_object('issue_code',p_issue_code)||coalesce(p_details,'{}'::jsonb))
  on conflict(school_id,action_code) where status='OPEN' do update set title=excluded.title,safe_details=public.school_provisioning_alerts.safe_details||excluded.safe_details;
  insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
  select p_school_id,pa.auth_user_id,'System','SCHOOL_CONTEXT_DATA_QUALITY',v_title,v_message,'school',p_school_id,concat('school-context:',p_school_id,':',p_issue_code)
  from public.platform_admins pa where pa.is_active
  on conflict(idempotency_key) do nothing;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
  values(v_actor::text,'SCHOOL_USER','SCHOOL_CONTEXT_ISSUE_REPORTED','school',p_school_id::text,jsonb_build_object('issue_code',p_issue_code,'details',coalesce(p_details,'{}'::jsonb)));
end $$;
revoke all on function public.notify_school_context_issue(uuid,text,jsonb) from public,anon;
grant execute on function public.notify_school_context_issue(uuid,text,jsonb) to authenticated;
