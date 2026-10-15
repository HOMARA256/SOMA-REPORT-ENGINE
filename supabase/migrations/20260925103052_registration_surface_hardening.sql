-- Tighten the connected registration surface after production adviser review.
revoke all on public.uganda_locations,public.school_academic_profiles,public.school_registration_drafts,public.school_billing_schedules from anon;
revoke select on public.school_academic_profiles,public.school_billing_schedules,public.school_registration_drafts from anon;

drop policy if exists "platform admins manage Uganda locations" on public.uganda_locations;
create policy "platform admins insert Uganda locations" on public.uganda_locations
  for insert to authenticated with check(public.is_platform_administrator());
create policy "platform admins update Uganda locations" on public.uganda_locations
  for update to authenticated using(public.is_platform_administrator()) with check(public.is_platform_administrator());
create policy "platform admins delete Uganda locations" on public.uganda_locations
  for delete to authenticated using(public.is_platform_administrator());

revoke all on function public.list_uganda_location_children(uuid) from public,anon;
revoke all on function public.save_school_registration_draft(uuid,integer,jsonb) from public,anon;
grant execute on function public.list_uganda_location_children(uuid) to authenticated;
grant execute on function public.save_school_registration_draft(uuid,integer,jsonb) to authenticated;

;
