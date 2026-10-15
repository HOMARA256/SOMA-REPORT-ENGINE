-- Product decision: the protected registration catalogue ends at subcounty.
-- Remove only unreferenced lower-level rows loaded by the CSV import.
delete from public.uganda_locations
where level = 'VILLAGE'
  and source_reference = 'uganda-locations-full.csv; verified source dataset'
  and not exists (
    select 1 from public.school_addresses a
    where a.village_zone_location_id = uganda_locations.id
  );

delete from public.uganda_locations
where level = 'PARISH'
  and source_reference = 'uganda-locations-full.csv; verified source dataset'
  and not exists (
    select 1 from public.school_addresses a
    where a.parish_ward_location_id = uganda_locations.id
  )
  and not exists (
    select 1 from public.uganda_locations child
    where child.parent_id = uganda_locations.id
  );

create or replace function public.import_uganda_location_paths(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  country_id uuid;
  parent_location_id uuid;
  location_id uuid;
  location_name text;
  normalized text;
  location_code text;
  imported integer := 0;
  level_name public.uganda_location_level;
  path_key text;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Location import payload must be a JSON array';
  end if;

  select id into country_id from public.uganda_locations
  where level = 'COUNTRY' and code = 'UG' and is_active limit 1;
  if country_id is null then raise exception 'Uganda country root is missing'; end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    parent_location_id := country_id;
    path_key := 'uganda';
    for level_name, location_name in
      select x.level_name, nullif(trim(x.location_name), '')
      from (values
        ('REGION'::public.uganda_location_level,
          case when nullif(trim(item->>'region'),'') is null then null
               else regexp_replace(trim(item->>'region'), '\\s+region$', '', 'i') || ' Region' end),
        ('SUB_REGION'::public.uganda_location_level, item->>'sub_region'),
        ('DISTRICT'::public.uganda_location_level, item->>'district'),
        ('COUNTY'::public.uganda_location_level, item->>'county'),
        ('SUB_COUNTY'::public.uganda_location_level, item->>'subcounty')
      ) as x(level_name, location_name)
    loop
      if location_name is null then continue; end if;
      normalized := lower(regexp_replace(location_name, '\\s+', ' ', 'g'));
      path_key := path_key || '|' || level_name::text || '|' || normalized;
      location_code := case
        when level_name = 'REGION' then 'UG-R-' || upper(substr(md5(path_key), 1, 10))
        else 'UG-' || substr(level_name::text, 1, 2) || '-' || upper(substr(md5(path_key), 1, 16))
      end;

      insert into public.uganda_locations (
        parent_id, level, name, normalized_name, code, is_active,
        display_order, country_code, status, catalogue_version,
        source_reference, is_verified, branch_complete
      ) values (
        parent_location_id, level_name, location_name, normalized, location_code, true,
        0, 'UG', 'ACTIVE', 'UGANDA-LOCATIONS-FULL-2026-09-25',
        'uganda-locations-full.csv; verified source dataset', true, true
      )
      on conflict on constraint uganda_locations_parent_id_level_name_key
      do update set normalized_name = excluded.normalized_name, is_active = true,
        status = 'ACTIVE', catalogue_version = excluded.catalogue_version,
        source_reference = excluded.source_reference, is_verified = true,
        branch_complete = true, updated_at = now()
      returning id into location_id;
      parent_location_id := location_id;
    end loop;
    imported := imported + 1;
  end loop;
  return imported;
end;
$$;

revoke all on function public.import_uganda_location_paths(jsonb) from public, anon, authenticated;
grant execute on function public.import_uganda_location_paths(jsonb) to service_role;

;
