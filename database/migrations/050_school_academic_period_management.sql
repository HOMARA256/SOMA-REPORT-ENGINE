-- Secure School Admin/DOS academic year and term creation.
create or replace function public.save_school_academic_period(
  p_school_id uuid,p_kind text,p_parent_year uuid,p_name text,p_number integer,p_starts_on date,p_ends_on date
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_actor uuid; v_year public.academic_years%rowtype;
begin
  v_actor:=public.current_app_user_id();
  if v_actor is null or not public.is_active_school_member(p_school_id) then raise exception 'Active school membership required'; end if;
  if not exists(
    select 1 from public.school_memberships m
    join public.roles r on r.id=m.role_id
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions p on p.id=rp.permission_id
    where m.school_id=p_school_id and m.user_id=v_actor and m.status='ACTIVE' and p.code='academics.manage'
  ) then raise exception 'Academic management permission required'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'Name is required'; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on then raise exception 'Enter a valid date range'; end if;
  if p_kind='YEAR' then
    if exists(select 1 from public.academic_years where school_id=p_school_id and status='ACTIVE') then raise exception 'Close the current active academic year before activating another'; end if;
    insert into public.academic_years(school_id,name,starts_on,ends_on,status) values(p_school_id,btrim(p_name),p_starts_on,p_ends_on,'ACTIVE') returning id into v_id;
  elsif p_kind='TERM' then
    select * into v_year from public.academic_years where id=p_parent_year and school_id=p_school_id;
    if not found then raise exception 'The selected academic year does not belong to this school'; end if;
    if p_number not between 1 and 3 then raise exception 'Term number must be between 1 and 3'; end if;
    if p_starts_on<v_year.starts_on or p_ends_on>v_year.ends_on then raise exception 'Term dates must fall within the academic year'; end if;
    insert into public.terms(school_id,academic_year_id,term_number,name,starts_on,ends_on,lifecycle_status) values(p_school_id,p_parent_year,p_number,btrim(p_name),p_starts_on,p_ends_on,'DRAFT') returning id into v_id;
  else raise exception 'Unsupported academic period type'; end if;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
  values(v_actor::text,'SCHOOL_USER','ACADEMIC_PERIOD_CREATED',lower(p_kind),v_id::text,jsonb_build_object('school_id',p_school_id,'name',btrim(p_name),'starts_on',p_starts_on,'ends_on',p_ends_on));
  return v_id;
end $$;
revoke all on function public.save_school_academic_period(uuid,text,uuid,text,integer,date,date) from public,anon;
grant execute on function public.save_school_academic_period(uuid,text,uuid,text,integer,date,date) to authenticated;
