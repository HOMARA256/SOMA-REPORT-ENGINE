-- OURSCHOOL Stage 16
-- Duplicate-safe secondary catalogue completion and assessment-specific paper selection.
-- No official codes or paper metadata are invented by this migration.

create table if not exists public.subject_catalogue_audit_findings (
  id uuid primary key default gen_random_uuid(),
  programme public.subject_programme not null,
  requested_name varchar(180) not null,
  normalized_name varchar(180) not null,
  finding varchar(30) not null check (finding in ('EXACT_MATCH','ALIAS_MATCH','MISSING_ADDED','REVIEW_REQUIRED','DUPLICATE')),
  matched_subject_id uuid references public.system_subjects(id) on delete restrict,
  detail text not null,
  audited_at timestamptz not null default now(),
  unique (programme, requested_name, finding, matched_subject_id)
);
create or replace function public.normalized_subject_name(value text) returns text
language sql immutable strict as $$
  select regexp_replace(lower(trim(value)), '[^a-z0-9]+', '', 'g')
$$;
create temporary table desired_secondary_subjects (
  programme public.subject_programme not null,
  subject_name varchar(180) not null,
  short_name varchar(100) not null,
  department varchar(120) not null,
  subject_level public.subject_level not null,
  aliases text[] not null default '{}'
) on commit drop;
insert into desired_secondary_subjects values
-- Lower Secondary. Existing canonical spellings are retained where they already carry relationships.
('O_LEVEL','English Language','English','Languages','ORDINARY',array['English']),
('O_LEVEL','Mathematics','Mathematics','Mathematics','ORDINARY','{}'),
('O_LEVEL','History & Political Education','History','Humanities','ORDINARY',array['History and Political Education']),
('O_LEVEL','Geography','Geography','Humanities','ORDINARY','{}'),
('O_LEVEL','Physics','Physics','Sciences','ORDINARY','{}'),
('O_LEVEL','Biology','Biology','Sciences','ORDINARY','{}'),
('O_LEVEL','Chemistry','Chemistry','Sciences','ORDINARY','{}'),
('O_LEVEL','General Science','General Science','Sciences','ORDINARY','{}'),
('O_LEVEL','Physical Education','Physical Education','Physical Education','ORDINARY','{}'),
('O_LEVEL','Christian Religious Education','CRE','Humanities','ORDINARY',array['CRE']),
('O_LEVEL','Islamic Religious Education','IRE','Humanities','ORDINARY',array['IRE']),
('O_LEVEL','Entrepreneurship Education','Entrepreneurship','Vocational','ORDINARY',array['Entrepreneurship']),
('O_LEVEL','Kiswahili','Kiswahili','Languages','ORDINARY','{}'),
('O_LEVEL','Agriculture','Agriculture','Vocational','ORDINARY','{}'),
('O_LEVEL','Information and Communication Technology','ICT','Technology','ORDINARY',array['ICT']),
('O_LEVEL','French','French','Languages','ORDINARY','{}'),
('O_LEVEL','German','German','Languages','ORDINARY','{}'),
('O_LEVEL','Latin','Latin','Languages','ORDINARY','{}'),
('O_LEVEL','Arabic','Arabic','Languages','ORDINARY','{}'),
('O_LEVEL','Chinese','Chinese','Languages','ORDINARY','{}'),
('O_LEVEL','Literature in English','Literature','Languages','ORDINARY',array['Literature']),
('O_LEVEL','Art and Design','Art and Design','Creative Arts','ORDINARY','{}'),
('O_LEVEL','Performing Arts','Performing Arts','Creative Arts','ORDINARY','{}'),
('O_LEVEL','Technology and Design','Technology and Design','Technology','ORDINARY','{}'),
('O_LEVEL','Nutrition and Food Technology','Nutrition and Food Technology','Vocational','ORDINARY','{}'),
('O_LEVEL','Ateso','Ateso','Languages','ORDINARY','{}'),
('O_LEVEL','Dhopadhola','Dhopadhola','Languages','ORDINARY','{}'),
('O_LEVEL','Leb Acoli','Leb Acoli','Languages','ORDINARY','{}'),
('O_LEVEL','Leblango','Leblango','Languages','ORDINARY','{}'),
('O_LEVEL','Luganda','Luganda','Languages','ORDINARY','{}'),
('O_LEVEL','Lugbarati','Lugbarati','Languages','ORDINARY','{}'),
('O_LEVEL','Lumasaaba','Lumasaaba','Languages','ORDINARY','{}'),
('O_LEVEL','Lusoga','Lusoga','Languages','ORDINARY','{}'),
('O_LEVEL','Runyoro-Rutooro','Runyoro-Rutooro','Languages','ORDINARY','{}'),
('O_LEVEL','Runyankore-Rukiga','Runyankore-Rukiga','Languages','ORDINARY','{}'),
-- Advanced Secondary.
('A_LEVEL','Agriculture','Agriculture','Vocational','PRINCIPAL','{}'),
('A_LEVEL','Arabic','Arabic','Languages','PRINCIPAL','{}'),
('A_LEVEL','Art and Design','Art and Design','Creative Arts','PRINCIPAL','{}'),
('A_LEVEL','Biology','Biology','Sciences','PRINCIPAL','{}'),
('A_LEVEL','Chemistry','Chemistry','Sciences','PRINCIPAL','{}'),
('A_LEVEL','Chinese','Chinese','Languages','PRINCIPAL','{}'),
('A_LEVEL','Christian Religious Education','CRE','Humanities','PRINCIPAL',array['CRE']),
('A_LEVEL','Clothing and Textile','Clothing and Textile','Vocational','PRINCIPAL','{}'),
('A_LEVEL','Economics','Economics','Humanities','PRINCIPAL','{}'),
('A_LEVEL','Entrepreneurship Education','Entrepreneurship','Vocational','PRINCIPAL','{}'),
('A_LEVEL','Foods and Nutrition','Foods and Nutrition','Vocational','PRINCIPAL','{}'),
('A_LEVEL','French','French','Languages','PRINCIPAL','{}'),
('A_LEVEL','General Paper','General Paper','General','GENERAL_PAPER',array['GP']),
('A_LEVEL','Geography','Geography','Humanities','PRINCIPAL','{}'),
('A_LEVEL','German','German','Languages','PRINCIPAL','{}'),
('A_LEVEL','History','History','Humanities','PRINCIPAL','{}'),
('A_LEVEL','Islamic Religious Education','IRE','Humanities','PRINCIPAL',array['IRE']),
('A_LEVEL','Kiswahili','Kiswahili','Languages','PRINCIPAL','{}'),
('A_LEVEL','Latin','Latin','Languages','PRINCIPAL','{}'),
('A_LEVEL','Literature in English','Literature','Languages','PRINCIPAL',array['Literature']),
('A_LEVEL','Mathematics','Mathematics','Mathematics','PRINCIPAL',array['Principal Mathematics']),
('A_LEVEL','Metal Work','Metal Work','Technology','PRINCIPAL','{}'),
('A_LEVEL','Music','Music','Creative Arts','PRINCIPAL','{}'),
('A_LEVEL','Physics','Physics','Sciences','PRINCIPAL','{}'),
('A_LEVEL','Subsidiary ICT','Subsidiary ICT','Technology','SUBSIDIARY','{}'),
('A_LEVEL','Subsidiary Mathematics','Subsidiary Mathematics','Mathematics','SUBSIDIARY','{}'),
('A_LEVEL','Technical Drawing','Technical Drawing','Technology','PRINCIPAL','{}'),
('A_LEVEL','Wood Work','Wood Work','Technology','PRINCIPAL','{}'),
('A_LEVEL','Ateso','Ateso','Languages','PRINCIPAL','{}'),
('A_LEVEL','Dhopadhola','Dhopadhola','Languages','PRINCIPAL','{}'),
('A_LEVEL','Leb Acoli','Leb Acoli','Languages','PRINCIPAL','{}'),
('A_LEVEL','Leblango','Leblango','Languages','PRINCIPAL','{}'),
('A_LEVEL','Luganda','Luganda','Languages','PRINCIPAL','{}'),
('A_LEVEL','Lugbarati','Lugbarati','Languages','PRINCIPAL','{}'),
('A_LEVEL','Lumasaaba','Lumasaaba','Languages','PRINCIPAL','{}'),
('A_LEVEL','Lusoga','Lusoga','Languages','PRINCIPAL','{}'),
('A_LEVEL','Runyoro-Rutooro','Runyoro-Rutooro','Languages','PRINCIPAL','{}'),
('A_LEVEL','Runyankore-Rukiga','Runyankore-Rukiga','Languages','PRINCIPAL','{}'),
('A_LEVEL','Physical Education','Physical Education','Physical Education','PRINCIPAL','{}'),
('A_LEVEL','Principal ICT','Principal ICT','Technology','PRINCIPAL','{}');
-- Flag normalized duplicates already present; never merge or delete them automatically.
insert into public.subject_catalogue_audit_findings(programme,requested_name,normalized_name,finding,matched_subject_id,detail)
select s.programme,s.subject_name,public.normalized_subject_name(s.subject_name),'DUPLICATE',s.id,'Multiple existing records share the same normalized programme/name; manual review required.'
from public.system_subjects s join (
  select programme,public.normalized_subject_name(subject_name) normalized_name from public.system_subjects
  group by programme,public.normalized_subject_name(subject_name) having count(*) > 1
) d on d.programme=s.programme and d.normalized_name=public.normalized_subject_name(s.subject_name)
on conflict do nothing;
-- Preserve the ambiguous legacy record and require a human decision.
insert into public.subject_catalogue_audit_findings(programme,requested_name,normalized_name,finding,matched_subject_id,detail)
select programme,subject_name,public.normalized_subject_name(subject_name),'REVIEW_REQUIRED',id,'Legacy Religious Education is ambiguous and is not merged into CRE or IRE.'
from public.system_subjects where programme='O_LEVEL' and public.normalized_subject_name(subject_name)='religiouseducation'
on conflict do nothing;
-- Insert only names/aliases that do not already exist in the same programme.
insert into public.system_subjects(programme,subject_name,short_name,department_category,subject_category,subject_level,verification_status)
select d.programme,d.subject_name,d.short_name,d.department,d.department,d.subject_level,'PENDING_VERIFICATION'
from desired_secondary_subjects d
where not exists (
  select 1 from public.system_subjects s
  where s.programme=d.programme and (
    public.normalized_subject_name(s.subject_name)=public.normalized_subject_name(d.subject_name)
    or exists(select 1 from unnest(d.aliases) a where public.normalized_subject_name(s.short_name)=public.normalized_subject_name(a) or public.normalized_subject_name(s.subject_name)=public.normalized_subject_name(a))
  )
)
on conflict (programme,subject_name) do nothing;
insert into public.subject_catalogue_audit_findings(programme,requested_name,normalized_name,finding,matched_subject_id,detail)
select d.programme,d.subject_name,public.normalized_subject_name(d.subject_name),
  case when public.normalized_subject_name(s.subject_name)=public.normalized_subject_name(d.subject_name) then 'EXACT_MATCH' else 'ALIAS_MATCH' end,
  s.id,'Catalogue identity preserved; no duplicate created.'
from desired_secondary_subjects d join public.system_subjects s on s.programme=d.programme and (
  public.normalized_subject_name(s.subject_name)=public.normalized_subject_name(d.subject_name)
  or exists(select 1 from unnest(d.aliases) a where public.normalized_subject_name(s.short_name)=public.normalized_subject_name(a) or public.normalized_subject_name(s.subject_name)=public.normalized_subject_name(a))
)
on conflict do nothing;
-- Assessments define context; subjects define papers; this table selects the papers used in that context.
create table if not exists public.academic_assessments (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  name varchar(180) not null, programme public.subject_programme not null,
  status public.offering_status not null default 'DRAFT', locked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(school_id,academic_year_id,term_id,name), unique(id,school_id)
);
create table if not exists public.assessment_subject_papers (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  assessment_id uuid not null, school_subject_offering_id uuid not null,
  system_subject_paper_id uuid not null references public.system_subject_papers(id) on delete restrict,
  is_required boolean not null default true, display_order smallint not null check(display_order > 0),
  selected_by uuid not null references auth.users(id) on delete restrict, selected_at timestamptz not null default now(),
  constraint assessment_paper_assessment_fk foreign key(assessment_id,school_id) references public.academic_assessments(id,school_id) on delete cascade,
  constraint assessment_paper_offering_fk foreign key(school_subject_offering_id,school_id) references public.school_subject_offerings(id,school_id) on delete restrict,
  unique(assessment_id,school_subject_offering_id,system_subject_paper_id),
  unique(assessment_id,school_subject_offering_id,display_order)
);
alter table public.academic_assessments enable row level security;
alter table public.assessment_subject_papers enable row level security;
drop policy if exists "members read academic assessments" on public.academic_assessments;
create policy "members read academic assessments" on public.academic_assessments for select to authenticated using (exists(select 1 from public.school_memberships m join public.users u on u.id=m.user_id where m.school_id=academic_assessments.school_id and m.status='ACTIVE' and u.auth_user_id=auth.uid()));
drop policy if exists "members read assessment paper selections" on public.assessment_subject_papers;
create policy "members read assessment paper selections" on public.assessment_subject_papers for select to authenticated using (exists(select 1 from public.school_memberships m join public.users u on u.id=m.user_id where m.school_id=assessment_subject_papers.school_id and m.status='ACTIVE' and u.auth_user_id=auth.uid()));
insert into public.permissions(code,description) values
('assessments.papers.view','View assessment-specific subject paper selections.'),
('assessments.papers.manage','Select configured subject papers for an assessment.')
on conflict(code) do update set description=excluded.description;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code in ('assessments.papers.view','assessments.papers.manage')
where r.code in ('SCHOOL_ADMIN','DIRECTOR_OF_STUDIES') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code='assessments.papers.view'
where r.code in ('HOD','TEACHER','CLASS_TEACHER') on conflict do nothing;
-- Browser mutation policies are intentionally absent. The API must derive school_id,
-- validate offering/paper ownership and status, reject locked changes, and write audit history.;
