alter table public.users add column if not exists telephone varchar(50);

create table if not exists public.school_admin_policy_acceptances(
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict, terms_version varchar(40) not null,
  privacy_version varchar(40) not null, accepted_at timestamptz not null default now(),
  unique(school_id,user_id,terms_version,privacy_version)
);
alter table public.school_admin_policy_acceptances enable row level security;
create policy "members read own policy acceptance" on public.school_admin_policy_acceptances for select to authenticated
using(public.is_active_school_member(school_id));
revoke all privileges on public.school_admin_policy_acceptances from anon;
revoke insert,update,delete,truncate,references,trigger on public.school_admin_policy_acceptances from authenticated;

create or replace function public.activate_school_admin_invitation(
  p_invitation_id uuid,p_auth_user_id uuid,p_confirmed_phone text,p_terms_version text,p_privacy_version text
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_inv public.school_admin_invitations%rowtype; v_user_id uuid;
begin
  select * into v_inv from public.school_admin_invitations where id=p_invitation_id for update;
  if v_inv.id is null or v_inv.invited_user_id<>p_auth_user_id then raise exception 'INVITATION_IDENTITY_MISMATCH'; end if;
  if v_inv.status not in ('PENDING','SENT','DELIVERED') or v_inv.revoked_at is not null or v_inv.used_at is not null then raise exception 'INVITATION_NOT_ACTIVE'; end if;
  if v_inv.expires_at<=now() then update public.school_admin_invitations set status='EXPIRED',updated_at=now() where id=v_inv.id; update public.schools set lifecycle_status='INVITATION_EXPIRED' where id=v_inv.school_id; raise exception 'INVITATION_EXPIRED'; end if;
  if nullif(trim(p_terms_version),'') is null or nullif(trim(p_privacy_version),'') is null then raise exception 'POLICY_ACCEPTANCE_REQUIRED'; end if;
  select id into v_user_id from public.users where auth_user_id=p_auth_user_id;
  update public.users set telephone=trim(p_confirmed_phone),is_active=true,updated_at=now() where id=v_user_id;
  update public.school_memberships set status='ACTIVE',updated_at=now() where school_id=v_inv.school_id and user_id=v_user_id;
  update public.school_admin_invitations set status='ACCEPTED',accepted_at=now(),used_at=now(),requires_password_change=false,updated_at=now() where id=v_inv.id;
  insert into public.school_admin_policy_acceptances(school_id,user_id,terms_version,privacy_version) values(v_inv.school_id,v_user_id,p_terms_version,p_privacy_version) on conflict do nothing;
  update public.schools set lifecycle_status='SETUP_IN_PROGRESS',is_active=true,updated_at=now() where id=v_inv.school_id;
  update public.school_onboarding_states set status='SETUP_IN_PROGRESS',updated_at=now() where school_id=v_inv.school_id;
  insert into public.school_invitation_events(invitation_id,school_id,event_type,safe_metadata) values(v_inv.id,v_inv.school_id,'ACTIVATED','{}'::jsonb);
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  select v_user_id,u.full_name,'SCHOOL_ADMIN','SCHOOL_ADMIN_ACTIVATED','school',v_inv.school_id::text,jsonb_build_object('invitation_id',v_inv.id) from public.users u where u.id=v_user_id;
  return v_inv.school_id;
end $$;
revoke all on function public.activate_school_admin_invitation(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.activate_school_admin_invitation(uuid,uuid,text,text,text) to service_role;

;
