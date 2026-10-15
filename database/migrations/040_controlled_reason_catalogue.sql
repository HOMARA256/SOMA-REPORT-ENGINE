-- Controlled reason catalogue for sensitive workflow actions.
create table if not exists public.action_reason_catalogue(
 id uuid primary key default gen_random_uuid(), reason_code text not null unique,
 reason_label text not null, reason_description text not null, action_type text not null,
 applicable_roles text[] not null default '{}', applicable_record_types text[] not null default '{}',
 requires_additional_note boolean not null default false, is_system_suggested boolean not null default false,
 is_active boolean not null default true, display_order integer not null default 100,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.action_reason_catalogue enable row level security;
drop policy if exists reason_catalogue_authenticated_read on public.action_reason_catalogue;
create policy reason_catalogue_authenticated_read on public.action_reason_catalogue for select to authenticated using(is_active);
revoke all on public.action_reason_catalogue from anon;
grant select on public.action_reason_catalogue to authenticated;

alter table public.approval_requests add column if not exists decision_reason_code text references public.action_reason_catalogue(reason_code);
alter table public.approval_requests add column if not exists decision_reason_label text;
alter table public.approval_requests add column if not exists detected_conditions jsonb not null default '[]'::jsonb;

insert into public.action_reason_catalogue(reason_code,reason_label,reason_description,action_type,applicable_roles,applicable_record_types,requires_additional_note,is_system_suggested,display_order) values
('EVIDENCE_VERIFIED','Evidence verified','Required marks, moderation and supporting evidence were verified.','APPROVE',array['DIRECTOR_OF_STUDIES','HEAD_TEACHER','DEPUTY_HEAD_TEACHER'],array['academic_batch','result','report_card'],false,true,10),
('MODERATION_COMPLETE','Moderation complete','Moderation checks are complete with no unresolved exceptions.','APPROVE',array['DIRECTOR_OF_STUDIES','HEAD_TEACHER'],array['marks','result'],false,true,20),
('CORRECTION_REQUIRED','Correction required','The record contains an identified correctable issue.','RETURN',array['DIRECTOR_OF_STUDIES','HEAD_TEACHER','DEPUTY_HEAD_TEACHER'],array['marks','result','report_card'],true,true,30),
('MISSING_EVIDENCE','Required evidence missing','Required evidence is incomplete or unavailable.','REJECT',array['DIRECTOR_OF_STUDIES','HEAD_TEACHER','DEPUTY_HEAD_TEACHER'],array['marks','result','report_card'],true,true,40),
('PRIMARY_UNAVAILABLE','Primary approver unavailable','The primary approver is unavailable and configured escalation is required.','ESCALATE',array['DIRECTOR_OF_STUDIES','HEAD_TEACHER','DEPUTY_HEAD_TEACHER'],array['approval_request'],true,true,50),
('DELEGATED_AUTHORITY','Authorized delegated decision','Decision is made under an active, scoped and time-bound delegation.','APPROVE',array['DEPUTY_HEAD_TEACHER','DIRECTOR_OF_STUDIES'],array['approval_request'],true,true,60),
('OTHER','Other - Specify Reason','A reason outside the controlled catalogue applies.','ANY',array[]::text[],array[]::text[],true,false,999)
on conflict(reason_code) do update set reason_label=excluded.reason_label,reason_description=excluded.reason_description,action_type=excluded.action_type,applicable_roles=excluded.applicable_roles,applicable_record_types=excluded.applicable_record_types,requires_additional_note=excluded.requires_additional_note,is_system_suggested=excluded.is_system_suggested,is_active=true,display_order=excluded.display_order,updated_at=now();

create or replace function public.decide_approval_request_v2(p_request_id uuid,p_decision text,p_reason_code text,p_note text,p_detected_conditions jsonb default '[]')
returns public.approval_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor public.users; v_request public.approval_requests; v_role text; v_next text; v_delegation public.approval_delegations; v_reason public.action_reason_catalogue;
begin
 select * into v_actor from public.users where auth_user_id=auth.uid() and is_active=true;
 if v_actor.id is null then raise exception 'Authenticated active user required'; end if;
 select * into v_request from public.approval_requests where id=p_request_id for update;
 if v_request.id is null or not public.is_active_school_member(v_request.school_id) then raise exception 'Approval request unavailable'; end if;
 if v_request.status not in ('PENDING_APPROVAL','PENDING_FALLBACK_APPROVAL','ESCALATED') then raise exception 'Request is not awaiting a decision'; end if;
 if v_actor.id in (v_request.requested_by,v_request.materially_edited_by) then raise exception 'Separation of duties prevents self-approval'; end if;
 select r.code into v_role from public.school_memberships m join public.roles r on r.id=m.role_id where m.school_id=v_request.school_id and m.user_id=v_actor.id and m.status='ACTIVE' limit 1;
 select * into v_delegation from public.approval_delegations d where d.id=v_request.delegation_id and d.delegate_to_user_id=v_actor.id and d.is_active and now() between d.starts_at and d.ends_at and v_request.request_type=any(d.approval_types);
 if v_request.assigned_approver_id is distinct from v_actor.id and v_role not in (v_request.primary_approver_role,coalesce(v_request.fallback_approver_role,''),'HEAD_TEACHER') and v_delegation.id is null then raise exception 'User is not an authorised approver'; end if;
 if v_request.amount_minor is not null and v_delegation.id is not null and (v_delegation.maximum_amount_minor is null or v_request.amount_minor>v_delegation.maximum_amount_minor) then raise exception 'Delegated financial limit exceeded'; end if;
 v_next:=case upper(p_decision) when 'APPROVE' then 'APPROVED' when 'REJECT' then 'REJECTED' when 'RETURN' then 'RETURNED_FOR_CORRECTION' when 'ESCALATE' then 'ESCALATED' else null end;
 select * into v_reason from public.action_reason_catalogue where reason_code=p_reason_code and is_active and (action_type='ANY' or action_type=upper(p_decision)) and (cardinality(applicable_roles)=0 or v_role=any(applicable_roles));
 if v_next is null or v_reason.id is null then raise exception 'A valid controlled reason is required'; end if;
 if (v_reason.requires_additional_note or upper(p_decision) in ('REJECT','RETURN','ESCALATE')) and nullif(trim(p_note),'') is null then raise exception 'A detailed note is required for this reason'; end if;
 update public.approval_requests set status=v_next,decided_at=case when v_next='ESCALATED' then null else now() end,decided_by=case when v_next='ESCALATED' then null else v_actor.id end,decision=upper(p_decision),decision_notes=nullif(trim(p_note),''),decision_reason_code=v_reason.reason_code,decision_reason_label=v_reason.reason_label,detected_conditions=coalesce(p_detected_conditions,'[]'),delegated_authority=case when v_delegation.id is not null then 'Delegated Approval' when v_role='HEAD_TEACHER' and v_role<>v_request.original_approver_role then 'Escalated Approval' else delegated_authority end where id=p_request_id returning * into v_request;
 insert into public.approval_audit_events(school_id,approval_request_id,actor_user_id,actor_role,action,from_status,to_status,note,metadata) values(v_request.school_id,v_request.id,v_actor.id,v_role,upper(p_decision),null,v_next,coalesce(nullif(trim(p_note),''),v_reason.reason_label),jsonb_build_object('reason_code',v_reason.reason_code,'reason_label',v_reason.reason_label,'detected_conditions',coalesce(p_detected_conditions,'[]'),'original_approver_role',v_request.original_approver_role,'delegated_approver_role',v_role,'authority',v_request.delegated_authority));
 return v_request;
end $$;
revoke all on function public.decide_approval_request_v2(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.decide_approval_request_v2(uuid,text,text,text,jsonb) to authenticated;
