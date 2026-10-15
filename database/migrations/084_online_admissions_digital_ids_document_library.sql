begin;

-- Online admissions, digital school IDs, guardian links, and the protected
-- document library. These additions reuse existing school/learner/staff rows.
insert into public.roles(code,name,description,is_system_role) values
  ('ADMISSIONS_OFFICER','Admissions Officer','Reviews school admission applications and supports applicant conversion.',true)
on conflict(code) do nothing;
insert into public.permissions(code,description) values
  ('admissions.manage','Manage admission openings, applications and applicant conversion.'),
  ('idcards.manage','Issue and manage school learner and staff identity cards.'),
  ('documents.manage','Manage school document-library records and visibility.')
on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='SCHOOL_ADMIN' and p.code in ('admissions.manage','idcards.manage','documents.manage')
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='ADMISSIONS_OFFICER' and p.code in ('admissions.manage')
on conflict do nothing;

-- Keep O-Level admission conversion compatible with the tenant-scoped
-- Admissions Officer role without weakening any other subject-selection rule.
do $$
declare
  v_definition text;
  v_updated text;
begin
  v_definition := pg_get_functiondef('public.set_o_level_learner_subject_choices(uuid,uuid[],uuid[],text)'::regprocedure);
  v_updated := replace(v_definition,
    $old$not in ('SCHOOL_ADMIN','HEAD_TEACHER','DEPUTY_HEAD_TEACHER','DIRECTOR_OF_STUDIES')$old$,
    $new$not in ('SCHOOL_ADMIN','HEAD_TEACHER','DEPUTY_HEAD_TEACHER','DIRECTOR_OF_STUDIES','ADMISSIONS_OFFICER')$new$);
  if v_updated = v_definition then
    if position('ADMISSIONS_OFFICER' in v_definition) = 0 then
      raise exception 'Could not safely extend O-Level subject-selection permissions for Admissions Officers';
    end if;
  else
    execute v_updated;
  end if;
end;
$$;

create table public.admission_openings(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  title varchar(180) not null,
  target_class_levels smallint[] not null,
  opening_date date not null,
  closing_date date not null,
  status varchar(20) not null default 'DRAFT' check(status in ('DRAFT','OPEN','CLOSED','ARCHIVED')),
  reporting_requirements text not null default '',
  required_documents jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint admission_opening_dates check(closing_date>=opening_date),
  constraint admission_opening_levels check(cardinality(target_class_levels)>0 and target_class_levels <@ array[1,2,3,4,5,6]::smallint[]),
  constraint admission_opening_requirements check(jsonb_typeof(required_documents)='array'),
  unique(id,school_id)
);

create table public.admission_applications(
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  admission_opening_id uuid not null, application_reference varchar(32) not null unique,
  access_token_hash text not null, intended_class_level smallint not null check(intended_class_level between 1 and 6),
  learner_details jsonb not null, guardian_details jsonb not null,
  status varchar(32) not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','INTERVIEW_REQUIRED','ACCEPTED','WAITLISTED','REJECTED','WITHDRAWN','EXPIRED','CONVERTED_TO_LEARNER')),
  submitted_at timestamptz, reviewed_by uuid references public.users(id) on delete set null,
  decision_reason text, interview_at timestamptz, converted_learner_id uuid references public.learners(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(admission_opening_id,school_id) references public.admission_openings(id,school_id) on delete restrict,
  unique(id,school_id),
  check(jsonb_typeof(learner_details)='object' and jsonb_typeof(guardian_details)='object'),
  check((status='CONVERTED_TO_LEARNER')=(converted_learner_id is not null))
);
create index admission_applications_school_status_idx on public.admission_applications(school_id,status,submitted_at desc);
create index admission_applications_opening_idx on public.admission_applications(admission_opening_id,intended_class_level,status);

create table public.admission_application_documents(
  id uuid primary key default gen_random_uuid(), school_id uuid not null,
  admission_application_id uuid not null, linked_learner_id uuid, document_type varchar(80) not null,
  storage_path text not null unique, file_name varchar(255) not null, mime_type varchar(120) not null,
  file_size bigint not null check(file_size between 1 and 10485760),
  status varchar(20) not null default 'UPLOADED' check(status in ('UPLOADED','VERIFIED','REJECTED')),
  uploaded_at timestamptz not null default now(), verified_by uuid references public.users(id), verified_at timestamptz,
  foreign key(admission_application_id,school_id) references public.admission_applications(id,school_id) on delete cascade,
  foreign key(linked_learner_id,school_id) references public.learners(id,school_id) on delete restrict,
  unique(id,school_id)
);

create table public.learner_guardians(
  id uuid primary key default gen_random_uuid(), school_id uuid not null, learner_id uuid not null,
  full_name varchar(200) not null, relationship varchar(80) not null, phone varchar(60), email varchar(255),
  auth_user_id uuid references auth.users(id) on delete set null, is_primary boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(learner_id,school_id) references public.learners(id,school_id) on delete restrict,
  unique(id,school_id)
);
create unique index learner_guardians_one_primary_idx on public.learner_guardians(learner_id) where is_primary;

create table public.admission_applicant_notifications(
  id uuid primary key default gen_random_uuid(), admission_application_id uuid not null references public.admission_applications(id) on delete cascade,
  event_type varchar(60) not null, title varchar(180) not null, message text not null,
  created_at timestamptz not null default now(), read_at timestamptz
);

create table public.school_admission_sequences(
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  next_number integer not null default 1 check(next_number>0),
  primary key(school_id,academic_year_id)
);

create table public.school_admission_officer_role_history(
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict, previous_role_id uuid not null references public.roles(id) on delete restrict,
  assigned_by uuid not null references public.users(id) on delete restrict, assigned_at timestamptz not null default now(),
  restored_at timestamptz, restored_by uuid references public.users(id) on delete set null
);
create unique index school_admission_officer_one_active on public.school_admission_officer_role_history(school_id,user_id) where restored_at is null;

create table public.identity_cards(
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  person_type varchar(16) not null check(person_type in ('LEARNER','STAFF')),
  learner_id uuid, staff_id uuid, card_reference varchar(48) not null unique,
  secure_verification_token varchar(64) not null unique,
  issue_date date not null default current_date, expiry_date date,
  status varchar(16) not null default 'ACTIVE' check(status in ('DRAFT','ACTIVE','EXPIRED','REVOKED','REPLACED')),
  replaced_card_id uuid references public.identity_cards(id) on delete restrict,
  issued_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(learner_id,school_id) references public.learners(id,school_id) on delete restrict,
  foreign key(staff_id) references public.users(id) on delete restrict,
  check((person_type='LEARNER' and learner_id is not null and staff_id is null) or (person_type='STAFF' and staff_id is not null and learner_id is null)),
  check(expiry_date is null or expiry_date>=issue_date),
  unique(id,school_id)
);
create unique index identity_cards_one_active_learner_idx on public.identity_cards(school_id,learner_id) where person_type='LEARNER' and status='ACTIVE';
create unique index identity_cards_one_active_staff_idx on public.identity_cards(school_id,staff_id) where person_type='STAFF' and status='ACTIVE';
create index identity_cards_school_status_idx on public.identity_cards(school_id,person_type,status,created_at desc);

create table public.document_library_items(
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  document_group_id uuid not null default gen_random_uuid(),
  category varchar(64) not null check(category in ('SCHOOL_POLICY','CIRCULAR','SCHOOL_FORM','LEARNER_ADMISSION','LEARNER_TRANSFER','STAFF_EMPLOYMENT','STAFF_QUALIFICATION','ACADEMIC_RESOURCE','PAST_PAPER','TEACHER_LESSON_RESOURCE','INTERNAL_ADMINISTRATION')),
  title varchar(200) not null, description text, linked_entity_type varchar(32), linked_entity_id uuid,
  visibility_level varchar(32) not null check(visibility_level in ('PLATFORM_ONLY','SCHOOL_ADMIN_ONLY','AUTHORIZED_STAFF','TEACHERS','LEARNERS','PARENTS','PUBLIC_ADMISSION_APPLICANT')),
  storage_path text not null, file_name varchar(255) not null, mime_type varchar(120) not null,
  file_size bigint not null check(file_size between 1 and 52428800), version_number integer not null default 1 check(version_number>0),
  status varchar(16) not null default 'ACTIVE' check(status in ('ACTIVE','ARCHIVED','DELETED')),
  uploaded_by uuid not null references public.users(id) on delete restrict,
  uploaded_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(school_id,storage_path), unique(document_group_id,version_number),
  check((linked_entity_type is null)=(linked_entity_id is null)),
  check((visibility_level<>'PUBLIC_ADMISSION_APPLICANT') or category='SCHOOL_FORM')
);
create index document_library_scope_idx on public.document_library_items(school_id,status,category,visibility_level,uploaded_at desc);

create or replace function public.can_manage_admissions(p_school_id uuid)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
 select public.is_school_admin_for(p_school_id) or exists(
  select 1 from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id
  where m.school_id=p_school_id and m.status='ACTIVE' and u.auth_user_id=auth.uid() and u.is_active and u.account_status='ACTIVE' and r.code='ADMISSIONS_OFFICER'
 );
$$;

create or replace function public.can_view_school_document(p_document_id uuid,p_school_id uuid)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
 select exists(select 1 from public.document_library_items d where d.id=p_document_id and d.school_id=p_school_id and d.status='ACTIVE' and (
   public.is_active_platform_admin() or (d.visibility_level<>'PLATFORM_ONLY' and public.is_school_admin_for(p_school_id)) or
   (d.visibility_level='AUTHORIZED_STAFF' and public.is_active_school_member(p_school_id) and (d.linked_entity_type is distinct from 'STAFF' or d.linked_entity_id=public.current_app_user_id())) or
   (d.visibility_level='TEACHERS' and exists(select 1 from public.school_memberships m join public.roles r on r.id=m.role_id join public.users u on u.id=m.user_id where m.school_id=p_school_id and m.status='ACTIVE' and u.auth_user_id=auth.uid() and u.is_active and r.code='TEACHER')) or
   (d.visibility_level in ('LEARNERS','PARENTS') and d.linked_entity_type='LEARNER' and exists(
     select 1 from public.learner_guardians g where g.school_id=p_school_id and g.learner_id=d.linked_entity_id and g.auth_user_id=auth.uid()
   ))
 ));
$$;

alter table public.admission_openings enable row level security;
alter table public.admission_applications enable row level security;
alter table public.admission_application_documents enable row level security;
alter table public.learner_guardians enable row level security;
alter table public.admission_applicant_notifications enable row level security;
alter table public.school_admission_officer_role_history enable row level security;
alter table public.identity_cards enable row level security;
alter table public.document_library_items enable row level security;

create policy admission_openings_school_manage on public.admission_openings for all to authenticated using(public.can_manage_admissions(school_id)) with check(public.can_manage_admissions(school_id));
create policy admission_applications_school_read on public.admission_applications for select to authenticated using(public.can_manage_admissions(school_id) or public.is_active_platform_admin());
create policy admission_documents_school_read on public.admission_application_documents for select to authenticated using(public.can_manage_admissions(school_id) or public.is_active_platform_admin());
create policy learner_guardians_school_read on public.learner_guardians for select to authenticated using(public.is_school_admin_for(school_id) or public.is_active_platform_admin() or auth_user_id=auth.uid());
create policy applicant_notifications_school_read on public.admission_applicant_notifications for select to authenticated using(exists(select 1 from public.admission_applications a where a.id=admission_application_id and public.can_manage_admissions(a.school_id)));
create policy school_admission_officer_history_school_read on public.school_admission_officer_role_history for select to authenticated using(public.is_school_admin_for(school_id) or public.is_active_platform_admin());
create policy identity_cards_school_read on public.identity_cards for select to authenticated using(public.is_school_admin_for(school_id) or public.is_active_platform_admin() or exists(select 1 from public.learner_guardians g where g.school_id=identity_cards.school_id and g.learner_id=identity_cards.learner_id and g.auth_user_id=auth.uid()));
create policy document_library_authorized_read on public.document_library_items for select to authenticated using(public.can_view_school_document(id,school_id));
create policy document_library_admin_manage on public.document_library_items for all to authenticated using(public.is_school_admin_for(school_id)) with check(public.is_school_admin_for(school_id));

revoke all on public.admission_openings,public.admission_applications,public.admission_application_documents,public.learner_guardians,public.admission_applicant_notifications,public.school_admission_officer_role_history,public.identity_cards,public.document_library_items from anon,authenticated;
grant select on public.admission_openings,public.admission_applications,public.admission_application_documents,public.learner_guardians,public.admission_applicant_notifications,public.identity_cards,public.document_library_items to authenticated;
grant insert,update,delete on public.admission_openings,public.document_library_items to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('school-admission-documents','school-admission-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
 ('school-document-library','school-document-library',false,52428800,array['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy school_admission_documents_read on storage.objects for select to authenticated using(
 bucket_id='school-admission-documents' and (storage.foldername(name))[1]='schools' and (storage.foldername(name))[3]='admissions'
 and exists(select 1 from public.admission_applications a where a.school_id=((storage.foldername(name))[2])::uuid and a.id=((storage.foldername(name))[4])::uuid and public.can_manage_admissions(a.school_id))
);
create policy school_document_library_read on storage.objects for select to authenticated using(
 bucket_id='school-document-library' and (storage.foldername(name))[1]='schools' and exists(
  select 1 from public.document_library_items d where d.school_id=((storage.foldername(name))[2])::uuid and d.storage_path=name and public.can_view_school_document(d.id,d.school_id))
);
create policy school_document_library_admin_insert on storage.objects for insert to authenticated with check(
 bucket_id='school-document-library' and (storage.foldername(name))[1]='schools' and public.is_school_admin_for(((storage.foldername(name))[2])::uuid)
);
create policy school_document_library_admin_update on storage.objects for update to authenticated using(
 bucket_id='school-document-library' and (storage.foldername(name))[1]='schools' and public.is_school_admin_for(((storage.foldername(name))[2])::uuid)
) with check(bucket_id='school-document-library' and (storage.foldername(name))[1]='schools' and public.is_school_admin_for(((storage.foldername(name))[2])::uuid));
create policy school_document_library_admin_delete on storage.objects for delete to authenticated using(
 bucket_id='school-document-library' and (storage.foldername(name))[1]='schools' and public.is_school_admin_for(((storage.foldername(name))[2])::uuid)
);

create or replace function public.get_public_admission_openings(p_school_code text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'schoolId',s.id,'schoolCode',s.school_code,'schoolName',s.official_name,'schoolLogo',s.logo_url,'schoolAddress',s.address,'schoolPhone',s.telephone,'schoolEmail',s.email,'title',o.title,'academicYear',y.name,'targetClassLevels',o.target_class_levels,'openingDate',o.opening_date,'closingDate',o.closing_date,'status',case when current_date<o.opening_date then 'UPCOMING' else 'OPEN' end,'reportingRequirements',o.reporting_requirements,'requiredDocuments',o.required_documents) order by o.opening_date desc),'[]'::jsonb)
 from public.admission_openings o join public.schools s on s.id=o.school_id join public.academic_years y on y.id=o.academic_year_id
 where lower(s.school_code)=lower(trim(p_school_code)) and s.is_active and o.status='OPEN' and current_date<=o.closing_date;
$$;

create or replace function public.start_public_admission_application(p_opening_id uuid,p_class_level smallint,p_learner_details jsonb,p_guardian_details jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_opening public.admission_openings%rowtype; v_id uuid; v_ref text; v_token text;
begin
 select * into v_opening from public.admission_openings where id=p_opening_id and status='OPEN' and current_date between opening_date and closing_date;
 if v_opening.id is null then raise exception 'ADMISSION_OPENING_UNAVAILABLE'; end if;
 if not (p_class_level=any(v_opening.target_class_levels)) then raise exception 'CLASS_LEVEL_NOT_AVAILABLE'; end if;
 if jsonb_typeof(p_learner_details)<>'object' or jsonb_typeof(p_guardian_details)<>'object' or
    nullif(trim(p_learner_details->>'firstName'),'') is null or nullif(trim(p_learner_details->>'lastName'),'') is null or
    nullif(trim(p_guardian_details->>'fullName'),'') is null or nullif(trim(p_guardian_details->>'phone'),'') is null then raise exception 'APPLICATION_FIELDS_REQUIRED'; end if;
 v_ref:='SOMA-'||upper(encode(gen_random_bytes(6),'hex')); v_token:=encode(gen_random_bytes(32),'hex');
 insert into public.admission_applications(school_id,admission_opening_id,application_reference,access_token_hash,intended_class_level,learner_details,guardian_details)
 values(v_opening.school_id,v_opening.id,v_ref,encode(digest(v_token,'sha256'),'hex'),p_class_level,p_learner_details,p_guardian_details) returning id into v_id;
 return jsonb_build_object('applicationId',v_id,'applicationReference',v_ref,'accessToken',v_token,'status','DRAFT');
end;
$$;

create or replace function public.save_public_admission_draft(p_reference text,p_access_token text,p_class_level smallint,p_learner_details jsonb,p_guardian_details jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_app public.admission_applications%rowtype;
begin
 select * into v_app from public.admission_applications where application_reference=upper(trim(p_reference)) and access_token_hash=encode(digest(coalesce(p_access_token,''),'sha256'),'hex') for update;
 if v_app.id is null then raise exception 'APPLICATION_REFERENCE_OR_TOKEN_INVALID'; end if;
 if v_app.status not in ('DRAFT','MORE_INFORMATION_REQUIRED') then raise exception 'APPLICATION_NOT_EDITABLE'; end if;
 if not exists(select 1 from public.admission_openings o where o.id=v_app.admission_opening_id and o.status='OPEN' and p_class_level=any(o.target_class_levels) and current_date<=o.closing_date) then raise exception 'ADMISSION_OPENING_CLOSED'; end if;
 if nullif(trim(p_learner_details->>'firstName'),'') is null or nullif(trim(p_learner_details->>'lastName'),'') is null or nullif(trim(p_guardian_details->>'fullName'),'') is null or nullif(trim(p_guardian_details->>'phone'),'') is null then raise exception 'APPLICATION_FIELDS_REQUIRED'; end if;
 update public.admission_applications set intended_class_level=p_class_level,learner_details=p_learner_details,guardian_details=p_guardian_details,status='DRAFT',updated_at=now() where id=v_app.id;
 return jsonb_build_object('applicationReference',v_app.application_reference,'status','DRAFT');
end;
$$;

create or replace function public.record_public_admission_document(p_reference text,p_access_token text,p_document_type text,p_storage_path text,p_file_name text,p_mime_type text,p_file_size bigint)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_app public.admission_applications%rowtype; v_id uuid;
begin
 select * into v_app from public.admission_applications where application_reference=upper(trim(p_reference)) and access_token_hash=encode(digest(coalesce(p_access_token,''),'sha256'),'hex') for update;
 if v_app.id is null or v_app.status not in ('DRAFT','MORE_INFORMATION_REQUIRED') then raise exception 'APPLICATION_NOT_EDITABLE'; end if;
 if p_storage_path !~ ('^schools/'||v_app.school_id::text||'/admissions/'||v_app.id::text||'/documents/[0-9a-f-]{36}$') then raise exception 'ADMISSION_DOCUMENT_PATH_INVALID'; end if;
 if p_file_size not between 1 and 10485760 or p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document') then raise exception 'ADMISSION_DOCUMENT_FILE_INVALID'; end if;
 insert into public.admission_application_documents(school_id,admission_application_id,document_type,storage_path,file_name,mime_type,file_size)
 values(v_app.school_id,v_app.id,trim(p_document_type),p_storage_path,trim(p_file_name),p_mime_type,p_file_size) returning id into v_id;
 return v_id;
end;
$$;

create or replace function public.submit_public_admission_application(p_reference text,p_access_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_app public.admission_applications%rowtype; v_missing jsonb;
begin
 select * into v_app from public.admission_applications where application_reference=upper(trim(p_reference)) and access_token_hash=encode(digest(coalesce(p_access_token,''),'sha256'),'hex') for update;
 if v_app.id is null then raise exception 'APPLICATION_REFERENCE_OR_TOKEN_INVALID'; end if;
 if v_app.status not in ('DRAFT','MORE_INFORMATION_REQUIRED') then raise exception 'APPLICATION_ALREADY_SUBMITTED'; end if;
 if not exists(select 1 from public.admission_openings o where o.id=v_app.admission_opening_id and o.status='OPEN' and current_date between o.opening_date and o.closing_date) then raise exception 'ADMISSION_OPENING_CLOSED'; end if;
 select coalesce(jsonb_agg(req->>'type'),'[]'::jsonb) into v_missing
 from public.admission_openings o cross join lateral jsonb_array_elements(o.required_documents) req
 where o.id=v_app.admission_opening_id and coalesce((req->>'required')::boolean,false)
 and not exists(select 1 from public.admission_application_documents d where d.admission_application_id=v_app.id and d.document_type=req->>'type' and d.status in ('UPLOADED','VERIFIED'));
 if jsonb_array_length(v_missing)>0 then raise exception 'REQUIRED_ADMISSION_DOCUMENTS_MISSING: %',v_missing; end if;
 update public.admission_applications set status='SUBMITTED',submitted_at=now(),updated_at=now() where id=v_app.id;
 insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
 select v_app.school_id,u.auth_user_id,'ADMISSIONS','ADMISSION_APPLICATION_SUBMITTED','New admission application submitted',
  'Application '||v_app.application_reference||' is ready for review.','admission_application',v_app.id,'admission:submitted:'||v_app.id||':'||u.auth_user_id
 from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id
 where m.school_id=v_app.school_id and m.status='ACTIVE' and u.is_active and u.auth_user_id is not null and r.code in ('SCHOOL_ADMIN','ADMISSIONS_OFFICER')
 on conflict(idempotency_key) do nothing;
 insert into public.admission_applicant_notifications(admission_application_id,event_type,title,message)
 values(v_app.id,'SUBMITTED','Application submitted','Your application has been submitted to the school for review.');
 return jsonb_build_object('applicationReference',v_app.application_reference,'status','SUBMITTED');
end;
$$;

create or replace function public.get_public_admission_application_status(p_reference text,p_access_token text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_app public.admission_applications%rowtype;
begin
 select * into v_app from public.admission_applications where application_reference=upper(trim(p_reference)) and access_token_hash=encode(digest(coalesce(p_access_token,''),'sha256'),'hex');
 if v_app.id is null then raise exception 'APPLICATION_REFERENCE_OR_TOKEN_INVALID'; end if;
 return jsonb_build_object('applicationReference',v_app.application_reference,'status',v_app.status,'intendedClassLevel',v_app.intended_class_level,'submittedAt',v_app.submitted_at,'decisionReason',v_app.decision_reason,'interviewAt',v_app.interview_at,
  'notifications',(select coalesce(jsonb_agg(jsonb_build_object('title',n.title,'message',n.message,'createdAt',n.created_at) order by n.created_at desc),'[]'::jsonb) from public.admission_applicant_notifications n where n.admission_application_id=v_app.id),
  'documents',(select coalesce(jsonb_agg(jsonb_build_object('documentType',d.document_type,'fileName',d.file_name,'status',d.status,'uploadedAt',d.uploaded_at) order by d.uploaded_at),'[]'::jsonb) from public.admission_application_documents d where d.admission_application_id=v_app.id));
end;
$$;

create or replace function public.withdraw_public_admission_application(p_reference text,p_access_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_app public.admission_applications%rowtype;
begin
 select * into v_app from public.admission_applications where application_reference=upper(trim(p_reference)) and access_token_hash=encode(digest(coalesce(p_access_token,''),'sha256'),'hex') for update;
 if v_app.id is null then raise exception 'APPLICATION_REFERENCE_OR_TOKEN_INVALID'; end if;
 if v_app.status in ('CONVERTED_TO_LEARNER','REJECTED','EXPIRED','WITHDRAWN') then raise exception 'APPLICATION_CANNOT_BE_WITHDRAWN'; end if;
 update public.admission_applications set status='WITHDRAWN',updated_at=now() where id=v_app.id;
 insert into public.admission_applicant_notifications(admission_application_id,event_type,title,message) values(v_app.id,'WITHDRAWN','Application withdrawn','Your application has been withdrawn. Contact the school if you need assistance.');
 insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
 select v_app.school_id,u.auth_user_id,'ADMISSIONS','ADMISSION_APPLICATION_WITHDRAWN','Admission application withdrawn','Application '||v_app.application_reference||' was withdrawn by the applicant.','admission_application',v_app.id,'admission:withdrawn:'||v_app.id||':'||u.auth_user_id
 from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id where m.school_id=v_app.school_id and m.status='ACTIVE' and u.is_active and u.auth_user_id is not null and r.code in ('SCHOOL_ADMIN','ADMISSIONS_OFFICER') on conflict(idempotency_key) do nothing;
 return jsonb_build_object('applicationReference',v_app.application_reference,'status','WITHDRAWN');
end;
$$;

create or replace function public.get_school_admissions_workspace(p_school_id uuid)
 returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
 if not public.can_manage_admissions(p_school_id) then raise exception 'ADMISSIONS_PERMISSION_REQUIRED'; end if;
 insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
 select p_school_id,u.auth_user_id,'ADMISSIONS','ADMISSION_OPENING_CLOSING_SOON','Admission opening closes soon',o.title||' closes on '||o.closing_date::text,'admission_opening',o.id,'admission:closing-soon:'||o.id||':'||u.auth_user_id
 from public.admission_openings o join public.school_memberships m on m.school_id=o.school_id and m.status='ACTIVE' join public.users u on u.id=m.user_id and u.is_active and u.account_status='ACTIVE' and u.auth_user_id is not null join public.roles r on r.id=m.role_id
 where o.school_id=p_school_id and o.status='OPEN' and o.closing_date between current_date and current_date+3 and r.code in ('SCHOOL_ADMIN','ADMISSIONS_OFFICER') on conflict(idempotency_key) do nothing;
 return jsonb_build_object(
  'academicYears',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status) order by starts_on desc),'[]'::jsonb) from public.academic_years where school_id=p_school_id),
  'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'yearId',c.academic_year_id,'name',c.class_name,'level',c.level,'programme',c.programme,'status',c.status,'electiveMin',(select case when c.level<=2 then rules.elective_min_s1_s2 else rules.elective_min_s3_s4 end from public.o_level_curriculum_rule_sets rules where rules.id=c.o_level_rule_set_id),'electiveMax',(select case when c.level<=2 then rules.elective_max_s1_s2 else rules.elective_max_s3_s4 end from public.o_level_curriculum_rule_sets rules where rules.id=c.o_level_rule_set_id),
    'streams',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.stream_name) order by s.stream_name),'[]'::jsonb) from public.class_streams s where s.school_id=c.school_id and s.class_id=c.id and s.status='ACTIVE'),
    'offerings',(select coalesce(jsonb_agg(jsonb_build_object('id',co.id,'name',coalesce(so.display_name_override,ss.subject_name,so.school_subject_code),'code',coalesce(so.school_subject_code,ss.subject_code),'compulsory',co.is_compulsory,'requirement',rule.requirement) order by co.is_compulsory desc,coalesce(so.display_name_override,ss.subject_name,so.school_subject_code)),'[]'::jsonb)
      from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id left join public.system_subjects ss on ss.id=so.system_subject_id
      left join public.o_level_curriculum_subject_rules rule on rule.system_subject_id=so.system_subject_id and rule.rule_set_id=c.o_level_rule_set_id and rule.class_level=c.level and rule.is_active
      where co.school_id=c.school_id and co.class_id=c.id and co.academic_year_id=c.academic_year_id and co.status='ACTIVE' and so.status='ACTIVE')) order by level,class_name),'[]'::jsonb) from public.academic_classes c where c.school_id=p_school_id),
  'aLevelCombinations',(select coalesce(jsonb_agg(jsonb_build_object('id',ac.id,'academicYearId',ac.academic_year_id,'yearName',y.name,'code',ac.code,'name',ac.name,'level',ac.level,'subjects',(select coalesce(jsonb_agg(jsonb_build_object('code',so.school_subject_code,'name',coalesce(so.display_name_override,ss.subject_name,so.school_subject_code),'role',acs.subject_role) order by acs.display_order),'[]'::jsonb) from public.a_level_combination_subjects acs join public.school_subject_offerings so on so.id=acs.school_subject_offering_id and so.school_id=p_school_id and so.status='ACTIVE' left join public.system_subjects ss on ss.id=so.system_subject_id where acs.combination_id=ac.id)) order by y.starts_on desc,ac.code),'[]'::jsonb) from public.a_level_combinations ac join public.academic_years y on y.id=ac.academic_year_id and y.school_id=p_school_id where ac.school_id=p_school_id and ac.status='ACTIVE'),
  'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'role',r.code,'email',u.email) order by u.full_name),'[]'::jsonb) from public.users u join public.school_memberships m on m.user_id=u.id join public.roles r on r.id=m.role_id where m.school_id=p_school_id and m.status='ACTIVE' and u.is_active and u.account_status='ACTIVE' and r.code not in ('SCHOOL_ADMIN','PLATFORM_ADMIN','LEARNER','PARENT_GUARDIAN')),
  'admissionsOfficers',(select coalesce(jsonb_agg(jsonb_build_object('userId',hist.user_id,'name',u.full_name,'email',u.email,'assignedAt',hist.assigned_at,'previousRole',prev.name) order by u.full_name),'[]'::jsonb) from public.school_admission_officer_role_history hist join public.users u on u.id=hist.user_id join public.roles prev on prev.id=hist.previous_role_id where hist.school_id=p_school_id and hist.restored_at is null),
  'openings',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'yearId',o.academic_year_id,'yearName',y.name,'title',o.title,'targetClassLevels',o.target_class_levels,'openingDate',o.opening_date,'closingDate',o.closing_date,'status',o.status,'reportingRequirements',o.reporting_requirements,'requiredDocuments',o.required_documents,'applicationCount',(select count(*) from public.admission_applications a where a.admission_opening_id=o.id)) order by o.created_at desc),'[]'::jsonb) from public.admission_openings o join public.academic_years y on y.id=o.academic_year_id where o.school_id=p_school_id),
  'applications',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'openingId',a.admission_opening_id,'openingTitle',o.title,'academicYearId',o.academic_year_id,'classLevel',a.intended_class_level,'reference',a.application_reference,'learner',a.learner_details,'guardian',a.guardian_details,'status',a.status,'submittedAt',a.submitted_at,'decisionReason',a.decision_reason,'interviewAt',a.interview_at,'convertedLearnerId',a.converted_learner_id,
    'possibleLearners',(select coalesce(jsonb_agg(jsonb_build_object('id',candidate.id,'fullName',concat_ws(' ',candidate.first_name,candidate.other_name,candidate.last_name),'admissionNumber',candidate.admission_number,'status',candidate.status,'dateOfBirth',candidate.date_of_birth)),'[]'::jsonb) from (select l.* from public.learners l where l.school_id=p_school_id and lower(trim(l.first_name))=lower(trim(a.learner_details->>'firstName')) and lower(trim(l.last_name))=lower(trim(a.learner_details->>'lastName')) and coalesce(nullif(trim(l.guardian_phone),''),'')=coalesce(nullif(trim(a.guardian_details->>'phone'),''),'') and (nullif(a.learner_details->>'dateOfBirth','') is null or l.date_of_birth is null or l.date_of_birth=(a.learner_details->>'dateOfBirth')::date) limit 5) candidate),
    'missingRequiredDocuments',(select coalesce(jsonb_agg(req->>'type'),'[]'::jsonb) from jsonb_array_elements(o.required_documents) req where coalesce((req->>'required')::boolean,false) and not exists(select 1 from public.admission_application_documents d where d.admission_application_id=a.id and d.document_type=req->>'type' and d.status='VERIFIED')),
    'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'fileName',d.file_name,'mimeType',d.mime_type,'fileSize',d.file_size,'path',d.storage_path,'status',d.status)),'[]'::jsonb) from public.admission_application_documents d where d.admission_application_id=a.id)) order by a.submitted_at desc nulls last,a.created_at desc),'[]'::jsonb) from public.admission_applications a join public.admission_openings o on o.id=a.admission_opening_id where a.school_id=p_school_id)
 );
end;
$$;

create or replace function public.set_school_admissions_officer(p_school_id uuid,p_user_id uuid,p_enabled boolean)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_membership public.school_memberships%rowtype;v_officer_role uuid;v_admin_role uuid;v_actor uuid;v_id uuid;v_previous_role text;v_restore_role uuid;
begin
 if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
 if p_user_id is null or p_enabled is null then raise exception 'ADMISSIONS_OFFICER_FIELDS_REQUIRED'; end if;
 select m.* into v_membership from public.school_memberships m join public.users u on u.id=m.user_id where m.school_id=p_school_id and m.user_id=p_user_id and m.status='ACTIVE' and u.is_active and u.account_status='ACTIVE' for update of m;
 if v_membership.user_id is null then raise exception 'ACTIVE_STAFF_MEMBERSHIP_REQUIRED'; end if;
 select id into v_officer_role from public.roles where code='ADMISSIONS_OFFICER';
 select id into v_admin_role from public.roles where code='SCHOOL_ADMIN';
 v_actor:=public.current_app_user_id();
 if p_enabled then
  if v_membership.role_id in (v_officer_role,v_admin_role) then raise exception 'MEMBERSHIP_ROLE_NOT_ASSIGNABLE'; end if;
  if exists(select 1 from public.school_admission_officer_role_history where school_id=p_school_id and user_id=p_user_id and restored_at is null) then raise exception 'ALREADY_ADMISSIONS_OFFICER'; end if;
  insert into public.school_admission_officer_role_history(school_id,user_id,previous_role_id,assigned_by) values(p_school_id,p_user_id,v_membership.role_id,v_actor) returning id into v_id;
  update public.school_memberships set role_id=v_officer_role,updated_at=now() where id=v_membership.id;
  select code into v_previous_role from public.roles where id=v_membership.role_id;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value) select v_actor,u.full_name,'SCHOOL_ADMIN','ADMISSIONS_OFFICER_ASSIGNED','school_membership',v_membership.id::text,jsonb_build_object('school_id',p_school_id,'target_user_id',p_user_id,'previous_role',v_previous_role,'role','ADMISSIONS_OFFICER') from public.users u where u.id=v_actor;
 else
  select hist.id,hist.previous_role_id into v_id,v_restore_role from public.school_admission_officer_role_history hist where hist.school_id=p_school_id and hist.user_id=p_user_id and hist.restored_at is null for update;
  if v_id is null then raise exception 'ADMISSIONS_OFFICER_ASSIGNMENT_NOT_FOUND'; end if;
  if not exists(select 1 from public.school_memberships where id=v_membership.id and role_id=v_officer_role) then raise exception 'MEMBERSHIP_ROLE_CHANGED_SINCE_ASSIGNMENT'; end if;
  update public.school_memberships set role_id=v_restore_role,updated_at=now() where id=v_membership.id;
  update public.school_admission_officer_role_history set restored_at=now(),restored_by=v_actor where id=v_id;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value) select v_actor,u.full_name,'SCHOOL_ADMIN','ADMISSIONS_OFFICER_RESTORED','school_membership',v_membership.id::text,jsonb_build_object('school_id',p_school_id,'target_user_id',p_user_id,'restored_role',v_restore_role) from public.users u where u.id=v_actor;
 end if;
 return p_user_id;
end;
$$;

create or replace function public.save_school_admission_opening(p_school_id uuid,p_opening_id uuid,p_academic_year_id uuid,p_title text,p_levels smallint[],p_opening_date date,p_closing_date date,p_reporting_requirements text,p_required_documents jsonb,p_status text)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid; v_actor uuid;
begin
 if not public.can_manage_admissions(p_school_id) then raise exception 'ADMISSIONS_PERMISSION_REQUIRED'; end if;
 if not exists(select 1 from public.academic_years where id=p_academic_year_id and school_id=p_school_id) then raise exception 'ACADEMIC_YEAR_NOT_OWNED'; end if;
 if nullif(trim(p_title),'') is null or p_opening_date is null or p_closing_date<p_opening_date or cardinality(p_levels)=0 or not(p_levels <@ array[1,2,3,4,5,6]::smallint[]) then raise exception 'ADMISSION_OPENING_FIELDS_INVALID'; end if;
 if p_status not in ('DRAFT','OPEN','CLOSED','ARCHIVED') or jsonb_typeof(p_required_documents)<>'array' then raise exception 'ADMISSION_OPENING_STATUS_OR_REQUIREMENTS_INVALID'; end if;
 v_actor:=public.current_app_user_id();
 if p_opening_id is null then insert into public.admission_openings(school_id,academic_year_id,title,target_class_levels,opening_date,closing_date,reporting_requirements,required_documents,status,created_by)
  values(p_school_id,p_academic_year_id,trim(p_title),p_levels,p_opening_date,p_closing_date,coalesce(p_reporting_requirements,''),p_required_documents,p_status,v_actor) returning id into v_id;
 else update public.admission_openings set academic_year_id=p_academic_year_id,title=trim(p_title),target_class_levels=p_levels,opening_date=p_opening_date,closing_date=p_closing_date,reporting_requirements=coalesce(p_reporting_requirements,''),required_documents=p_required_documents,status=p_status,updated_at=now()
  where id=p_opening_id and school_id=p_school_id returning id into v_id;
  if v_id is null then raise exception 'ADMISSION_OPENING_NOT_FOUND'; end if;
 end if;
 insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
 select u.id,u.full_name,r.code,'ADMISSION_OPENING_SAVED','admission_opening',v_id::text,jsonb_build_object('status',p_status,'target_class_levels',p_levels) from public.users u join public.school_memberships m on m.user_id=u.id join public.roles r on r.id=m.role_id where m.school_id=p_school_id and u.auth_user_id=auth.uid() and m.status='ACTIVE' limit 1;
 return v_id;
end;
$$;

create or replace function public.review_school_admission_application(p_school_id uuid,p_application_id uuid,p_status text,p_decision_reason text default null,p_interview_at timestamptz default null)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_app public.admission_applications%rowtype; v_actor uuid;
begin
 if not public.can_manage_admissions(p_school_id) then raise exception 'ADMISSIONS_PERMISSION_REQUIRED'; end if;
 if p_status not in ('UNDER_REVIEW','MORE_INFORMATION_REQUIRED','INTERVIEW_REQUIRED','ACCEPTED','WAITLISTED','REJECTED','WITHDRAWN','EXPIRED') then raise exception 'APPLICATION_STATUS_INVALID'; end if;
 select * into v_app from public.admission_applications where id=p_application_id and school_id=p_school_id for update;
 if v_app.id is null or v_app.status in ('DRAFT','CONVERTED_TO_LEARNER') then raise exception 'APPLICATION_NOT_REVIEWABLE'; end if;
 v_actor:=public.current_app_user_id();
 update public.admission_applications set status=p_status,decision_reason=nullif(trim(coalesce(p_decision_reason,'')),''),interview_at=case when p_status='INTERVIEW_REQUIRED' then p_interview_at else null end,reviewed_by=v_actor,updated_at=now() where id=v_app.id;
 insert into public.admission_applicant_notifications(admission_application_id,event_type,title,message) values(v_app.id,p_status,replace(p_status,'_',' '),coalesce(nullif(trim(p_decision_reason),''),case when p_status='MORE_INFORMATION_REQUIRED' then 'Please contact the school or sign in to your application to review the information requested.' else 'Your application status has been updated.' end));
 insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
 select p_school_id,u.auth_user_id,'ADMISSIONS','ADMISSION_STATUS_CHANGED','Admission application updated','Application '||v_app.application_reference||' is now '||p_status||'.','admission_application',v_app.id,'admission:status:'||v_app.id||':'||p_status||':'||floor(extract(epoch from clock_timestamp()))::text
 from public.users u where u.auth_user_id is not null and u.id in (select m.user_id from public.school_memberships m join public.roles r on r.id=m.role_id where m.school_id=p_school_id and m.status='ACTIVE' and r.code='SCHOOL_ADMIN');
 insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
 select u.id,u.full_name,r.code,'ADMISSION_APPLICATION_'||p_status,'admission_application',v_app.id::text,jsonb_build_object('decision_reason',p_decision_reason,'interview_at',p_interview_at) from public.users u join public.school_memberships m on m.user_id=u.id join public.roles r on r.id=m.role_id where m.school_id=p_school_id and u.auth_user_id=auth.uid() and m.status='ACTIVE' limit 1;
 return v_app.id;
end;
$$;

create or replace function public.verify_school_admission_document(p_school_id uuid,p_document_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid;
begin
 if not public.can_manage_admissions(p_school_id) then raise exception 'ADMISSIONS_PERMISSION_REQUIRED'; end if;
 if p_status not in ('VERIFIED','REJECTED') then raise exception 'ADMISSION_DOCUMENT_STATUS_INVALID'; end if;
 update public.admission_application_documents set status=p_status,verified_by=public.current_app_user_id(),verified_at=now() where id=p_document_id and school_id=p_school_id returning id into v_id;
 if v_id is null then raise exception 'ADMISSION_DOCUMENT_NOT_FOUND'; end if;
 return v_id;
end;
$$;

-- Atomic conversion: this is the only operation that creates a learner from an application.
create or replace function public.admit_school_applicant_as_learner(p_school_id uuid,p_application_id uuid,p_class_id uuid,p_stream_id uuid,p_admission_date date,p_religion_offering_ids uuid[] default '{}',p_elective_offering_ids uuid[] default '{}',p_a_level_combination_id uuid default null,p_existing_learner_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_app public.admission_applications%rowtype; v_class public.academic_classes%rowtype; v_combination public.a_level_combinations%rowtype; v_existing public.learners%rowtype; v_existing_enrolment public.learner_class_enrolments%rowtype; v_combo_subject_count integer; v_connected_subject_count integer; v_actor uuid; v_learner_id uuid; v_enrolment_id uuid; v_admission_number text; v_next integer; v_code text; v_first text; v_last text; v_dob date;
begin
 if not public.can_manage_admissions(p_school_id) then raise exception 'ADMISSIONS_PERMISSION_REQUIRED'; end if;
 select * into v_app from public.admission_applications where id=p_application_id and school_id=p_school_id for update;
 if v_app.id is null or v_app.status<>'ACCEPTED' then raise exception 'ACCEPTED_APPLICATION_REQUIRED'; end if;
 if v_app.converted_learner_id is not null then return v_app.converted_learner_id; end if;
 select * into v_class from public.academic_classes where id=p_class_id and school_id=p_school_id and academic_year_id=(select academic_year_id from public.admission_openings where id=v_app.admission_opening_id) and status='ACTIVE' and level=v_app.intended_class_level;
 if v_class.id is null then raise exception 'CLASS_NOT_AVAILABLE_FOR_APPLICATION'; end if;
 if p_stream_id is not null and not exists(select 1 from public.class_streams where id=p_stream_id and school_id=p_school_id and class_id=p_class_id and status='ACTIVE') then raise exception 'STREAM_NOT_AVAILABLE_FOR_CLASS'; end if;
 if exists(select 1 from public.class_streams where school_id=p_school_id and class_id=p_class_id and status='ACTIVE') and p_stream_id is null then raise exception 'STREAM_REQUIRED'; end if;
 if v_class.programme='A_LEVEL' then
  if p_a_level_combination_id is null then raise exception 'A_LEVEL_COMBINATION_REQUIRED'; end if;
  select * into v_combination from public.a_level_combinations where id=p_a_level_combination_id and school_id=p_school_id and academic_year_id=v_class.academic_year_id and status='ACTIVE' and level in (case when v_class.level=5 then 'S5' else 'S6' end,'BOTH');
  if v_combination.id is null then raise exception 'A_LEVEL_COMBINATION_NOT_AVAILABLE'; end if;
  select count(*) into v_combo_subject_count from public.a_level_combination_subjects where combination_id=v_combination.id;
  select count(distinct co.id) into v_connected_subject_count from public.a_level_combination_subjects acs join public.school_subject_offerings so on so.id=acs.school_subject_offering_id and so.school_id=p_school_id and so.status='ACTIVE' join public.class_subject_offerings co on co.school_subject_offering_id=so.id and co.school_id=p_school_id and co.class_id=p_class_id and co.academic_year_id=v_class.academic_year_id and co.status='ACTIVE' where acs.combination_id=v_combination.id and (co.stream_id is null or co.stream_id=p_stream_id);
  if v_combo_subject_count<>5 or v_connected_subject_count<>5 then raise exception 'A_LEVEL_CLASS_MUST_OFFER_ALL_FIVE_COMBINATION_SUBJECTS'; end if;
 elsif p_a_level_combination_id is not null then raise exception 'A_LEVEL_COMBINATION_NOT_ALLOWED_FOR_O_LEVEL';
 end if;
 if exists(select 1 from public.admission_openings o cross join lateral jsonb_array_elements(o.required_documents) req where o.id=v_app.admission_opening_id and coalesce((req->>'required')::boolean,false) and not exists(select 1 from public.admission_application_documents x where x.admission_application_id=v_app.id and x.document_type=req->>'type' and x.status='VERIFIED')) then raise exception 'REQUIRED_DOCUMENTS_NOT_VERIFIED'; end if;
 v_first:=trim(v_app.learner_details->>'firstName'); v_last:=trim(v_app.learner_details->>'lastName'); v_dob:=nullif(v_app.learner_details->>'dateOfBirth','')::date;
 v_actor:=public.current_app_user_id();
 if p_existing_learner_id is not null then
  select * into v_existing from public.learners where id=p_existing_learner_id and school_id=p_school_id for update;
  if v_existing.id is null or lower(trim(v_existing.first_name))<>lower(v_first) or lower(trim(v_existing.last_name))<>lower(v_last) or coalesce(nullif(trim(v_existing.guardian_phone),''),'')<>coalesce(nullif(trim(v_app.guardian_details->>'phone'),''),'') or (v_dob is not null and v_existing.date_of_birth is not null and v_existing.date_of_birth<>v_dob) then raise exception 'EXISTING_LEARNER_MATCH_NOT_CONFIRMED'; end if;
  select * into v_existing_enrolment from public.learner_class_enrolments where school_id=p_school_id and learner_id=v_existing.id and academic_year_id=v_class.academic_year_id and status='ACTIVE' and effective_to is null for update;
  if v_existing_enrolment.id is not null and (v_existing_enrolment.class_id<>p_class_id or v_existing_enrolment.stream_id is distinct from p_stream_id) then raise exception 'LEARNER_ALREADY_ENROLLED_IN_DIFFERENT_CLASS'; end if;
  v_learner_id:=v_existing.id;
  v_admission_number:=v_existing.admission_number;
  update public.learners set status='ACTIVE',updated_at=now(),updated_by=v_actor where id=v_learner_id and school_id=p_school_id;
 else
  if exists(select 1 from public.learners l where l.school_id=p_school_id and lower(trim(l.first_name))=lower(v_first) and lower(trim(l.last_name))=lower(v_last) and coalesce(nullif(trim(l.guardian_phone),''),'')=coalesce(nullif(trim(v_app.guardian_details->>'phone'),''),'') and (v_dob is null or l.date_of_birth=v_dob)) then raise exception 'LIKELY_DUPLICATE_LEARNER_FOUND'; end if;
  insert into public.school_admission_sequences(school_id,academic_year_id,next_number) values(p_school_id,v_class.academic_year_id,2)
  on conflict(school_id,academic_year_id) do update set next_number=public.school_admission_sequences.next_number+1 returning next_number-1 into v_next;
  select school_code into v_code from public.schools where id=p_school_id;
  v_admission_number:=upper(regexp_replace(coalesce(v_code,'SCHOOL'),'[^A-Za-z0-9]','','g'))||'/'||(select name from public.academic_years where id=v_class.academic_year_id)||'/'||lpad(v_next::text,4,'0');
  insert into public.learners(school_id,admission_number,first_name,other_name,last_name,gender,date_of_birth,guardian_name,guardian_phone,status,created_by,updated_by)
  values(p_school_id,v_admission_number,v_first,nullif(trim(v_app.learner_details->>'otherName'),''),v_last,nullif(v_app.learner_details->>'gender',''),v_dob,trim(v_app.guardian_details->>'fullName'),nullif(trim(v_app.guardian_details->>'phone'),''),'ACTIVE',v_actor,v_actor) returning id into v_learner_id;
 end if;
 if v_existing_enrolment.id is not null then v_enrolment_id:=v_existing_enrolment.id;
 else insert into public.learner_class_enrolments(school_id,learner_id,academic_year_id,class_id,stream_id,status,effective_from,created_by,updated_by)
  values(p_school_id,v_learner_id,v_class.academic_year_id,p_class_id,p_stream_id,'ACTIVE',coalesce(p_admission_date,current_date),v_actor,v_actor) returning id into v_enrolment_id;
 end if;
 if v_class.programme='A_LEVEL' then
  if exists(select 1 from public.a_level_learner_assignments where school_id=p_school_id and learner_id=v_learner_id and status='ACTIVE' and (combination_id<>v_combination.id or class_id<>p_class_id)) then raise exception 'LEARNER_ALREADY_ASSIGNED_TO_DIFFERENT_A_LEVEL_COMBINATION'; end if;
  insert into public.a_level_learner_assignments(school_id,learner_id,class_id,combination_id,status,starts_on,assigned_by) select p_school_id,v_learner_id,p_class_id,v_combination.id,'ACTIVE',coalesce(p_admission_date,current_date),auth.uid() where not exists(select 1 from public.a_level_learner_assignments where school_id=p_school_id and learner_id=v_learner_id and status='ACTIVE');
 end if;
 if not exists(select 1 from public.learner_guardians where school_id=p_school_id and learner_id=v_learner_id and coalesce(phone,'')=coalesce(nullif(trim(v_app.guardian_details->>'phone'),''),'')) then
  insert into public.learner_guardians(school_id,learner_id,full_name,relationship,phone,email,auth_user_id,is_primary)
  values(p_school_id,v_learner_id,trim(v_app.guardian_details->>'fullName'),coalesce(nullif(trim(v_app.guardian_details->>'relationship'),''),'Parent/Guardian'),nullif(trim(v_app.guardian_details->>'phone'),''),nullif(trim(v_app.guardian_details->>'email'),''),
   (select u.auth_user_id from public.users u join public.school_memberships m on m.user_id=u.id join public.roles r on r.id=m.role_id where m.school_id=p_school_id and m.status='ACTIVE' and u.is_active and r.code='PARENT_GUARDIAN' and lower(u.email)=lower(coalesce(v_app.guardian_details->>'email','')) limit 1),not exists(select 1 from public.learner_guardians where learner_id=v_learner_id and is_primary));
 end if;
 if v_class.programme='O_LEVEL' then
  insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type,selected_by)
  select p_school_id,v_learner_id,v_enrolment_id,co.id,'ACTIVE',coalesce(p_admission_date,current_date),case when rule.requirement='SNE_REPLACEMENT' then 'SNE_REPLACEMENT' else 'REQUIRED' end,v_actor
  from public.class_subject_offerings co
  join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.school_id=co.school_id and so.status='ACTIVE'
  join public.system_subjects ss on ss.id=so.system_subject_id
  join public.o_level_curriculum_subject_rules rule on rule.system_subject_id=so.system_subject_id and rule.rule_set_id=v_class.o_level_rule_set_id and rule.class_level=v_class.level and rule.is_active and rule.requirement in ('CORE','SNE_REPLACEMENT')
  where co.school_id=p_school_id and co.class_id=p_class_id and co.academic_year_id=v_class.academic_year_id and co.status='ACTIVE' and (co.stream_id is null or co.stream_id=p_stream_id)
    and ((rule.requirement='CORE' and not (ss.subject_code in ('535','553','545') and exists(select 1 from public.o_level_curriculum_exceptions ex where ex.learner_id=v_learner_id and ex.academic_year_id=v_class.academic_year_id and ex.exception_code='GENERAL_SCIENCE_REPLACEMENT' and ex.is_active)))
      or (rule.requirement='SNE_REPLACEMENT' and exists(select 1 from public.o_level_curriculum_exceptions ex where ex.learner_id=v_learner_id and ex.academic_year_id=v_class.academic_year_id and ex.exception_code='GENERAL_SCIENCE_REPLACEMENT' and ex.is_active)))
  on conflict(enrolment_id,class_subject_offering_id) where status='ACTIVE' do nothing;
  perform public.set_o_level_learner_subject_choices(v_enrolment_id,coalesce(p_religion_offering_ids,'{}'),coalesce(p_elective_offering_ids,'{}'),'Initial admission subject selection');
 else
  insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type,selected_by)
  select p_school_id,v_learner_id,v_enrolment_id,co.id,'ACTIVE',coalesce(p_admission_date,current_date),case when co.is_compulsory then 'COMPULSORY' else 'ELECTIVE' end,v_actor
  from public.class_subject_offerings co where co.school_id=p_school_id and co.class_id=p_class_id and co.academic_year_id=v_class.academic_year_id and co.status='ACTIVE' and co.is_compulsory;
 end if;
 update public.admission_applications set status='CONVERTED_TO_LEARNER',converted_learner_id=v_learner_id,reviewed_by=v_actor,updated_at=now() where id=v_app.id and converted_learner_id is null;
 update public.admission_application_documents set status='VERIFIED',verified_by=v_actor,verified_at=now(),linked_learner_id=v_learner_id where admission_application_id=v_app.id and status in ('UPLOADED','VERIFIED');
 insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
 select v_actor,u.full_name,r.code,'ADMISSION_CONVERTED_TO_LEARNER','learner',v_learner_id::text,jsonb_build_object('application_id',v_app.id,'application_reference',v_app.application_reference,'enrolment_id',v_enrolment_id,'class_id',p_class_id,'stream_id',p_stream_id,'admission_number',v_admission_number) from public.users u join public.school_memberships m on m.user_id=u.id join public.roles r on r.id=m.role_id where m.school_id=p_school_id and u.id=v_actor and m.status='ACTIVE' limit 1;
 insert into public.admission_applicant_notifications(admission_application_id,event_type,title,message) values(v_app.id,'CONVERTED_TO_LEARNER','Admission complete','Your application has been admitted. Contact the school for reporting details.');
 return v_learner_id;
end;
$$;

create or replace function public.get_school_id_card_register(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
 if not public.is_school_admin_for(p_school_id) and not public.is_active_platform_admin() then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
 return jsonb_build_object('learners',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'fullName',concat_ws(' ',l.first_name,l.other_name,l.last_name),'admissionNumber',l.admission_number,'photoPath',l.profile_photo_path,'card',(select jsonb_build_object('id',c.id,'reference',c.card_reference,'verificationToken',c.secure_verification_token,'status',c.status,'issueDate',c.issue_date,'expiryDate',c.expiry_date) from public.identity_cards c where c.learner_id=l.id order by c.created_at desc limit 1),'className',cl.class_name,'streamName',st.stream_name,'academicYear',y.name) order by l.last_name,l.first_name),'[]'::jsonb) from public.learners l left join lateral(select e.* from public.learner_class_enrolments e where e.learner_id=l.id and e.status='ACTIVE' and e.effective_to is null order by e.effective_from desc limit 1)e on true left join public.academic_classes cl on cl.id=e.class_id left join public.class_streams st on st.id=e.stream_id left join public.academic_years y on y.id=e.academic_year_id where l.school_id=p_school_id and l.status='ACTIVE'),
  'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'fullName',u.full_name,'staffNumber',u.staff_number,'department',u.department,'photoPath',u.profile_photo_path,'role',r.code,'card',(select jsonb_build_object('id',c.id,'reference',c.card_reference,'verificationToken',c.secure_verification_token,'status',c.status,'issueDate',c.issue_date,'expiryDate',c.expiry_date) from public.identity_cards c where c.staff_id=u.id order by c.created_at desc limit 1)) order by u.full_name),'[]'::jsonb) from public.users u join public.school_memberships m on m.user_id=u.id join public.roles r on r.id=m.role_id where m.school_id=p_school_id and m.status='ACTIVE' and u.is_active and r.code not in ('LEARNER','PARENT_GUARDIAN','PLATFORM_ADMIN')));
end;
$$;

-- Re-define the card register with explicit school scoping and one row per
-- staff identity, even when a person holds multiple memberships in a tenant.
create or replace function public.get_school_id_card_register(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
 if not public.is_school_admin_for(p_school_id) and not public.is_active_platform_admin() then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
 return jsonb_build_object(
  'learners',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',l.id,'fullName',concat_ws(' ',l.first_name,l.other_name,l.last_name),'admissionNumber',l.admission_number,'photoPath',l.profile_photo_path,
   'card',(select jsonb_build_object('id',c.id,'reference',c.card_reference,'verificationToken',c.secure_verification_token,'status',c.status,'issueDate',c.issue_date,'expiryDate',c.expiry_date)
      from public.identity_cards c where c.learner_id=l.id and c.school_id=p_school_id order by c.created_at desc limit 1),
   'cardHistory',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'reference',c.card_reference,'status',c.status,'issueDate',c.issue_date,'expiryDate',c.expiry_date) order by c.created_at desc),'[]'::jsonb) from public.identity_cards c where c.learner_id=l.id and c.school_id=p_school_id),
   'className',cl.class_name,'streamName',st.stream_name,'academicYear',y.name) order by l.last_name,l.first_name),'[]'::jsonb)
   from public.learners l left join lateral(select e.* from public.learner_class_enrolments e where e.learner_id=l.id and e.school_id=p_school_id and e.status='ACTIVE' and e.effective_to is null order by e.effective_from desc limit 1)e on true
   left join public.academic_classes cl on cl.id=e.class_id and cl.school_id=p_school_id left join public.class_streams st on st.id=e.stream_id and st.school_id=p_school_id left join public.academic_years y on y.id=e.academic_year_id and y.school_id=p_school_id where l.school_id=p_school_id and l.status='ACTIVE'),
  'staff',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',u.id,'fullName',u.full_name,'staffNumber',u.staff_number,'department',u.department,'photoPath',u.profile_photo_path,'role',membership_role.code,
   'card',(select jsonb_build_object('id',c.id,'reference',c.card_reference,'verificationToken',c.secure_verification_token,'status',c.status,'issueDate',c.issue_date,'expiryDate',c.expiry_date) from public.identity_cards c where c.staff_id=u.id and c.school_id=p_school_id order by c.created_at desc limit 1),
   'cardHistory',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'reference',c.card_reference,'status',c.status,'issueDate',c.issue_date,'expiryDate',c.expiry_date) order by c.created_at desc),'[]'::jsonb) from public.identity_cards c where c.staff_id=u.id and c.school_id=p_school_id)) order by u.full_name),'[]'::jsonb)
   from public.users u join lateral(select r.code from public.school_memberships m join public.roles r on r.id=m.role_id where m.user_id=u.id and m.school_id=p_school_id and m.status='ACTIVE' and r.code not in ('LEARNER','PARENT_GUARDIAN','PLATFORM_ADMIN') order by (r.code='TEACHER') desc limit 1) membership_role on true
   where u.is_active and u.account_status='ACTIVE'));
end;
$$;

create or replace function public.issue_school_identity_cards(p_school_id uuid,p_person_type text,p_person_ids uuid[],p_expiry_date date default null)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid; v_person uuid; v_actor uuid; v_ref text; v_token text; v_result jsonb:='[]'::jsonb; v_photo text;
begin
 if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
 if p_person_type not in ('LEARNER','STAFF') or cardinality(coalesce(p_person_ids,'{}'))=0 then raise exception 'ID_CARD_PERSON_LIST_INVALID'; end if;
 v_actor:=public.current_app_user_id();
 foreach v_person in array p_person_ids loop
  if p_person_type='LEARNER' then
   if not exists(select 1 from public.learners where id=v_person and school_id=p_school_id and status='ACTIVE') then raise exception 'LEARNER_NOT_AVAILABLE'; end if;
   select profile_photo_path into v_photo from public.learners where id=v_person;
   update public.identity_cards set status='REPLACED',updated_at=now() where learner_id=v_person and status='ACTIVE';
   v_ref:=upper(encode(gen_random_bytes(12),'hex'));v_token:=encode(gen_random_bytes(24),'hex');
   insert into public.identity_cards(school_id,person_type,learner_id,card_reference,secure_verification_token,expiry_date,issued_by) values(p_school_id,p_person_type,v_person,v_ref,v_token,p_expiry_date,v_actor) returning id into v_id;
  else
   if not exists(select 1 from public.users u join public.school_memberships m on m.user_id=u.id where u.id=v_person and m.school_id=p_school_id and m.status='ACTIVE' and u.is_active and u.account_status='ACTIVE') then raise exception 'STAFF_NOT_AVAILABLE'; end if;
   select profile_photo_path into v_photo from public.users where id=v_person;
   update public.identity_cards set status='REPLACED',updated_at=now() where staff_id=v_person and status='ACTIVE';
   v_ref:=upper(encode(gen_random_bytes(12),'hex'));v_token:=encode(gen_random_bytes(24),'hex');
   insert into public.identity_cards(school_id,person_type,staff_id,card_reference,secure_verification_token,expiry_date,issued_by) values(p_school_id,p_person_type,v_person,v_ref,v_token,p_expiry_date,v_actor) returning id into v_id;
  end if;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_id,'personId',v_person,'cardReference',v_ref,'verificationToken',v_token,'status','ACTIVE','photoPath',v_photo,'issueDate',current_date,'expiryDate',p_expiry_date));
 end loop;
 insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
 select v_actor,u.full_name,r.code,'IDENTITY_CARDS_ISSUED','identity_card_batch',gen_random_uuid()::text,jsonb_build_object('person_type',p_person_type,'person_ids',p_person_ids,'count',cardinality(p_person_ids)) from public.users u join public.school_memberships m on m.user_id=u.id join public.roles r on r.id=m.role_id where u.id=v_actor and m.school_id=p_school_id and m.status='ACTIVE' limit 1;
 insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
 select p_school_id,u.auth_user_id,'ACADEMIC','IDENTITY_CARD_ISSUED','Identity card issued',cardinality(p_person_ids)||' identity card(s) were issued.','identity_card',(v_result->0->>'id')::uuid,'idcard:issued:'||(v_result->0->>'id')||':'||u.auth_user_id from public.users u where u.id=v_actor and u.auth_user_id is not null on conflict(idempotency_key) do nothing;
 insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
 select p_school_id,recipient.auth_user_id,'ACADEMIC','IDENTITY_CARD_ISSUED','Identity card issued','Your school identity card is ready.','identity_card',issued.id,'idcard:issued:person:'||issued.id||':'||recipient.auth_user_id
 from jsonb_array_elements(v_result) issued_json join public.identity_cards issued on issued.id=(issued_json->>'id')::uuid join public.users recipient on recipient.auth_user_id is not null and ((issued.person_type='STAFF' and recipient.id=issued.staff_id) or (issued.person_type='LEARNER' and exists(select 1 from public.learner_guardians g where g.school_id=p_school_id and g.learner_id=issued.learner_id and g.auth_user_id=recipient.auth_user_id))) on conflict(idempotency_key) do nothing;
 return v_result;
end;
$$;

create or replace function public.issue_school_identity_cards(p_school_id uuid,p_person_type text,p_person_ids uuid[],p_expiry_date date default null)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid; v_person uuid; v_actor uuid; v_ref text; v_token text; v_result jsonb:='[]'::jsonb; v_photo text; v_previous uuid;
begin
 if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
 if p_person_type not in ('LEARNER','STAFF') or cardinality(coalesce(p_person_ids,'{}'))=0 then raise exception 'ID_CARD_PERSON_LIST_INVALID'; end if;
 if p_expiry_date is not null and p_expiry_date<current_date then raise exception 'ID_CARD_EXPIRY_INVALID'; end if;
 v_actor:=public.current_app_user_id();
 foreach v_person in array p_person_ids loop
  if p_person_type='LEARNER' then
   if not exists(select 1 from public.learners where id=v_person and school_id=p_school_id and status='ACTIVE') then raise exception 'LEARNER_NOT_AVAILABLE'; end if;
   select profile_photo_path into v_photo from public.learners where id=v_person and school_id=p_school_id;
   select id into v_previous from public.identity_cards where school_id=p_school_id and learner_id=v_person and status='ACTIVE' for update;
   if v_previous is not null then update public.identity_cards set status='REPLACED',updated_at=now() where id=v_previous; end if;
   v_ref:=upper(encode(gen_random_bytes(12),'hex'));v_token:=encode(gen_random_bytes(24),'hex');
   insert into public.identity_cards(school_id,person_type,learner_id,card_reference,secure_verification_token,expiry_date,issued_by,replaced_card_id) values(p_school_id,p_person_type,v_person,v_ref,v_token,p_expiry_date,v_actor,v_previous) returning id into v_id;
  else
   if not exists(select 1 from public.users u join public.school_memberships m on m.user_id=u.id where u.id=v_person and m.school_id=p_school_id and m.status='ACTIVE' and u.is_active and u.account_status='ACTIVE' and (select r.code from public.roles r where r.id=m.role_id) not in ('LEARNER','PARENT_GUARDIAN','PLATFORM_ADMIN')) then raise exception 'STAFF_NOT_AVAILABLE'; end if;
   select profile_photo_path into v_photo from public.users where id=v_person;
   select id into v_previous from public.identity_cards where school_id=p_school_id and staff_id=v_person and status='ACTIVE' for update;
   if v_previous is not null then update public.identity_cards set status='REPLACED',updated_at=now() where id=v_previous; end if;
   v_ref:=upper(encode(gen_random_bytes(12),'hex'));v_token:=encode(gen_random_bytes(24),'hex');
   insert into public.identity_cards(school_id,person_type,staff_id,card_reference,secure_verification_token,expiry_date,issued_by,replaced_card_id) values(p_school_id,p_person_type,v_person,v_ref,v_token,p_expiry_date,v_actor,v_previous) returning id into v_id;
  end if;
  v_previous:=null;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_id,'personId',v_person,'cardReference',v_ref,'verificationToken',v_token,'status','ACTIVE','photoPath',v_photo,'issueDate',current_date,'expiryDate',p_expiry_date));
 end loop;
 insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
 select v_actor,u.full_name,r.code,'IDENTITY_CARDS_ISSUED','identity_card_batch',gen_random_uuid()::text,jsonb_build_object('person_type',p_person_type,'person_ids',p_person_ids,'count',cardinality(p_person_ids)) from public.users u join public.school_memberships m on m.user_id=u.id join public.roles r on r.id=m.role_id where u.id=v_actor and m.school_id=p_school_id and m.status='ACTIVE' limit 1;
 insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
 select p_school_id,u.auth_user_id,'ACADEMIC','IDENTITY_CARD_ISSUED','Identity card issued',cardinality(p_person_ids)||' identity card(s) were issued.','identity_card',(v_result->0->>'id')::uuid,'idcard:issued:'||(v_result->0->>'id')||':'||u.auth_user_id from public.users u where u.id=v_actor and u.auth_user_id is not null on conflict(idempotency_key) do nothing;
 insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
 select p_school_id,recipient.auth_user_id,'ACADEMIC','IDENTITY_CARD_ISSUED','Identity card issued','Your school identity card is ready.','identity_card',issued.id,'idcard:issued:person:'||issued.id||':'||recipient.auth_user_id
 from jsonb_array_elements(v_result) issued_json join public.identity_cards issued on issued.id=(issued_json->>'id')::uuid join public.users recipient on recipient.auth_user_id is not null and ((issued.person_type='STAFF' and recipient.id=issued.staff_id) or (issued.person_type='LEARNER' and exists(select 1 from public.learner_guardians g where g.school_id=p_school_id and g.learner_id=issued.learner_id and g.auth_user_id=recipient.auth_user_id))) on conflict(idempotency_key) do nothing;
 return v_result;
end;
$$;

create or replace function public.set_school_identity_card_status(p_school_id uuid,p_card_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid;v_card public.identity_cards%rowtype;
begin
 if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
 if p_status not in ('EXPIRED','REVOKED') then raise exception 'ID_CARD_STATUS_INVALID'; end if;
 update public.identity_cards set status=p_status,updated_at=now() where id=p_card_id and school_id=p_school_id and status='ACTIVE' returning * into v_card;
 v_id:=v_card.id;
 if v_id is null then raise exception 'ACTIVE_ID_CARD_NOT_FOUND'; end if;
 insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
 select u.id,u.full_name,r.code,'IDENTITY_CARD_'||p_status,'identity_card',v_id::text,jsonb_build_object('status',p_status) from public.users u join public.school_memberships m on m.user_id=u.id join public.roles r on r.id=m.role_id where m.school_id=p_school_id and u.auth_user_id=auth.uid() and m.status='ACTIVE' limit 1;
 insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
 select p_school_id,recipient.auth_user_id,'ACADEMIC','IDENTITY_CARD_'||p_status,'Identity card '||lower(p_status),'An identity card was '||lower(p_status)||'.','identity_card',v_id,'idcard:'||lower(p_status)||':'||v_id||':'||recipient.auth_user_id
 from public.users recipient where recipient.auth_user_id is not null and ((v_card.person_type='STAFF' and recipient.id=v_card.staff_id) or (v_card.person_type='LEARNER' and exists(select 1 from public.learner_guardians g where g.learner_id=v_card.learner_id and g.school_id=p_school_id and g.auth_user_id=recipient.auth_user_id))) on conflict(idempotency_key) do nothing;
 return v_id;
end;
$$;

create or replace function public.verify_school_identity_card(p_verification_token text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('valid',c.status='ACTIVE' and (c.expiry_date is null or c.expiry_date>=current_date),'cardStatus',case when c.status='ACTIVE' and c.expiry_date<current_date then 'EXPIRED' else c.status end,'personType',c.person_type,'schoolName',s.official_name,'fullName',case when c.person_type='LEARNER' then concat_ws(' ',l.first_name,l.other_name,l.last_name) else u.full_name end,'admissionOrStaffNumber',case when c.person_type='LEARNER' then l.admission_number else u.staff_number end,'className',cl.class_name,'streamName',st.stream_name,'roleOrDepartment',case when c.person_type='STAFF' then coalesce(u.department,r.code) else null end,'issueDate',c.issue_date,'expiryDate',c.expiry_date)
 from public.identity_cards c join public.schools s on s.id=c.school_id left join public.learners l on l.id=c.learner_id left join public.users u on u.id=c.staff_id left join lateral(select e.* from public.learner_class_enrolments e where e.learner_id=l.id and e.status='ACTIVE' and e.effective_to is null order by e.effective_from desc limit 1)e on true left join public.academic_classes cl on cl.id=e.class_id left join public.class_streams st on st.id=e.stream_id left join lateral(select r.code from public.school_memberships m join public.roles r on r.id=m.role_id where m.user_id=u.id and m.school_id=c.school_id and m.status='ACTIVE' order by (r.code='TEACHER') desc limit 1)r on true
 where c.secure_verification_token=p_verification_token limit 1;
$$;

create or replace function public.get_school_document_library(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
 if not public.is_active_school_member(p_school_id) and not public.is_active_platform_admin() then raise exception 'ACTIVE_SCHOOL_MEMBERSHIP_REQUIRED'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'schoolId',d.school_id,'category',d.category,'title',d.title,'description',d.description,'linkedEntityType',d.linked_entity_type,'linkedEntityId',d.linked_entity_id,'visibilityLevel',d.visibility_level,'storagePath',d.storage_path,'fileName',d.file_name,'mimeType',d.mime_type,'fileSize',d.file_size,'versionNumber',d.version_number,'status',d.status,'uploadedAt',d.uploaded_at,'uploadedBy',u.full_name) order by d.uploaded_at desc) from public.document_library_items d join public.users u on u.id=d.uploaded_by where d.school_id=p_school_id and d.status='ACTIVE' and public.can_view_school_document(d.id,p_school_id)),'[]'::jsonb);
end;
$$;

create or replace function public.save_school_document_library_item(p_school_id uuid,p_document_id uuid,p_category text,p_title text,p_description text,p_linked_entity_type text,p_linked_entity_id uuid,p_visibility text,p_storage_path text,p_file_name text,p_mime_type text,p_file_size bigint)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid;v_actor uuid;v_old public.document_library_items%rowtype;
begin
 if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
 if nullif(trim(p_title),'') is null or p_file_size not between 1 and 52428800 or p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document') then raise exception 'DOCUMENT_FIELDS_INVALID'; end if;
 if p_storage_path !~ ('^schools/'||p_school_id::text||'/documents/(school/[0-9a-f-]{36}|learners/[0-9a-f-]{36}/documents/[0-9a-f-]{36}|staff/[0-9a-f-]{36}/documents/[0-9a-f-]{36}|academic-resources/[0-9a-f-]{36})$') then raise exception 'DOCUMENT_PATH_INVALID'; end if;
 if p_linked_entity_type not in ('LEARNER','STAFF') and p_linked_entity_type is not null then raise exception 'DOCUMENT_LINK_TYPE_INVALID'; end if;
 if p_linked_entity_type='LEARNER' and not exists(select 1 from public.learners where id=p_linked_entity_id and school_id=p_school_id) then raise exception 'DOCUMENT_LEARNER_NOT_OWNED'; end if;
 if p_linked_entity_type='STAFF' and not exists(select 1 from public.school_memberships where user_id=p_linked_entity_id and school_id=p_school_id and status='ACTIVE') then raise exception 'DOCUMENT_STAFF_NOT_OWNED'; end if;
 v_actor:=public.current_app_user_id();
 if p_document_id is null then insert into public.document_library_items(school_id,category,title,description,linked_entity_type,linked_entity_id,visibility_level,storage_path,file_name,mime_type,file_size,uploaded_by)
 values(p_school_id,p_category,trim(p_title),nullif(trim(p_description),''),p_linked_entity_type,p_linked_entity_id,p_visibility,p_storage_path,p_file_name,p_mime_type,p_file_size,v_actor) returning id into v_id;
 else select * into v_old from public.document_library_items where id=p_document_id and school_id=p_school_id and status='ACTIVE' for update;
 if v_old.id is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;
 update public.document_library_items set status='ARCHIVED',updated_at=now() where id=v_old.id;
 insert into public.document_library_items(school_id,document_group_id,category,title,description,linked_entity_type,linked_entity_id,visibility_level,storage_path,file_name,mime_type,file_size,version_number,uploaded_by)
 values(p_school_id,v_old.document_group_id,p_category,trim(p_title),nullif(trim(p_description),''),p_linked_entity_type,p_linked_entity_id,p_visibility,p_storage_path,p_file_name,p_mime_type,p_file_size,v_old.version_number+1,v_actor) returning id into v_id;
 end if;
 insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
 select u.id,u.full_name,r.code,'SCHOOL_DOCUMENT_UPLOADED','document_library_item',v_id::text,jsonb_build_object('category',p_category,'visibility',p_visibility,'version',case when p_document_id is null then 1 else v_old.version_number+1 end) from public.users u join public.school_memberships m on m.user_id=u.id join public.roles r on r.id=m.role_id where m.school_id=p_school_id and u.auth_user_id=auth.uid() and m.status='ACTIVE' limit 1;
 insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
 select p_school_id,recipient.auth_user_id,'ACADEMIC','SCHOOL_DOCUMENT_SHARED','A document was shared with you',trim(p_title),'document_library_item',v_id,'document:shared:'||v_id||':'||recipient.auth_user_id
 from public.users recipient where recipient.auth_user_id is not null and (
   (p_visibility='AUTHORIZED_STAFF' and p_linked_entity_type='STAFF' and recipient.id=p_linked_entity_id) or
   (p_visibility in ('PARENTS','LEARNERS') and p_linked_entity_type='LEARNER' and exists(select 1 from public.learner_guardians g where g.school_id=p_school_id and g.learner_id=p_linked_entity_id and g.auth_user_id=recipient.auth_user_id)) or
   (p_visibility='TEACHERS' and exists(select 1 from public.school_memberships m join public.roles r on r.id=m.role_id where m.school_id=p_school_id and m.user_id=recipient.id and m.status='ACTIVE' and r.code='TEACHER'))
 ) on conflict(idempotency_key) do nothing;
 return v_id;
end;
$$;

create or replace function public.archive_school_document_library_item(p_school_id uuid,p_document_id uuid)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid;
begin if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if; update public.document_library_items set status='ARCHIVED',updated_at=now() where id=p_document_id and school_id=p_school_id returning id into v_id; if v_id is null then raise exception 'DOCUMENT_NOT_FOUND'; end if; return v_id; end;
$$;

revoke all on function public.can_manage_admissions(uuid),public.can_view_school_document(uuid,uuid) from public,anon;
revoke all on function public.set_school_admissions_officer(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.get_public_admission_openings(text),public.start_public_admission_application(uuid,smallint,jsonb,jsonb),public.save_public_admission_draft(text,text,smallint,jsonb,jsonb),public.record_public_admission_document(text,text,text,text,text,text,bigint),public.submit_public_admission_application(text,text),public.get_public_admission_application_status(text,text),public.withdraw_public_admission_application(text,text),public.get_school_admissions_workspace(uuid),public.save_school_admission_opening(uuid,uuid,uuid,text,smallint[],date,date,text,jsonb,text),public.review_school_admission_application(uuid,uuid,text,text,timestamptz),public.verify_school_admission_document(uuid,uuid,text),public.admit_school_applicant_as_learner(uuid,uuid,uuid,uuid,date,uuid[],uuid[],uuid,uuid),public.get_school_id_card_register(uuid),public.issue_school_identity_cards(uuid,text,uuid[],date),public.set_school_identity_card_status(uuid,uuid,text),public.verify_school_identity_card(text),public.get_school_document_library(uuid),public.save_school_document_library_item(uuid,uuid,text,text,text,text,uuid,text,text,text,text,bigint),public.archive_school_document_library_item(uuid,uuid) from public,anon;
grant execute on function public.get_public_admission_openings(text),public.start_public_admission_application(uuid,smallint,jsonb,jsonb),public.save_public_admission_draft(text,text,smallint,jsonb,jsonb),public.record_public_admission_document(text,text,text,text,text,text,bigint),public.submit_public_admission_application(text,text),public.get_public_admission_application_status(text,text),public.withdraw_public_admission_application(text,text),public.verify_school_identity_card(text) to anon,authenticated;
grant execute on function public.can_manage_admissions(uuid),public.can_view_school_document(uuid,uuid),public.get_school_admissions_workspace(uuid),public.save_school_admission_opening(uuid,uuid,uuid,text,smallint[],date,date,text,jsonb,text),public.review_school_admission_application(uuid,uuid,text,text,timestamptz),public.verify_school_admission_document(uuid,uuid,text),public.admit_school_applicant_as_learner(uuid,uuid,uuid,uuid,date,uuid[],uuid[],uuid,uuid),public.get_school_id_card_register(uuid),public.issue_school_identity_cards(uuid,text,uuid[],date),public.set_school_identity_card_status(uuid,uuid,text),public.get_school_document_library(uuid),public.save_school_document_library_item(uuid,uuid,text,text,text,text,uuid,text,text,text,text,bigint),public.archive_school_document_library_item(uuid,uuid) to authenticated;
grant execute on function public.set_school_admissions_officer(uuid,uuid,boolean) to authenticated;

comment on table public.admission_applications is 'Applicant intake only. Creating an application never creates a learner or enrolment.';
comment on table public.identity_cards is 'School-scoped issued identity cards; replaced/revoked records are retained as history.';
comment on table public.document_library_items is 'Private school documents with role-aware metadata and Storage access.';
commit;
