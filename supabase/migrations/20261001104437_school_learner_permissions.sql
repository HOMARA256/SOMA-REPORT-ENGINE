insert into public.permissions (code, description) values
  ('learners.view', 'View learner records in the current school'),
  ('learners.manage', 'Create, update and archive learner records in the current school')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role cross join public.permissions permission
where role.code in ('SCHOOL_ADMIN', 'DIRECTOR_OF_STUDIES', 'HEAD_TEACHER')
  and permission.code in ('learners.view', 'learners.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role cross join public.permissions permission
where role.code in ('TEACHER', 'CLASS_TEACHER', 'HEAD_OF_DEPARTMENT')
  and permission.code = 'learners.view'
on conflict do nothing;;
