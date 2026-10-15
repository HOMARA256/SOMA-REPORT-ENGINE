-- Secure school tenant registration and invitation lifecycle.
-- Raw activation tokens and temporary passwords are never persisted here.

alter table public.schools
  add column if not exists lifecycle_status varchar(40) not null default 'DRAFT',
  add column if not exists district varchar(120),
  add column if not exists internal_platform_notes text,
  add column if not exists setup_submitted_at timestamptz,
  add column if not exists setup_approved_at timestamptz,
  add column if not exists setup_approved_by uuid references public.platform_admins(id) on delete restrict;

alter table public.schools drop constraint if exists schools_lifecycle_status_check;
alter table public.schools add constraint schools_lifecycle_status_check check (lifecycle_status in
  ('DRAFT','INVITATION_SENT','INVITATION_EXPIRED','INVITATION_REVOKED','SCHOOL_ADMIN_ACTIVATED',
   'SETUP_IN_PROGRESS','PENDING_PLATFORM_APPROVAL','ACTIVE','SUSPENDED','ARCHIVED'));

alter table public.school_admin_invitations
  add column if not exists username varchar(180),
  add column if not exists temporary_credential_expires_at timestamptz,
  add column if not exists used_at timestamptz,
  add column if not exists requires_password_change boolean not null default true,
  add column if not exists requires_mfa boolean not null default false,
  add column if not exists replaced_by uuid references public.school_admin_invitations(id) on delete restrict;

create unique index if not exists school_admin_invitation_username_key
  on public.school_admin_invitations(lower(username)) where username is not null;

create table if not exists public.school_setup_checklist_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  item_code varchar(60) not null,
  label varchar(220) not null,
  display_order smallint not null check(display_order > 0),
  is_required boolean not null default true,
  is_complete boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.users(id) on delete restrict,
  override_reason text,
  overridden_at timestamptz,
  overridden_by uuid references public.platform_admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id,item_code),
  check((override_reason is null and overridden_at is null and overridden_by is null) or
        (nullif(trim(override_reason),'') is not null and overridden_at is not null and overridden_by is not null))
);

create table if not exists public.school_invitation_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.school_admin_invitations(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  event_type varchar(50) not null check(event_type in
    ('CREATED','SEND_ATTEMPTED','SENT','DELIVERED','FAILED','RESENT','REVOKED','EXPIRED','ACTIVATED','REPLACED')),
  actor_platform_admin_id uuid references public.platform_admins(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb,
  check(not (safe_metadata ?| array['password','temporary_password','token','raw_token','activation_token']))
);

create table if not exists public.platform_action_rate_limits (
  id uuid primary key default gen_random_uuid(),
  actor_key varchar(220) not null,
  action_key varchar(80) not null,
  window_started_at timestamptz not null,
  attempt_count integer not null default 1 check(attempt_count > 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  unique(actor_key,action_key,window_started_at)
);

create index if not exists school_setup_checklist_school_idx on public.school_setup_checklist_items(school_id,display_order);
create index if not exists school_invitation_events_school_idx on public.school_invitation_events(school_id,occurred_at desc);

alter table public.school_setup_checklist_items enable row level security;
alter table public.school_invitation_events enable row level security;
alter table public.platform_action_rate_limits enable row level security;

drop policy if exists "school members read setup checklist" on public.school_setup_checklist_items;
create policy "school members read setup checklist" on public.school_setup_checklist_items for select to authenticated
using(public.is_platform_administrator() or public.is_active_school_member(school_id));

drop policy if exists "platform administrators read invitation events" on public.school_invitation_events;
create policy "platform administrators read invitation events" on public.school_invitation_events for select to authenticated
using(public.is_platform_administrator());

revoke all privileges on public.school_setup_checklist_items,public.school_invitation_events,public.platform_action_rate_limits from anon;
revoke insert,update,delete,truncate,references,trigger on public.school_setup_checklist_items,public.school_invitation_events,public.platform_action_rate_limits from authenticated;

create or replace function public.seed_school_setup_checklist(target_school_id uuid)
returns void language sql security definer set search_path=public,pg_temp as $$
  insert into public.school_setup_checklist_items(school_id,item_code,label,display_order) values
    (target_school_id,'SCHOOL_PROFILE','Complete school profile',1),
    (target_school_id,'ACADEMIC_LEVELS','Confirm academic levels offered',2),
    (target_school_id,'UCE_REQUIRED_SUBJECTS','Review compulsory UCE subjects',3),
    (target_school_id,'UCE_OPTIONAL_SUBJECTS','Select optional UCE subjects',4),
    (target_school_id,'UACE_SUBJECTS','Select UACE subjects, where applicable',5),
    (target_school_id,'CLASSES_STREAMS','Add classes and streams',6),
    (target_school_id,'STAFF','Add staff',7),
    (target_school_id,'LEARNERS','Add learners',8),
    (target_school_id,'SCHOOL_FINANCE','Configure school fees and payment channels',9),
    (target_school_id,'SUBMIT_APPROVAL','Submit setup for platform approval',10)
  on conflict(school_id,item_code) do nothing;
$$;
revoke all on function public.seed_school_setup_checklist(uuid) from public,anon,authenticated;

comment on column public.school_admin_invitations.token_hash is
  'SHA-256 or stronger one-way activation-token hash. Raw tokens and temporary passwords must never be persisted or logged.';
comment on table public.platform_action_rate_limits is
  'Server-managed throttling for invitation resend, activation and authentication-adjacent actions.';

