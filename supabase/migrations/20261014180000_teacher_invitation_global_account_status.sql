-- Match a not-yet-accepted invitation to the existing Auth-backed user so
-- School Admins can see platform-wide restrictions before acceptance.
begin;

create or replace function public.list_school_teacher_invitations(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_school_admin_for(p_school_id) then
    raise exception 'SCHOOL_ADMIN_REQUIRED';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',i.id,
      'email',i.invited_email,
      'name',i.invited_name,
      'department',i.department,
      'status',case when i.status in ('PENDING','SENT') and i.expires_at<=now() then 'EXPIRED' else i.status end,
      'activated',coalesce(m.status='ACTIVE',false),
      'membershipStatus',coalesce(m.status,'NONE'),
      'accountStatus',coalesce(u.account_status,'UNLINKED'),
      'accountActive',coalesce((u.is_active and u.account_status='ACTIVE') or u.account_status='DISABLED',false),
      'globalSecurityRestricted',coalesce(
        u.account_status in ('LOCKED','SUSPENDED')
        or (not coalesce(u.is_active,false) and u.account_status<>'DISABLED'),
        false
      ),
      'expiresAt',i.expires_at,
      'createdAt',i.created_at,
      'sentAt',i.sent_at,
      'acceptedAt',i.accepted_at,
      'declinedAt',i.declined_at,
      'declineReason',i.decline_reason,
      'resendCount',i.resend_count,
      'assignmentCount',(select count(*) from public.school_teacher_invitation_allocations a where a.invitation_id=i.id)
    ) order by i.created_at desc)
    from public.school_teacher_invitations i
    left join lateral (
      select profile.account_status,profile.is_active
      from public.users profile
      where (i.accepted_user_id is not null and profile.id=i.accepted_user_id)
         or (i.accepted_user_id is null and i.target_auth_user_id is not null and profile.auth_user_id=i.target_auth_user_id)
         or (i.accepted_user_id is null
             and (i.target_auth_user_id is null or profile.auth_user_id=i.target_auth_user_id)
             and lower(trim(profile.email))=lower(trim(i.invited_email)))
      order by case
        when profile.id=i.accepted_user_id then 0
        when profile.auth_user_id=i.target_auth_user_id then 1
        else 2
      end
      limit 1
    ) u on true
    left join public.school_memberships m on m.user_id=i.accepted_user_id and m.school_id=i.school_id
    where i.school_id=p_school_id
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.list_school_teacher_invitations(uuid) from public,anon;
grant execute on function public.list_school_teacher_invitations(uuid) to authenticated;
notify pgrst,'reload schema';

commit;
