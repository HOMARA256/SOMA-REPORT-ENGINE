create or replace function public.save_school_form_draft(p_school_id uuid, p_form_key text, p_payload jsonb)
returns timestamptz language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_updated timestamptz;
begin
  if auth.uid() is null then raise exception 'SIGN_IN_REQUIRED'; end if;
  if p_school_id is null or nullif(trim(p_form_key),'') is null then raise exception 'DRAFT_CONTEXT_REQUIRED'; end if;
  if length(p_form_key)>100 or p_form_key !~ '^[a-z0-9_.:-]{3,100}$' then raise exception 'INVALID_DRAFT_KEY'; end if;
  if not exists(select 1 from public.users u join public.school_memberships sm on sm.user_id=u.id and sm.school_id=p_school_id and sm.status='ACTIVE' join public.role_permissions rp on rp.role_id=sm.role_id join public.permissions p on p.id=rp.permission_id where u.auth_user_id=auth.uid() and u.is_active and p.code in ('academics.manage','alevel.combinations.manage')) then raise exception 'NOT_AUTHORISED'; end if;
  insert into public.school_form_drafts(school_id,auth_user_id,form_key,payload) values(p_school_id,auth.uid(),p_form_key,coalesce(p_payload,'{}'::jsonb))
  on conflict(school_id,auth_user_id,form_key) do update set payload=excluded.payload,updated_at=now() returning updated_at into v_updated;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  select auth.uid(),u.full_name,r.code,'FORM_DRAFT_SAVED','school_form_draft',p_form_key,jsonb_build_object('school_id',p_school_id,'form_key',p_form_key,'updated_at',v_updated)
  from public.users u join public.school_memberships sm on sm.user_id=u.id and sm.school_id=p_school_id and sm.status='ACTIVE' join public.roles r on r.id=sm.role_id where u.auth_user_id=auth.uid() limit 1;
  return v_updated;
end $$;;
