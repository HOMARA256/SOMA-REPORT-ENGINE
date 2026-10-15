-- Keep catalogue coverage tenant-safe and remove the redundant direct Kampala branch.

delete from public.uganda_locations
where code='UG-C-KLA'
  and level='CITY'
  and not exists (
    select 1 from public.school_addresses a
    where a.district_city_location_id=uganda_locations.id
  );

alter view public.uganda_location_catalogue_coverage set (security_invoker=true);
revoke all on public.uganda_location_catalogue_coverage from anon;
grant select on public.uganda_location_catalogue_coverage to authenticated,service_role;

;
