begin;

-- The notification centre stays the single delivery and unread source.  These
-- links let notifications open a conversation or its related school record.
alter table public.system_notifications add column if not exists conversation_id uuid;
alter table public.system_notifications add column if not exists conversation_message_id uuid;
alter table public.system_notifications add column if not exists related_entity_type varchar(80);
alter table public.system_notifications add column if not exists related_entity_id uuid;
alter table public.system_notifications add column if not exists action_url text;

create table if not exists public.school_platform_conversations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete restrict,
  category varchar(40) not null check (category in ('GENERAL_SUPPORT','SCHOOL_REGISTRATION','SCHOOL_PROFILE_AND_SETUP','SUBSCRIPTION_AND_BILLING','PAYMENT_INITIATION','PAYMENT_FAILURE','PAYMENT_REFUND','SUBJECT_ACTIVATION','ACADEMIC_SETUP','CLASS_AND_LEARNER_SETUP','STAFF_AND_ROLE_SETUP','IMPORT_OR_EXPORT','ASSESSMENT_AND_MARKS','APPROVAL_OR_REPORT','TECHNICAL_ISSUE','FEATURE_REQUEST','PLATFORM_ANNOUNCEMENT')),
  subject varchar(180) not null check (length(trim(subject)) between 3 and 180),
  status varchar(24) not null default 'OPEN' check (status in ('OPEN','AWAITING_PLATFORM','AWAITING_SCHOOL','RESOLVED','CLOSED','REOPENED')),
  priority varchar(12) not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  related_entity_type varchar(80), related_entity_id uuid, action_url text,
  opened_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_platform_auth_user_id uuid references auth.users(id) on delete set null,
  resolution_summary text,
  resolved_by_auth_user_id uuid references auth.users(id) on delete set null, resolved_at timestamptz,
  closed_by_auth_user_id uuid references auth.users(id) on delete set null, closed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists school_platform_conversations_school_activity_idx on public.school_platform_conversations(school_id,updated_at desc);
create index if not exists school_platform_conversations_platform_work_idx on public.school_platform_conversations(status,priority,updated_at desc);
drop trigger if exists school_platform_conversations_updated_at on public.school_platform_conversations;
create trigger school_platform_conversations_updated_at before update on public.school_platform_conversations for each row execute function public.set_updated_at();

create table if not exists public.school_platform_conversation_participants (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.school_platform_conversations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  participant_role varchar(32) not null check (participant_role in ('PLATFORM','SCHOOL')),
  last_read_at timestamptz, joined_at timestamptz not null default now(), archived_at timestamptz,
  unique(conversation_id,auth_user_id)
);
create index if not exists school_platform_conversation_participants_auth_idx on public.school_platform_conversation_participants(auth_user_id,conversation_id);

create table if not exists public.school_platform_conversation_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.school_platform_conversations(id) on delete cascade,
  sender_auth_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 5000),
  sent_at timestamptz not null default now(), edited_at timestamptz, deleted_at timestamptz,
  is_internal_platform_note boolean not null default false
);
create index if not exists school_platform_conversation_messages_thread_idx on public.school_platform_conversation_messages(conversation_id,sent_at);

create table if not exists public.school_platform_conversation_attachments (
  id uuid primary key default gen_random_uuid(), conversation_message_id uuid not null references public.school_platform_conversation_messages(id) on delete cascade,
  school_id uuid references public.schools(id) on delete restrict, storage_path text not null unique,
  file_name varchar(255) not null, mime_type varchar(120) not null, file_size bigint not null check(file_size between 1 and 10485760),
  uploaded_by_auth_user_id uuid not null references auth.users(id) on delete restrict, uploaded_at timestamptz not null default now()
);

-- Keep the link optional for legacy notifications, but make every new message
-- notification referentially safe.
alter table public.system_notifications
  drop constraint if exists system_notifications_conversation_id_fkey;
alter table public.system_notifications
  add constraint system_notifications_conversation_id_fkey
  foreign key (conversation_id) references public.school_platform_conversations(id)
  on delete set null;

create or replace function public.touch_school_platform_conversation()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists school_platform_conversations_touch on public.school_platform_conversations;
create trigger school_platform_conversations_touch before update on public.school_platform_conversations
for each row execute function public.touch_school_platform_conversation();

create or replace function public.is_school_message_member(p_school_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id
   where m.school_id=p_school_id and m.status='ACTIVE' and u.auth_user_id=auth.uid() and u.is_active
     and r.code in ('SCHOOL_ADMIN','HEAD_TEACHER','DEPUTY_HEAD_TEACHER','DIRECTOR_OF_STUDIES','BURSAR_READ_ONLY'));
$$;

create or replace function public.can_access_school_platform_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.is_active_platform_admin() or exists(select 1 from public.school_platform_conversations c where c.id=p_conversation_id and c.school_id is not null and public.is_school_message_member(c.school_id));
$$;

revoke all on function public.is_school_message_member(uuid),public.can_access_school_platform_conversation(uuid) from public,anon;
grant execute on function public.is_school_message_member(uuid),public.can_access_school_platform_conversation(uuid) to authenticated;

alter table public.school_platform_conversations enable row level security;
alter table public.school_platform_conversation_participants enable row level security;
alter table public.school_platform_conversation_messages enable row level security;
alter table public.school_platform_conversation_attachments enable row level security;
drop policy if exists school_platform_conversations_read on public.school_platform_conversations;
create policy school_platform_conversations_read on public.school_platform_conversations for select to authenticated using(public.can_access_school_platform_conversation(id));
drop policy if exists school_platform_participants_read on public.school_platform_conversation_participants;
create policy school_platform_participants_read on public.school_platform_conversation_participants for select to authenticated using(public.can_access_school_platform_conversation(conversation_id));
drop policy if exists school_platform_messages_read on public.school_platform_conversation_messages;
create policy school_platform_messages_read on public.school_platform_conversation_messages for select to authenticated using(public.can_access_school_platform_conversation(conversation_id) and (not is_internal_platform_note or public.is_active_platform_admin()));
drop policy if exists school_platform_attachments_read on public.school_platform_conversation_attachments;
create policy school_platform_attachments_read on public.school_platform_conversation_attachments for select to authenticated using(public.can_access_school_platform_conversation((select conversation_id from public.school_platform_conversation_messages m where m.id=conversation_message_id)));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('message-attachments','message-attachments',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.can_access_message_attachment_path(p_name text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when (storage.foldername(p_name))[1]='conversations' and (storage.foldername(p_name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then public.can_access_school_platform_conversation((storage.foldername(p_name))[2]::uuid) else false end;
$$;
revoke all on function public.can_access_message_attachment_path(text) from public,anon;
grant execute on function public.can_access_message_attachment_path(text) to authenticated;
create or replace function public.can_read_message_attachment_path(p_name text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.school_platform_conversation_attachments a join public.school_platform_conversation_messages m on m.id=a.conversation_message_id
   where a.storage_path=p_name and (not m.is_internal_platform_note or public.is_active_platform_admin())
     and public.can_access_school_platform_conversation(m.conversation_id));
$$;
revoke all on function public.can_read_message_attachment_path(text) from public,anon;
grant execute on function public.can_read_message_attachment_path(text) to authenticated;
drop policy if exists message_attachments_read on storage.objects;
create policy message_attachments_read on storage.objects for select to authenticated using(bucket_id='message-attachments' and public.can_read_message_attachment_path(name));
drop policy if exists message_attachments_write on storage.objects;
create policy message_attachments_write on storage.objects for insert to authenticated with check(bucket_id='message-attachments' and public.can_access_message_attachment_path(name) and (storage.foldername(name))[3]=auth.uid()::text);

create or replace function public.message_centre_notify(p_conversation_id uuid,p_message_id uuid,p_event_type text,p_title text,p_message text,p_recipient_role text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_conversation public.school_platform_conversations%rowtype; v_recipient record;
begin
 select * into v_conversation from public.school_platform_conversations where id=p_conversation_id;
 if v_conversation.id is null then return; end if;
 for v_recipient in
   select distinct pa.auth_user_id from public.platform_admins pa where p_recipient_role='PLATFORM' and pa.is_active
   union
   select distinct u.auth_user_id from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id
    where p_recipient_role='SCHOOL' and m.school_id=v_conversation.school_id and m.status='ACTIVE' and u.is_active and u.auth_user_id is not null
      and r.code in ('SCHOOL_ADMIN','HEAD_TEACHER','DEPUTY_HEAD_TEACHER','DIRECTOR_OF_STUDIES','BURSAR_READ_ONLY')
 loop
  insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,conversation_id,conversation_message_id,related_entity_type,related_entity_id,action_url,idempotency_key)
  values(v_conversation.school_id,v_recipient.auth_user_id,'Messages',p_event_type,p_title,p_message,'school_platform_conversation',v_conversation.id,p_conversation_id,p_message_id,v_conversation.related_entity_type,v_conversation.related_entity_id,concat('/messages?conversation=',p_conversation_id),'message:',p_event_type,':',p_conversation_id,':',coalesce(p_message_id::text,'state'),':',v_recipient.auth_user_id)
  on conflict(idempotency_key) do nothing;
 end loop;
end;
$$;

create or replace function public.create_school_platform_conversation(p_school_id uuid,p_category text,p_subject text,p_body text,p_priority text default 'NORMAL',p_related_entity_type text default null,p_related_entity_id uuid default null,p_action_url text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_message_id uuid; v_platform boolean:=public.is_active_platform_admin();
begin
 if p_school_id is null or not (v_platform or public.is_school_message_member(p_school_id)) then raise exception 'MESSAGE_CENTRE_ACCESS_REQUIRED'; end if;
 if p_category not in ('GENERAL_SUPPORT','SCHOOL_REGISTRATION','SCHOOL_PROFILE_AND_SETUP','SUBSCRIPTION_AND_BILLING','PAYMENT_INITIATION','PAYMENT_FAILURE','PAYMENT_REFUND','SUBJECT_ACTIVATION','ACADEMIC_SETUP','CLASS_AND_LEARNER_SETUP','STAFF_AND_ROLE_SETUP','IMPORT_OR_EXPORT','ASSESSMENT_AND_MARKS','APPROVAL_OR_REPORT','TECHNICAL_ISSUE','FEATURE_REQUEST','PLATFORM_ANNOUNCEMENT') then raise exception 'MESSAGE_CATEGORY_INVALID'; end if;
 if p_priority not in ('LOW','NORMAL','HIGH','URGENT') then raise exception 'MESSAGE_PRIORITY_INVALID'; end if;
 insert into public.school_platform_conversations(school_id,category,subject,status,priority,related_entity_type,related_entity_id,action_url,opened_by_auth_user_id)
 values(p_school_id,p_category,trim(p_subject),case when v_platform then 'AWAITING_SCHOOL' else 'AWAITING_PLATFORM' end,p_priority,nullif(trim(p_related_entity_type),''),p_related_entity_id,case when p_action_url like '/%' and p_action_url not like '//%' then p_action_url else null end,auth.uid()) returning id into v_id;
 insert into public.school_platform_conversation_participants(conversation_id,auth_user_id,participant_role,last_read_at) values(v_id,auth.uid(),case when v_platform then 'PLATFORM' else 'SCHOOL' end,now());
 insert into public.school_platform_conversation_messages(conversation_id,sender_auth_user_id,body) values(v_id,auth.uid(),trim(p_body)) returning id into v_message_id;
 perform public.message_centre_notify(v_id,v_message_id,'CONVERSATION_OPENED',case when v_platform then 'Platform Support opened a message' else 'Your school sent a support message' end,trim(p_subject),case when v_platform then 'SCHOOL' else 'PLATFORM' end);
 return v_id;
end;
$$;

create or replace function public.post_school_platform_message(p_conversation_id uuid,p_body text,p_internal_platform_note boolean default false)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_conversation public.school_platform_conversations%rowtype; v_id uuid; v_platform boolean:=public.is_active_platform_admin();
begin
 select * into v_conversation from public.school_platform_conversations where id=p_conversation_id for update;
 if v_conversation.id is null or not public.can_access_school_platform_conversation(p_conversation_id) then raise exception 'CONVERSATION_NOT_AVAILABLE'; end if;
 if v_conversation.status='CLOSED' then raise exception 'CONVERSATION_CLOSED_REOPEN_FIRST'; end if;
 if p_internal_platform_note and not v_platform then raise exception 'PLATFORM_NOTE_REQUIRED'; end if;
 insert into public.school_platform_conversation_participants(conversation_id,auth_user_id,participant_role,last_read_at) values(p_conversation_id,auth.uid(),case when v_platform then 'PLATFORM' else 'SCHOOL' end,now()) on conflict(conversation_id,auth_user_id) do update set last_read_at=excluded.last_read_at,archived_at=null;
 insert into public.school_platform_conversation_messages(conversation_id,sender_auth_user_id,body,is_internal_platform_note) values(p_conversation_id,auth.uid(),trim(p_body),p_internal_platform_note) returning id into v_id;
 if not p_internal_platform_note then
  update public.school_platform_conversations set status=case when status='RESOLVED' then 'REOPENED' when v_platform then 'AWAITING_SCHOOL' else 'AWAITING_PLATFORM' end,updated_at=now() where id=p_conversation_id;
  perform public.message_centre_notify(p_conversation_id,v_id,'CONVERSATION_REPLY',case when v_platform then 'Platform Support replied to your message' else 'Your school replied to a support message' end,trim(p_body),case when v_platform then 'SCHOOL' else 'PLATFORM' end);
 end if;
 return v_id;
end;
$$;

create or replace function public.update_school_platform_conversation(p_conversation_id uuid,p_action text,p_resolution_summary text default null,p_priority text default null,p_assigned_platform_auth_user_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_conversation public.school_platform_conversations%rowtype; v_platform boolean:=public.is_active_platform_admin();
begin
 select * into v_conversation from public.school_platform_conversations where id=p_conversation_id for update;
 if v_conversation.id is null or not public.can_access_school_platform_conversation(p_conversation_id) then raise exception 'CONVERSATION_NOT_AVAILABLE'; end if;
 if p_action in ('ASSIGN','PRIORITY') and not v_platform then raise exception 'PLATFORM_ACTION_REQUIRED'; end if;
 if p_action='RESOLVE' and nullif(trim(coalesce(p_resolution_summary,'')),'') is null then raise exception 'RESOLUTION_SUMMARY_REQUIRED'; end if;
 if p_action='ASSIGN' then
   if p_assigned_platform_auth_user_id is not null and not exists(select 1 from public.platform_admins where auth_user_id=p_assigned_platform_auth_user_id and is_active) then raise exception 'PLATFORM_ASSIGNEE_NOT_ACTIVE'; end if;
   update public.school_platform_conversations set assigned_platform_auth_user_id=p_assigned_platform_auth_user_id,updated_at=now() where id=p_conversation_id;
 elsif p_action='PRIORITY' then if p_priority not in ('LOW','NORMAL','HIGH','URGENT') then raise exception 'MESSAGE_PRIORITY_INVALID'; end if; update public.school_platform_conversations set priority=p_priority,updated_at=now() where id=p_conversation_id;
 elsif p_action='RESOLVE' then update public.school_platform_conversations set status='RESOLVED',resolution_summary=trim(p_resolution_summary),resolved_by_auth_user_id=auth.uid(),resolved_at=now(),updated_at=now() where id=p_conversation_id;
 elsif p_action='CLOSE' then update public.school_platform_conversations set status='CLOSED',resolution_summary=trim(p_resolution_summary),closed_by_auth_user_id=auth.uid(),closed_at=now(),updated_at=now() where id=p_conversation_id;
 elsif p_action='REOPEN' then update public.school_platform_conversations set status='REOPENED',resolution_summary=null,resolved_by_auth_user_id=null,resolved_at=null,closed_by_auth_user_id=null,closed_at=null,updated_at=now() where id=p_conversation_id;
 else raise exception 'MESSAGE_ACTION_INVALID'; end if;
 perform public.message_centre_notify(p_conversation_id,null,concat('CONVERSATION_',p_action),case when p_action='RESOLVE' then 'A support message was resolved' when p_action='CLOSE' then 'A support message was closed' when p_action='REOPEN' then 'A support message was reopened' else 'A support message was updated' end,coalesce(nullif(trim(p_resolution_summary),''),coalesce(p_priority,'Conversation details changed')),case when v_platform then 'SCHOOL' else 'PLATFORM' end);
 return p_conversation_id;
end;
$$;

create or replace function public.get_school_platform_message_centre(p_school_id uuid default null)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'schoolId',c.school_id,'schoolName',s.official_name,'subject',c.subject,'category',c.category,'status',c.status,'priority',c.priority,'assignedPlatformAuthUserId',c.assigned_platform_auth_user_id,'latestPreview',coalesce((select left(m.body,240) from public.school_platform_conversation_messages m where m.conversation_id=c.id and m.deleted_at is null and (not m.is_internal_platform_note or public.is_active_platform_admin()) order by m.sent_at desc limit 1),''),'createdAt',c.created_at,'updatedAt',c.updated_at,'relatedEntityType',c.related_entity_type,'relatedEntityId',c.related_entity_id,'actionUrl',c.action_url,'unread',exists(select 1 from public.school_platform_conversation_messages m where m.conversation_id=c.id and m.sender_auth_user_id<>auth.uid() and m.sent_at>coalesce((select p.last_read_at from public.school_platform_conversation_participants p where p.conversation_id=c.id and p.auth_user_id=auth.uid()),'-infinity'::timestamptz))) order by c.updated_at desc),'[]'::jsonb)
 from public.school_platform_conversations c left join public.schools s on s.id=c.school_id
 where (public.is_active_platform_admin() and (p_school_id is null or c.school_id=p_school_id)) or (not public.is_active_platform_admin() and c.school_id=p_school_id and public.is_school_message_member(p_school_id));
$$;

create or replace function public.get_school_platform_conversation(p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
 if not public.can_access_school_platform_conversation(p_conversation_id) then raise exception 'CONVERSATION_NOT_AVAILABLE'; end if;
 update public.school_platform_conversation_participants set last_read_at=now() where conversation_id=p_conversation_id and auth_user_id=auth.uid();
 insert into public.school_platform_conversation_participants(conversation_id,auth_user_id,participant_role,last_read_at) values(p_conversation_id,auth.uid(),case when public.is_active_platform_admin() then 'PLATFORM' else 'SCHOOL' end,now()) on conflict(conversation_id,auth_user_id) do update set last_read_at=excluded.last_read_at;
 select jsonb_build_object('conversation',jsonb_build_object('id',c.id,'schoolId',c.school_id,'subject',c.subject,'category',c.category,'status',c.status,'priority',c.priority,'resolutionSummary',c.resolution_summary,'relatedEntityType',c.related_entity_type,'relatedEntityId',c.related_entity_id,'actionUrl',c.action_url),'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'senderAuthUserId',m.sender_auth_user_id,'body',m.body,'sentAt',m.sent_at,'isInternalPlatformNote',m.is_internal_platform_note,'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'fileName',a.file_name,'mimeType',a.mime_type,'fileSize',a.file_size,'storagePath',a.storage_path)) from public.school_platform_conversation_attachments a where a.conversation_message_id=m.id),'[]'::jsonb)) order by m.sent_at) from public.school_platform_conversation_messages m where m.conversation_id=c.id and m.deleted_at is null and (not m.is_internal_platform_note or public.is_active_platform_admin())),'[]'::jsonb)) into v from public.school_platform_conversations c where c.id=p_conversation_id;
 return v;
end;
$$;

create or replace function public.get_notification_centre(p_limit integer default 100)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'category',n.category,'eventType',n.event_type,'title',n.title,'message',n.message,'readAt',n.read_at,'createdAt',n.created_at,'conversationId',n.conversation_id,'conversationMessageId',n.conversation_message_id,'relatedEntityType',n.related_entity_type,'relatedEntityId',n.related_entity_id,'actionUrl',n.action_url) order by n.created_at desc),'[]'::jsonb)
 from (select * from public.system_notifications where recipient_user_id=auth.uid() order by created_at desc limit greatest(1,least(coalesce(p_limit,100),200))) n;
$$;
create or replace function public.mark_notification_centre_read(p_notification_ids uuid[] default null)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer; begin update public.system_notifications set read_at=coalesce(read_at,now()) where recipient_user_id=auth.uid() and (p_notification_ids is null or id=any(p_notification_ids)); get diagnostics v_count=row_count; return v_count; end;
$$;

create or replace function public.record_school_platform_attachment(p_message_id uuid,p_storage_path text,p_file_name text,p_mime_type text,p_file_size bigint)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_conversation_id uuid; v_school_id uuid; v_id uuid;
begin
 select m.conversation_id,c.school_id into v_conversation_id,v_school_id from public.school_platform_conversation_messages m join public.school_platform_conversations c on c.id=m.conversation_id where m.id=p_message_id and m.sender_auth_user_id=auth.uid();
 if v_conversation_id is null or not public.can_access_school_platform_conversation(v_conversation_id) then raise exception 'ATTACHMENT_NOT_AVAILABLE'; end if;
 if p_storage_path !~ ('^conversations/'||v_conversation_id::text||'/'||auth.uid()::text||'/[0-9a-f-]{36}\.[a-z0-9]{1,8}$') then raise exception 'ATTACHMENT_PATH_INVALID'; end if;
 insert into public.school_platform_conversation_attachments(conversation_message_id,school_id,storage_path,file_name,mime_type,file_size,uploaded_by_auth_user_id)
 values(p_message_id,v_school_id,p_storage_path,trim(p_file_name),trim(p_mime_type),p_file_size,auth.uid()) returning id into v_id;
 return v_id;
end;
$$;

revoke all on function public.message_centre_notify(uuid,uuid,text,text,text,text),public.create_school_platform_conversation(uuid,text,text,text,text,text,uuid,text),public.post_school_platform_message(uuid,text,boolean),public.update_school_platform_conversation(uuid,text,text,text,uuid),public.get_school_platform_message_centre(uuid),public.get_school_platform_conversation(uuid),public.get_notification_centre(integer),public.mark_notification_centre_read(uuid[]),public.record_school_platform_attachment(uuid,text,text,text,bigint) from public,anon;
grant execute on function public.create_school_platform_conversation(uuid,text,text,text,text,text,uuid,text),public.post_school_platform_message(uuid,text,boolean),public.update_school_platform_conversation(uuid,text,text,text,uuid),public.get_school_platform_message_centre(uuid),public.get_school_platform_conversation(uuid),public.get_notification_centre(integer),public.mark_notification_centre_read(uuid[]),public.record_school_platform_attachment(uuid,text,text,text,bigint) to authenticated;

commit;
