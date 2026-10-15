-- Read the national catalogue and school offerings through one tenant-checked boundary.
create or replace function public.get_school_subject_settings(p_school_id uuid,p_academic_year_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'schoolName',(select s.official_name from public.schools s where s.id=p_school_id),
  'catalogue',coalesce((select jsonb_agg(to_jsonb(ss)||jsonb_build_object('system_subject_papers',coalesce((select jsonb_agg(to_jsonb(sp) order by sp.paper_code,sp.paper_name) from public.system_subject_papers sp where sp.system_subject_id=ss.id and sp.is_active),'[]'::jsonb)) order by ss.subject_name) from public.system_subjects ss where ss.is_active),'[]'::jsonb),
  'offerings',coalesce((select jsonb_agg(to_jsonb(so) order by so.created_at) from public.school_subject_offerings so where so.school_id=p_school_id and so.academic_year_id=p_academic_year_id),'[]'::jsonb)
 )
 where (public.is_active_school_member(p_school_id) or public.is_active_platform_admin())
   and exists(select 1 from public.academic_years ay where ay.id=p_academic_year_id and ay.school_id=p_school_id)
$$;
revoke all on function public.get_school_subject_settings(uuid,uuid) from public,anon;
grant execute on function public.get_school_subject_settings(uuid,uuid) to authenticated;
