-- Persistent application identity mapped one-to-one to Supabase Auth.
-- Password hashes remain exclusively in auth.users and are never duplicated here.

alter table public.users
  add column if not exists username varchar(255),
  add column if not exists normalized_username varchar(255),
  add column if not exists normalized_email varchar(255),
  add column if not exists account_status varchar(20) not null default 'ACTIVE'
    check(account_status in ('INVITED','ACTIVE','LOCKED','SUSPENDED','DISABLED')),
  add column if not exists must_change_password boolean not null default false,
  add column if not exists last_login_at timestamptz;

update public.users app_user set
  username=coalesce(nullif(trim(auth_user.raw_user_meta_data->>'username'),''),lower(trim(app_user.email))),
  normalized_email=lower(trim(app_user.email)),
  normalized_username=lower(trim(coalesce(nullif(auth_user.raw_user_meta_data->>'username',''),app_user.email))),
  must_change_password=coalesce((auth_user.raw_user_meta_data->>'must_change_password')::boolean,false),
  account_status=case when app_user.is_active then 'ACTIVE' else 'DISABLED' end
from auth.users auth_user where auth_user.id=app_user.auth_user_id;

alter table public.users
  alter column username set not null,
  alter column normalized_username set not null,
  alter column normalized_email set not null;

create unique index if not exists users_normalized_username_unique on public.users(normalized_username);
create unique index if not exists users_normalized_email_unique on public.users(normalized_email);

alter table public.platform_admins add column if not exists last_login_at timestamptz;

create or replace function public.normalize_persistent_user_identity()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  new.email:=lower(trim(new.email));
  new.username:=trim(new.username);
  new.normalized_email:=lower(new.email);
  new.normalized_username:=lower(new.username);
  new.updated_at:=now();
  return new;
end $$;

drop trigger if exists users_normalize_persistent_identity on public.users;
create trigger users_normalize_persistent_identity before insert or update of email,username on public.users
for each row execute function public.normalize_persistent_user_identity();

comment on column public.users.username is 'Persistent sign-in identifier; passwords remain exclusively in Supabase Auth.';
comment on column public.users.normalized_username is 'Lowercase trimmed username used for uniqueness and comparison.';
comment on column public.users.normalized_email is 'Lowercase trimmed email used for uniqueness and comparison.';

