begin;

alter table public.platform_worker_heartbeats drop constraint if exists platform_worker_heartbeats_capability_check;
alter table public.platform_worker_heartbeats add constraint platform_worker_heartbeats_capability_check
 check (capability in ('HEARTBEAT_ONLY','PROCESSING','HEARTBEAT_AND_SCHOOL_MESSAGE_NOTICES'));

-- Extend the existing Message Centre records. Platform support retains its
-- existing functions and permissions; staff messages are a distinct type.
alter table public.school_platform_conversations
  add column conversation_type text not null default 'PLATFORM_SUPPORT',
  add column teacher_auth_user_id uuid references auth.users(id),
  add column client_request_key uuid;
alter table public.school_platform_conversations
  add constraint message_centre_conversation_type_check check (conversation_type in ('PLATFORM_SUPPORT','SCHOOL_TEACHER')),
  add constraint school_teacher_conversation_scope_check check (conversation_type <> 'SCHOOL_TEACHER' or (school_id is not null and teacher_auth_user_id is not null));
alter table public.school_platform_conversations drop constraint school_platform_conversations_category_check;
alter table public.school_platform_conversations add constraint school_platform_conversations_category_check check (category in
 ('GENERAL_SUPPORT','SCHOOL_REGISTRATION','SCHOOL_PROFILE_AND_SETUP','SUBSCRIPTION_AND_BILLING','PAYMENT_INITIATION','PAYMENT_FAILURE','PAYMENT_REFUND','SUBJECT_ACTIVATION','ACADEMIC_SETUP','CLASS_AND_LEARNER_SETUP','STAFF_AND_ROLE_SETUP','IMPORT_OR_EXPORT','ASSESSMENT_AND_MARKS','APPROVAL_OR_REPORT','TECHNICAL_ISSUE','FEATURE_REQUEST','PLATFORM_ANNOUNCEMENT','TEACHER_ACCOUNT_ACCESS','TEACHING_ALLOCATION','TIMETABLE','ASSESSMENT','LEARNER_SUPPORT','GENERAL_ADMINISTRATION'));
create unique index school_teacher_conversation_request_key on public.school_platform_conversations(opened_by_auth_user_id,client_request_key) where client_request_key is not null;
create index school_teacher_conversation_scope on public.school_platform_conversations(school_id,teacher_auth_user_id,updated_at desc) where conversation_type='SCHOOL_TEACHER';
-- PostgreSQL chooses a shortened name for the original inline CHECK, keeping
-- the column suffix rather than simply truncating the whole inferred name.
-- Resolve that existing CHECK from the catalog instead of guessing its name.
do $migration$
declare v_constraint name; v_count integer;
begin
 select count(*),min(c.conname::text)::name into v_count,v_constraint
 from pg_constraint c
 where c.conrelid='public.school_platform_conversation_participants'::regclass
   and c.contype='c'
   and pg_get_constraintdef(c.oid) like '%participant_role%'
   and pg_get_constraintdef(c.oid) like '%PLATFORM%'
   and pg_get_constraintdef(c.oid) like '%SCHOOL%';
 if v_count<>1 then raise exception 'Expected one existing participant-role CHECK; found %',v_count; end if;
 execute format('alter table public.school_platform_conversation_participants drop constraint %I',v_constraint);
end;
$migration$;
alter table public.school_platform_conversation_participants add constraint message_centre_participant_role_check check (participant_role in ('PLATFORM','SCHOOL','TEACHER'));
alter table public.school_platform_conversation_messages add column client_message_key uuid;
create unique index school_teacher_message_idempotency on public.school_platform_conversation_messages(conversation_id,sender_auth_user_id,client_message_key) where client_message_key is not null;

create or replace function public.is_active_school_message_role(p_school_id uuid,p_auth_user_id uuid,p_role text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id
   where m.school_id=p_school_id and m.status='ACTIVE' and u.auth_user_id=p_auth_user_id and u.is_active and r.code=p_role);
$$;
create or replace function public.can_access_school_teacher_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.school_platform_conversations c
   where c.id=p_conversation_id and c.conversation_type='SCHOOL_TEACHER' and c.school_id is not null
     and (public.is_active_school_message_role(c.school_id,auth.uid(),'SCHOOL_ADMIN')
       or (c.teacher_auth_user_id=auth.uid() and public.is_active_school_message_role(c.school_id,auth.uid(),'TEACHER'))));
$$;
-- Support RPCs continue to use this helper. It must never authorize a staff
-- thread, even for a platform administrator.
create or replace function public.can_access_school_platform_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.school_platform_conversations c where c.id=p_conversation_id
   and c.conversation_type='PLATFORM_SUPPORT'
   and (public.is_active_platform_admin() or (c.school_id is not null and public.is_school_message_member(c.school_id))));
$$;
drop policy school_platform_conversations_read on public.school_platform_conversations;
create policy school_platform_conversations_read on public.school_platform_conversations for select to authenticated
 using(public.can_access_school_platform_conversation(id) or public.can_access_school_teacher_conversation(id));
drop policy school_platform_participants_read on public.school_platform_conversation_participants;
create policy school_platform_participants_read on public.school_platform_conversation_participants for select to authenticated
 using(public.can_access_school_platform_conversation(conversation_id) or public.can_access_school_teacher_conversation(conversation_id));
drop policy school_platform_messages_read on public.school_platform_conversation_messages;
create policy school_platform_messages_read on public.school_platform_conversation_messages for select to authenticated
 using((public.can_access_school_platform_conversation(conversation_id) and (not is_internal_platform_note or public.is_active_platform_admin()))
    or (not is_internal_platform_note and public.can_access_school_teacher_conversation(conversation_id)));

-- Keep support lists support-only; direct thread and write RPCs are already
-- guarded by can_access_school_platform_conversation above.
create or replace function public.get_school_platform_message_centre(p_school_id uuid default null)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'schoolId',c.school_id,'schoolName',s.official_name,'subject',c.subject,'category',c.category,'status',c.status,'priority',c.priority,'assignedPlatformAuthUserId',c.assigned_platform_auth_user_id,'latestPreview',coalesce((select left(m.body,240) from public.school_platform_conversation_messages m where m.conversation_id=c.id and m.deleted_at is null and (not m.is_internal_platform_note or public.is_active_platform_admin()) order by m.sent_at desc limit 1),''),'createdAt',c.created_at,'updatedAt',c.updated_at,'relatedEntityType',c.related_entity_type,'relatedEntityId',c.related_entity_id,'actionUrl',c.action_url,'unread',exists(select 1 from public.school_platform_conversation_messages m where m.conversation_id=c.id and m.sender_auth_user_id<>auth.uid() and m.sent_at>coalesce((select p.last_read_at from public.school_platform_conversation_participants p where p.conversation_id=c.id and p.auth_user_id=auth.uid()),'-infinity'::timestamptz))) order by c.updated_at desc),'[]'::jsonb)
 from public.school_platform_conversations c left join public.schools s on s.id=c.school_id
 where c.conversation_type='PLATFORM_SUPPORT' and ((public.is_active_platform_admin() and (p_school_id is null or c.school_id=p_school_id)) or (not public.is_active_platform_admin() and c.school_id=p_school_id and public.is_school_message_member(p_school_id)));
$$;

-- Durable notification outbox: a notification error cannot roll back a message.
create table public.school_teacher_message_notification_outbox (
 id uuid primary key default gen_random_uuid(), message_id uuid not null references public.school_platform_conversation_messages(id) on delete cascade,
 recipient_auth_user_id uuid not null references auth.users(id), school_id uuid not null references public.schools(id),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(), delivered_at timestamptz, last_error text,
 created_at timestamptz not null default now(), unique(message_id,recipient_auth_user_id)
);
alter table public.school_teacher_message_notification_outbox enable row level security;
create index school_teacher_notification_retry on public.school_teacher_message_notification_outbox(next_attempt_at) where delivered_at is null;

create or replace function public.queue_school_teacher_message_notices(p_message_id uuid,p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_school uuid; v_teacher uuid; v_sender uuid;
begin
 select c.school_id,c.teacher_auth_user_id,m.sender_auth_user_id into v_school,v_teacher,v_sender
 from public.school_platform_conversation_messages m join public.school_platform_conversations c on c.id=m.conversation_id
 where m.id=p_message_id and c.id=p_conversation_id and c.conversation_type='SCHOOL_TEACHER';
 if v_school is null then raise exception 'CONVERSATION_NOT_AVAILABLE'; end if;
 if v_sender=v_teacher then
  insert into public.school_teacher_message_notification_outbox(message_id,recipient_auth_user_id,school_id)
  select p_message_id,u.auth_user_id,v_school from public.school_memberships sm
  join public.users u on u.id=sm.user_id join public.roles r on r.id=sm.role_id
  where sm.school_id=v_school and sm.status='ACTIVE' and u.is_active and u.auth_user_id is not null
    and r.code='SCHOOL_ADMIN' and u.auth_user_id<>v_sender
  on conflict do nothing;
 end if;
 if v_teacher<>v_sender and public.is_active_school_message_role(v_school,v_teacher,'TEACHER') then
   insert into public.school_teacher_message_notification_outbox(message_id,recipient_auth_user_id,school_id)
   values(p_message_id,v_teacher,v_school) on conflict do nothing;
 end if;
 update public.school_platform_conversation_participants p set archived_at=null
 where p.conversation_id=p_conversation_id and p.auth_user_id<>v_sender
   and exists(select 1 from public.school_teacher_message_notification_outbox o where o.message_id=p_message_id and o.recipient_auth_user_id=p.auth_user_id);
end;
$$;

create or replace function public.list_school_teacher_message_recipients(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_is_admin boolean; v_result jsonb;
begin
 v_is_admin:=public.is_active_school_message_role(p_school_id,auth.uid(),'SCHOOL_ADMIN');
 if not v_is_admin and not public.is_active_school_message_role(p_school_id,auth.uid(),'TEACHER') then raise exception 'SCHOOL_MESSAGE_ACCESS_REQUIRED'; end if;
 if v_is_admin then
  select coalesce(jsonb_agg(jsonb_build_object('authUserId',u.auth_user_id,'name',u.full_name) order by u.full_name),'[]'::jsonb) into v_result
  from (select distinct u.auth_user_id,u.full_name from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id
    where m.school_id=p_school_id and m.status='ACTIVE' and u.is_active and u.auth_user_id is not null and r.code='TEACHER') u;
 else
  select coalesce(jsonb_agg(jsonb_build_object('authUserId',u.auth_user_id,'name',u.full_name) order by u.full_name),'[]'::jsonb) into v_result
  from (select distinct u.auth_user_id,u.full_name from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id
    where m.school_id=p_school_id and m.status='ACTIVE' and u.is_active and u.auth_user_id is not null and r.code='SCHOOL_ADMIN') u;
 end if;
 return v_result;
end;
$$;

create or replace function public.get_school_teacher_message_centre(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
 if not (public.is_active_school_message_role(p_school_id,auth.uid(),'SCHOOL_ADMIN') or public.is_active_school_message_role(p_school_id,auth.uid(),'TEACHER')) then raise exception 'SCHOOL_MESSAGE_ACCESS_REQUIRED'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'schoolId',c.school_id,'schoolName',s.official_name,
  'teacherAuthUserId',c.teacher_auth_user_id,'participantName',u.full_name,'subject',c.subject,'category',c.category,
  'updatedAt',c.updated_at,'latestPreview',(select left(m.body,240) from public.school_platform_conversation_messages m where m.conversation_id=c.id and m.deleted_at is null order by m.sent_at desc,m.id desc limit 1),
  'unread',exists(select 1 from public.school_platform_conversation_messages m where m.conversation_id=c.id and m.sender_auth_user_id<>auth.uid() and m.sent_at>coalesce(p.last_read_at,'-infinity'::timestamptz))) order by c.updated_at desc),'[]'::jsonb) into v_result
 from public.school_platform_conversations c join public.schools s on s.id=c.school_id
 join public.users u on u.auth_user_id=c.teacher_auth_user_id
 left join public.school_platform_conversation_participants p on p.conversation_id=c.id and p.auth_user_id=auth.uid()
 where c.school_id=p_school_id and c.conversation_type='SCHOOL_TEACHER' and public.can_access_school_teacher_conversation(c.id) and p.archived_at is null;
 return v_result;
end;
$$;

create or replace function public.get_school_teacher_conversation(p_school_id uuid,p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_is_admin boolean;
begin
 if not exists(select 1 from public.school_platform_conversations where id=p_conversation_id and school_id=p_school_id and conversation_type='SCHOOL_TEACHER')
   or not public.can_access_school_teacher_conversation(p_conversation_id) then raise exception 'CONVERSATION_NOT_AVAILABLE'; end if;
 v_is_admin:=public.is_active_school_message_role(p_school_id,auth.uid(),'SCHOOL_ADMIN');
 insert into public.school_platform_conversation_participants(conversation_id,auth_user_id,participant_role,last_read_at,archived_at)
 values(p_conversation_id,auth.uid(),case when v_is_admin then 'SCHOOL' else 'TEACHER' end,now(),null)
 on conflict(conversation_id,auth_user_id) do update set last_read_at=excluded.last_read_at,archived_at=null;
 update public.system_notifications set read_at=coalesce(read_at,now()) where recipient_user_id=auth.uid() and conversation_id=p_conversation_id and read_at is null;
 select jsonb_build_object('conversation',jsonb_build_object('id',c.id,'schoolId',c.school_id,'subject',c.subject,'category',c.category,'participantName',u.full_name),
  'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'senderAuthUserId',m.sender_auth_user_id,'senderName',coalesce(sender.full_name,'School Administrator'),'body',m.body,'sentAt',m.sent_at) order by m.sent_at,m.id)
    from public.school_platform_conversation_messages m left join public.users sender on sender.auth_user_id=m.sender_auth_user_id
    where m.conversation_id=c.id and m.deleted_at is null),'[]'::jsonb)) into v_result
 from public.school_platform_conversations c join public.users u on u.auth_user_id=c.teacher_auth_user_id where c.id=p_conversation_id;
 return v_result;
end;
$$;

create or replace function public.create_school_teacher_conversation(p_school_id uuid,p_teacher_auth_user_id uuid,p_category text,p_subject text,p_body text,p_request_key uuid,p_message_key uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_message uuid; v_teacher uuid; v_admin boolean;
begin
 v_admin:=public.is_active_school_message_role(p_school_id,auth.uid(),'SCHOOL_ADMIN');
 if not v_admin and not public.is_active_school_message_role(p_school_id,auth.uid(),'TEACHER') then raise exception 'SCHOOL_MESSAGE_ACCESS_REQUIRED'; end if;
 v_teacher:=case when v_admin then p_teacher_auth_user_id else auth.uid() end;
 if not public.is_active_school_message_role(p_school_id,v_teacher,'TEACHER') then raise exception 'ACTIVE_TEACHER_REQUIRED'; end if;
 if p_category not in ('TEACHING_ALLOCATION','TIMETABLE','ASSESSMENT','LEARNER_SUPPORT','GENERAL_ADMINISTRATION') then raise exception 'MESSAGE_CATEGORY_INVALID'; end if;
 if p_request_key is null or p_message_key is null or length(trim(coalesce(p_subject,''))) not between 3 and 180 or length(trim(coalesce(p_body,''))) not between 1 and 5000 then raise exception 'MESSAGE_FIELDS_INVALID'; end if;
 if not v_admin and not exists(select 1 from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id where m.school_id=p_school_id and m.status='ACTIVE' and u.is_active and r.code='SCHOOL_ADMIN') then raise exception 'SCHOOL_ADMIN_UNAVAILABLE'; end if;
 insert into public.school_platform_conversations(school_id,conversation_type,teacher_auth_user_id,client_request_key,category,subject,opened_by_auth_user_id)
 values(p_school_id,'SCHOOL_TEACHER',v_teacher,p_request_key,p_category,trim(p_subject),auth.uid())
 on conflict(opened_by_auth_user_id,client_request_key) where client_request_key is not null do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from public.school_platform_conversations where opened_by_auth_user_id=auth.uid() and client_request_key=p_request_key and school_id=p_school_id and conversation_type='SCHOOL_TEACHER';
  if v_id is null then raise exception 'MESSAGE_REQUEST_KEY_CONFLICT'; end if;
  return v_id;
 end if;
 insert into public.school_platform_conversation_participants(conversation_id,auth_user_id,participant_role,last_read_at) values(v_id,auth.uid(),case when v_admin then 'SCHOOL' else 'TEACHER' end,now());
 insert into public.school_platform_conversation_messages(conversation_id,sender_auth_user_id,body,client_message_key) values(v_id,auth.uid(),trim(p_body),p_message_key) returning id into v_message;
 perform public.queue_school_teacher_message_notices(v_message,v_id);
 return v_id;
end;
$$;

create or replace function public.post_school_teacher_message(p_school_id uuid,p_conversation_id uuid,p_body text,p_message_key uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_admin boolean; v_teacher uuid;
begin
 select teacher_auth_user_id into v_teacher from public.school_platform_conversations where id=p_conversation_id and school_id=p_school_id and conversation_type='SCHOOL_TEACHER';
 if v_teacher is null or not public.can_access_school_teacher_conversation(p_conversation_id) then raise exception 'CONVERSATION_NOT_AVAILABLE'; end if;
 if not public.is_active_school_message_role(p_school_id,v_teacher,'TEACHER') then raise exception 'TEACHER_MEMBERSHIP_INACTIVE'; end if;
 if p_message_key is null or length(trim(coalesce(p_body,''))) not between 1 and 5000 then raise exception 'MESSAGE_FIELDS_INVALID'; end if;
 select id into v_id from public.school_platform_conversation_messages where conversation_id=p_conversation_id and sender_auth_user_id=auth.uid() and client_message_key=p_message_key;
 if v_id is not null then return v_id; end if;
 v_admin:=public.is_active_school_message_role(p_school_id,auth.uid(),'SCHOOL_ADMIN');
 if not v_admin and not exists(select 1 from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id where m.school_id=p_school_id and m.status='ACTIVE' and u.is_active and r.code='SCHOOL_ADMIN') then raise exception 'SCHOOL_ADMIN_UNAVAILABLE'; end if;
 insert into public.school_platform_conversation_participants(conversation_id,auth_user_id,participant_role,last_read_at,archived_at)
 values(p_conversation_id,auth.uid(),case when v_admin then 'SCHOOL' else 'TEACHER' end,now(),null)
 on conflict(conversation_id,auth_user_id) do update set last_read_at=excluded.last_read_at,archived_at=null;
 insert into public.school_platform_conversation_messages(conversation_id,sender_auth_user_id,body,client_message_key)
 values(p_conversation_id,auth.uid(),trim(p_body),p_message_key)
 on conflict(conversation_id,sender_auth_user_id,client_message_key) where client_message_key is not null do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.school_platform_conversation_messages where conversation_id=p_conversation_id and sender_auth_user_id=auth.uid() and client_message_key=p_message_key; return v_id; end if;
 update public.school_platform_conversations set updated_at=now() where id=p_conversation_id;
 perform public.queue_school_teacher_message_notices(v_id,p_conversation_id);
 return v_id;
end;
$$;

create or replace function public.archive_school_teacher_conversation(p_school_id uuid,p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.school_platform_conversations where id=p_conversation_id and school_id=p_school_id and conversation_type='SCHOOL_TEACHER')
   or not public.can_access_school_teacher_conversation(p_conversation_id) then raise exception 'CONVERSATION_NOT_AVAILABLE'; end if;
 insert into public.school_platform_conversation_participants(conversation_id,auth_user_id,participant_role,archived_at)
 values(p_conversation_id,auth.uid(),case when public.is_active_school_message_role(p_school_id,auth.uid(),'SCHOOL_ADMIN') then 'SCHOOL' else 'TEACHER' end,now())
 on conflict(conversation_id,auth_user_id) do update set archived_at=now();
end;
$$;

create or replace function public.get_school_teacher_unread_count(p_school_id uuid)
returns integer language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
 if not (public.is_active_school_message_role(p_school_id,auth.uid(),'SCHOOL_ADMIN') or public.is_active_school_message_role(p_school_id,auth.uid(),'TEACHER')) then return 0; end if;
 select count(*)::integer into v_count from public.school_platform_conversations c
 left join public.school_platform_conversation_participants p on p.conversation_id=c.id and p.auth_user_id=auth.uid()
 where c.school_id=p_school_id and c.conversation_type='SCHOOL_TEACHER' and public.can_access_school_teacher_conversation(c.id) and p.archived_at is null
 and exists(select 1 from public.school_platform_conversation_messages m where m.conversation_id=c.id and m.sender_auth_user_id<>auth.uid() and m.sent_at>coalesce(p.last_read_at,'-infinity'::timestamptz));
 return v_count;
end;
$$;

-- A service-role worker retries each recipient independently. A failed notice
-- stays in the outbox and never changes the committed message.
create or replace function public.deliver_school_teacher_message_notices(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item record; v_done integer:=0; v_failed integer:=0; v_conversation record;
begin
 if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 for v_item in select * from public.school_teacher_message_notification_outbox where delivered_at is null and next_attempt_at<=now() order by created_at for update skip locked limit least(greatest(p_limit,1),200) loop
  begin
   select c.id,c.school_id,c.teacher_auth_user_id,c.subject,m.body,m.sender_auth_user_id,m.sent_at into v_conversation
   from public.school_platform_conversation_messages m join public.school_platform_conversations c on c.id=m.conversation_id where m.id=v_item.message_id and c.conversation_type='SCHOOL_TEACHER';
   if v_conversation.id is null then raise exception 'MESSAGE_NOT_AVAILABLE'; end if;
   if not (public.is_active_school_message_role(v_item.school_id,v_item.recipient_auth_user_id,'SCHOOL_ADMIN')
    or (v_item.recipient_auth_user_id=v_conversation.teacher_auth_user_id and public.is_active_school_message_role(v_item.school_id,v_item.recipient_auth_user_id,'TEACHER'))) then
    update public.school_teacher_message_notification_outbox set delivered_at=now(),last_error='Recipient membership no longer active' where id=v_item.id;
   else
    insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,conversation_id,conversation_message_id,action_url,idempotency_key,read_at)
    values(v_item.school_id,v_item.recipient_auth_user_id,'Messages','SCHOOL_TEACHER_MESSAGE',v_conversation.subject,left(v_conversation.body,240),'school_teacher_conversation',v_conversation.id,v_conversation.id,v_item.message_id,
      '/messages?view=school&school='||v_item.school_id::text||'&conversation='||v_conversation.id::text,'school-teacher-message:'||v_item.message_id::text||':'||v_item.recipient_auth_user_id::text,
      (select p.last_read_at from public.school_platform_conversation_participants p where p.conversation_id=v_conversation.id and p.auth_user_id=v_item.recipient_auth_user_id and p.last_read_at>=v_conversation.sent_at))
    on conflict(idempotency_key) do nothing;
    update public.school_teacher_message_notification_outbox set delivered_at=now(),last_error=null where id=v_item.id;
    v_done:=v_done+1;
   end if;
  exception when others then
   update public.school_teacher_message_notification_outbox set attempts=attempts+1,last_error=left(sqlerrm,500),next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,6))::integer)) where id=v_item.id;
   v_failed:=v_failed+1;
  end;
 end loop;
 return jsonb_build_object('delivered',v_done,'failed',v_failed);
end;
$$;

-- Avoid showing stale teacher-message notifications after membership removal.
create or replace function public.get_notification_centre(p_limit integer default 100)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'category',n.category,'eventType',n.event_type,'title',n.title,'message',n.message,'readAt',n.read_at,'createdAt',n.created_at,'conversationId',n.conversation_id,'conversationMessageId',n.conversation_message_id,'relatedEntityType',n.related_entity_type,'relatedEntityId',n.related_entity_id,'actionUrl',n.action_url) order by n.created_at desc),'[]'::jsonb)
 from (select n.* from public.system_notifications n where n.recipient_user_id=auth.uid()
   and (n.event_type<>'SCHOOL_TEACHER_MESSAGE' or public.can_access_school_teacher_conversation(n.conversation_id))
   order by n.created_at desc limit greatest(1,least(coalesce(p_limit,100),200))) n;
$$;
create or replace function public.get_unread_message_count()
returns integer language sql stable security definer set search_path=public,pg_temp as $$
 select count(*)::integer from public.system_notifications n where n.recipient_user_id=auth.uid() and n.conversation_id is not null and n.read_at is null
 and (n.event_type in ('CONVERSATION_OPENED','CONVERSATION_REPLY') or (n.event_type='SCHOOL_TEACHER_MESSAGE' and public.can_access_school_teacher_conversation(n.conversation_id)));
$$;

drop policy if exists notifications_recipient_read on public.system_notifications;
create policy notifications_recipient_read on public.system_notifications for select to authenticated
 using (case when event_type='SCHOOL_TEACHER_MESSAGE' then
   recipient_user_id=auth.uid() and public.can_access_school_teacher_conversation(conversation_id)
 else recipient_user_id=auth.uid() or (school_id is not null and public.is_school_admin_for(school_id)) or public.is_active_platform_admin() end);

revoke all on function public.is_active_school_message_role(uuid,uuid,text),public.can_access_school_teacher_conversation(uuid),public.queue_school_teacher_message_notices(uuid,uuid),public.list_school_teacher_message_recipients(uuid),public.get_school_teacher_message_centre(uuid),public.get_school_teacher_conversation(uuid,uuid),public.create_school_teacher_conversation(uuid,uuid,text,text,text,uuid,uuid),public.post_school_teacher_message(uuid,uuid,text,uuid),public.archive_school_teacher_conversation(uuid,uuid),public.get_school_teacher_unread_count(uuid),public.deliver_school_teacher_message_notices(integer) from public,anon;
grant execute on function public.can_access_school_teacher_conversation(uuid),public.list_school_teacher_message_recipients(uuid),public.get_school_teacher_message_centre(uuid),public.get_school_teacher_conversation(uuid,uuid),public.create_school_teacher_conversation(uuid,uuid,text,text,text,uuid,uuid),public.post_school_teacher_message(uuid,uuid,text,uuid),public.archive_school_teacher_conversation(uuid,uuid),public.get_school_teacher_unread_count(uuid) to authenticated;
grant execute on function public.deliver_school_teacher_message_notices(integer) to service_role;

commit;
