-- Tenant-safe reusable approval and delegation engine.

insert into public.roles(code,name,description,is_system_role)
values ('DEPUTY_HEAD_TEACHER','Deputy Head Teacher','Exercises configured, time-bound delegated school authority.',true)
on conflict (code) do update set name=excluded.name,description=excluded.description;

create table if not exists public.approval_policies(
 id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id) on delete cascade,
 request_type text not null, primary_role text not null, fallback_role text,
 high_risk_mode text not null default 'FULL_DELEGATED_APPROVAL' check(high_risk_mode in ('RECOMMENDATION_ONLY','JOINT_APPROVAL_REQUIRED','FALLBACK_APPROVAL','FULL_DELEGATED_APPROVAL')),
 deadline_hours integer not null default 48 check(deadline_hours between 1 and 8760), maximum_amount_minor bigint check(maximum_amount_minor is null or maximum_amount_minor>=0),
 is_active boolean not null default true, configured_by uuid references public.users(id), updated_at timestamptz not null default now(),
 unique nulls not distinct(school_id,request_type)
);

create table if not exists public.approval_delegations(
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 delegate_from_user_id uuid not null references public.users(id), delegate_from_role text not null,
 delegate_to_user_id uuid not null references public.users(id), delegate_to_role text not null,
 approval_types text[] not null check(cardinality(approval_types)>0), maximum_amount_minor bigint check(maximum_amount_minor is null or maximum_amount_minor>=0),
 starts_at timestamptz not null, ends_at timestamptz not null, reason text not null, is_active boolean not null default true,
 revoked_at timestamptz, revoked_by uuid references public.users(id), created_at timestamptz not null default now(),
 check(starts_at<ends_at), check(delegate_from_user_id<>delegate_to_user_id), check(delegate_to_role<>'PLATFORM_ADMIN')
);

create table if not exists public.approval_requests(
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 request_type text not null, title text not null, requested_by uuid not null references public.users(id), materially_edited_by uuid references public.users(id),
 primary_approver_role text not null, fallback_approver_role text, assigned_approver_id uuid references public.users(id),
 original_approver_role text not null, delegated_authority text, delegation_id uuid references public.approval_delegations(id),
 status text not null default 'DRAFT' check(status in ('DRAFT','PENDING_APPROVAL','PENDING_FALLBACK_APPROVAL','APPROVED','REJECTED','RETURNED_FOR_CORRECTION','CANCELLED','EXPIRED','ESCALATED')),
 priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','URGENT')),
 reason text not null, supporting_evidence jsonb not null default '[]'::jsonb check(jsonb_typeof(supporting_evidence)='array'),
 related_record_type text, related_record_id text, related_record_path text, amount_minor bigint check(amount_minor is null or amount_minor>=0),
 created_at timestamptz not null default now(), due_at timestamptz not null, decided_at timestamptz, decided_by uuid references public.users(id), decision text, decision_notes text,
 check(requested_by<>coalesce(assigned_approver_id,'00000000-0000-0000-0000-000000000000'::uuid))
);

create table if not exists public.approval_audit_events(
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 approval_request_id uuid not null references public.approval_requests(id) on delete restrict,
 actor_user_id uuid not null references public.users(id), actor_role text not null, action text not null,
 from_status text, to_status text, note text not null, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create index if not exists approval_requests_queue_idx on public.approval_requests(school_id,status,due_at);
create index if not exists approval_delegations_active_idx on public.approval_delegations(school_id,delegate_to_user_id,starts_at,ends_at) where is_active;

alter table public.approval_policies enable row level security;
alter table public.approval_delegations enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_audit_events enable row level security;

create policy "members read approval policies" on public.approval_policies for select to authenticated using(school_id is null or public.is_active_school_member(school_id));
create policy "members read approval delegations" on public.approval_delegations for select to authenticated using(public.is_active_school_member(school_id));
create policy "members read approval requests" on public.approval_requests for select to authenticated using(public.is_active_school_member(school_id));
create policy "members read approval audit" on public.approval_audit_events for select to authenticated using(public.is_active_school_member(school_id));

revoke all on public.approval_policies,public.approval_delegations,public.approval_requests,public.approval_audit_events from anon;
revoke insert,update,delete,truncate,references,trigger on public.approval_policies,public.approval_delegations,public.approval_requests,public.approval_audit_events from authenticated;

create or replace function public.decide_approval_request(p_request_id uuid,p_decision text,p_note text)
returns public.approval_requests language plpgsql security definer set search_path=public as $$
declare v_actor public.users; v_request public.approval_requests; v_role text; v_next text; v_delegation public.approval_delegations;
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
 if v_next is null or nullif(trim(p_note),'') is null then raise exception 'Valid decision and note required'; end if;
 update public.approval_requests set status=v_next,decided_at=case when v_next='ESCALATED' then null else now() end,decided_by=case when v_next='ESCALATED' then null else v_actor.id end,decision=upper(p_decision),decision_notes=trim(p_note),delegated_authority=case when v_delegation.id is not null then 'Delegated Approval' when v_role='HEAD_TEACHER' and v_role<>v_request.original_approver_role then 'Escalated Approval' else delegated_authority end where id=p_request_id returning * into v_request;
 insert into public.approval_audit_events(school_id,approval_request_id,actor_user_id,actor_role,action,from_status,to_status,note,metadata) values(v_request.school_id,v_request.id,v_actor.id,v_role,upper(p_decision),null,v_next,trim(p_note),jsonb_build_object('original_approver_role',v_request.original_approver_role,'authority',v_request.delegated_authority));
 return v_request;
end $$;
revoke all on function public.decide_approval_request(uuid,text,text) from public,anon;
grant execute on function public.decide_approval_request(uuid,text,text) to authenticated;

insert into public.approval_policies(school_id,request_type,primary_role,fallback_role,high_risk_mode,deadline_hours)
values
(null,'TEACHER_MARKS_SUBMISSION','DIRECTOR_OF_STUDIES','HEAD_TEACHER','FULL_DELEGATED_APPROVAL',48),
(null,'MARKS_MODERATION','DIRECTOR_OF_STUDIES','HEAD_TEACHER','FULL_DELEGATED_APPROVAL',48),
(null,'FINAL_RESULTS_APPROVAL','HEAD_TEACHER','DEPUTY_HEAD_TEACHER','JOINT_APPROVAL_REQUIRED',48),
(null,'REPORT_CARD_PUBLICATION','HEAD_TEACHER','DEPUTY_HEAD_TEACHER','FALLBACK_APPROVAL',48),
(null,'ASSESSMENT_CREATION','DIRECTOR_OF_STUDIES','DEPUTY_HEAD_TEACHER','FULL_DELEGATED_APPROVAL',48),
(null,'TEACHER_ALLOCATION_OVERRIDE','DIRECTOR_OF_STUDIES','HEAD_TEACHER','FALLBACK_APPROVAL',48),
(null,'SUBJECT_ACTIVATION_EXCEPTION','DIRECTOR_OF_STUDIES','HEAD_TEACHER','FALLBACK_APPROVAL',48),
(null,'LEARNER_ADMISSION_EXCEPTION','DEPUTY_HEAD_TEACHER','HEAD_TEACHER','FULL_DELEGATED_APPROVAL',48),
(null,'SCHOOL_USER_ROLE_CHANGE','HEAD_TEACHER','PLATFORM_ADMIN','JOINT_APPROVAL_REQUIRED',48),
(null,'ROUTINE_FEE_WAIVER','BURSAR','HEAD_TEACHER','FALLBACK_APPROVAL',48),
(null,'HIGH_VALUE_FINANCE','HEAD_TEACHER','PLATFORM_ADMIN','JOINT_APPROVAL_REQUIRED',24),
(null,'PAYMENT_REVERSAL','BURSAR','HEAD_TEACHER','RECOMMENDATION_ONLY',24),
(null,'SCHOOL_SETUP_APPROVAL','HEAD_TEACHER','PLATFORM_ADMIN','JOINT_APPROVAL_REQUIRED',72),
(null,'PLATFORM_SETTINGS','PLATFORM_ADMIN','PLATFORM_SUPER_ADMIN','JOINT_APPROVAL_REQUIRED',24)
on conflict (school_id,request_type) do nothing;
