-- Capability vocabulary for the report workflow. This does not activate
-- publication: secured results, narratives and immutable snapshots still need
-- server-side tables/functions before real reports may be issued.
insert into public.permissions (code, description)
values
  ('results.lock', 'Lock moderated result scopes before approval.'),
  ('reports.narrate', 'Record authorized learner report narratives and feedback.')
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code in ('results.lock', 'reports.narrate')
where role.code in ('PLATFORM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTOR_OF_STUDIES')
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'reports.narrate'
where role.code = 'CLASS_TEACHER'
on conflict do nothing;
