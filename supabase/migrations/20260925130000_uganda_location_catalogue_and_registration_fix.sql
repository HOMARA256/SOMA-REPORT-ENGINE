-- Repair connected school provisioning and establish the verified Uganda catalogue baseline.

create or replace function public.ensure_user_username()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  candidate text;
  suffix integer := 1;
begin
  if nullif(trim(new.username), '') is not null then
    new.username := lower(trim(new.username));
    return new;
  end if;

  candidate := lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-z0-9._-]+', '-', 'g'));
  candidate := coalesce(nullif(trim(both '-' from candidate), ''), 'user');
  new.username := candidate;
  while exists (select 1 from public.users u where lower(u.username) = lower(new.username) and u.id <> new.id) loop
    suffix := suffix + 1;
    new.username := candidate || suffix::text;
  end loop;
  return new;
end;
$$;

drop trigger if exists users_ensure_username on public.users;
create trigger users_ensure_username
before insert or update of username, email on public.users
for each row execute function public.ensure_user_username();

alter table public.uganda_locations
  add column if not exists normalized_name text,
  add column if not exists country_code text not null default 'UG',
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists effective_from date,
  add column if not exists effective_to date,
  add column if not exists catalogue_version text not null default 'UBOS-2024',
  add column if not exists source_reference text,
  add column if not exists is_verified boolean not null default false,
  add column if not exists branch_complete boolean not null default false;

update public.uganda_locations
set normalized_name = lower(regexp_replace(trim(name), '\\s+', ' ', 'g')),
    source_reference = coalesce(source_reference, 'UBOS Uganda Profile; seeded catalogue baseline'),
    is_verified = true
where normalized_name is null;

alter table public.uganda_locations alter column normalized_name set not null;
create index if not exists uganda_locations_parent_name_idx
  on public.uganda_locations(parent_id, normalized_name) where is_active;

do $$
declare
  uganda_id uuid;
  central_id uuid;
  eastern_id uuid;
  northern_id uuid;
  western_id uuid;
begin
  select id into uganda_id from public.uganda_locations where level='COUNTRY' and code='UG' limit 1;

  insert into public.uganda_locations(parent_id,name,normalized_name,code,level,display_order,source_reference,is_verified,branch_complete)
  values
    (uganda_id,'Central Region','central region','UG-C','REGION',10,'UBOS Uganda Profile, accessed 2026-09-25',true,false),
    (uganda_id,'Eastern Region','eastern region','UG-E','REGION',20,'UBOS Uganda Profile, accessed 2026-09-25',true,false),
    (uganda_id,'Northern Region','northern region','UG-N','REGION',30,'UBOS Uganda Profile, accessed 2026-09-25',true,false),
    (uganda_id,'Western Region','western region','UG-W','REGION',40,'UBOS Uganda Profile, accessed 2026-09-25',true,false)
  on conflict on constraint uganda_locations_parent_id_level_name_key do update set normalized_name=excluded.normalized_name,
    source_reference=excluded.source_reference, is_verified=true;

  select id into central_id from public.uganda_locations where parent_id=uganda_id and level='REGION' and name='Central Region';
  select id into eastern_id from public.uganda_locations where parent_id=uganda_id and level='REGION' and name='Eastern Region';
  select id into northern_id from public.uganda_locations where parent_id=uganda_id and level='REGION' and name='Northern Region';
  select id into western_id from public.uganda_locations where parent_id=uganda_id and level='REGION' and name='Western Region';

  insert into public.uganda_locations(parent_id,name,normalized_name,code,level,display_order,source_reference,is_verified,branch_complete)
  values
    (central_id,'Masaka City','masaka city','UG-C-MSK','CITY',20,'UBOS Uganda Profile, accessed 2026-09-25',true,false),
    (eastern_id,'Jinja City','jinja city','UG-E-JIN','CITY',10,'UBOS Uganda Profile, accessed 2026-09-25',true,false),
    (eastern_id,'Mbale City','mbale city','UG-E-MBL','CITY',20,'UBOS Uganda Profile, accessed 2026-09-25',true,false),
    (eastern_id,'Soroti City','soroti city','UG-E-SOR','CITY',30,'UBOS Uganda Profile, accessed 2026-09-25',true,false),
    (northern_id,'Arua City','arua city','UG-N-ARU','CITY',10,'UBOS Uganda Profile, accessed 2026-09-25',true,false),
    (northern_id,'Gulu City','gulu city','UG-N-GUL','CITY',20,'UBOS Uganda Profile, accessed 2026-09-25',true,false),
    (northern_id,'Lira City','lira city','UG-N-LIR','CITY',30,'UBOS Uganda Profile, accessed 2026-09-25',true,false),
    (western_id,'Fort Portal City','fort portal city','UG-W-FPC','CITY',10,'UBOS Uganda Profile, accessed 2026-09-25',true,false),
    (western_id,'Hoima City','hoima city','UG-W-HOI','CITY',20,'UBOS Uganda Profile, accessed 2026-09-25',true,false),
    (western_id,'Mbarara City','mbarara city','UG-W-MBR','CITY',30,'UBOS Uganda Profile, accessed 2026-09-25',true,false)
  on conflict on constraint uganda_locations_parent_id_level_name_key do update set normalized_name=excluded.normalized_name,
    source_reference=excluded.source_reference, is_verified=true;
end $$;

create or replace function public.search_uganda_location_children(
  p_parent_id uuid,
  p_query text default '',
  p_limit integer default 50
) returns table(id uuid,name text,code text,level public.uganda_location_level,parent_id uuid,branch_complete boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  select l.id,l.name,l.code,l.level,l.parent_id,l.branch_complete
  from public.uganda_locations l
  where l.parent_id is not distinct from p_parent_id
    and l.is_active and l.status='ACTIVE'
    and (nullif(trim(p_query),'') is null or l.normalized_name like '%'||lower(trim(p_query))||'%')
  order by l.display_order,l.name
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;
revoke all on function public.search_uganda_location_children(uuid,text,integer) from public,anon;
grant execute on function public.search_uganda_location_children(uuid,text,integer) to authenticated,service_role;

create or replace view public.uganda_location_catalogue_coverage as
with recursive descendants as (
  select r.id as region_id,r.name as region,l.id,l.parent_id,l.level,l.branch_complete
  from public.uganda_locations r
  left join public.uganda_locations l on l.parent_id=r.id and l.is_active
  where r.level='REGION' and r.is_active
  union all
  select d.region_id,d.region,l.id,l.parent_id,l.level,l.branch_complete
  from descendants d join public.uganda_locations l on l.parent_id=d.id and l.is_active
)
select region_id,region,
  count(id) filter(where level='DISTRICT') as districts,
  count(id) filter(where level='CITY') as cities,
  count(id) filter(where level='COUNTY') as counties,
  count(id) filter(where level='CITY_DIVISION') as city_divisions,
  count(id) filter(where level in ('SUB_COUNTY','TOWN_COUNCIL','MUNICIPALITY','DIVISION')) as lower_local_governments,
  count(id) filter(where level in ('PARISH','WARD')) as parishes_wards,
  count(id) filter(where level in ('VILLAGE','ZONE')) as villages_zones,
  count(id) filter(where not branch_complete) as incomplete_branches
from descendants group by region_id,region;

grant select on public.uganda_location_catalogue_coverage to authenticated,service_role;
alter view public.uganda_location_catalogue_coverage set (security_invoker=true);
revoke all on public.uganda_location_catalogue_coverage from anon;

comment on view public.uganda_location_catalogue_coverage is
  'Verified catalogue coverage; incomplete_branches must reach zero only after authoritative lower-level imports.';
