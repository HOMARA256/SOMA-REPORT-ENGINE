-- UNEB Official 2026 UCE and UACE catalogue. Subject and paper setup only.
-- Idempotent; official identities are platform-owned and school offerings retain history.

create table if not exists public.examination_catalogues (
  id uuid primary key default gen_random_uuid(),
  code varchar(20) not null unique,
  name varchar(180) not null,
  examination_level public.subject_programme not null unique,
  official_source varchar(180) not null,
  is_official boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.examination_catalogues enable row level security;
drop policy if exists "authenticated read examination catalogues" on public.examination_catalogues;
create policy "authenticated read examination catalogues" on public.examination_catalogues for select to authenticated using (is_active);
revoke insert,update,delete,truncate,references,trigger on public.examination_catalogues from authenticated,anon;
revoke all privileges on public.examination_catalogues from anon;

insert into public.examination_catalogues(code,name,examination_level,official_source,is_official,is_active)
values ('UCE','Uganda Certificate of Education','O_LEVEL','UNEB Official 2026',true,true),
       ('UACE','Uganda Advanced Certificate of Education','A_LEVEL','UNEB Official 2026',true,true)
on conflict(code) do update set name=excluded.name,examination_level=excluded.examination_level,
 official_source=excluded.official_source,is_official=true,is_active=true,updated_at=now();

alter table public.system_subjects
  add column if not exists examination_catalogue_id uuid references public.examination_catalogues(id) on delete restrict,
  add column if not exists official_source varchar(180),
  add column if not exists is_official boolean not null default false,
  add column if not exists is_compulsory boolean not null default false;

alter table public.system_subject_papers
  add column if not exists official_component_type varchar(50),
  add column if not exists official_source varchar(180),
  add column if not exists is_official boolean not null default false;

create unique index if not exists system_subject_official_paper_component_key
on public.system_subject_papers(system_subject_id,paper_code,official_component_type)
where paper_code is not null and official_component_type is not null;

with aliases(programme,old_name,new_name) as (values
  ('O_LEVEL','Art and Design','Art & Design'),
  ('O_LEVEL','Entrepreneurship Education','Entrepreneurship'),
  ('O_LEVEL','Information and Communication Technology','Information & Communications Technology'),
  ('O_LEVEL','Lugbarati','LugbaraTi'),
  ('O_LEVEL','Nutrition and Food Technology','Nutrition & Food Technology'),
  ('O_LEVEL','Runyankore-Rukiga','Runyankore/Rukiga'),
  ('O_LEVEL','Technology and Design','Technology & Design'),
  ('A_LEVEL','Art and Design','Art & Design'),
  ('A_LEVEL','Clothing and Textile','Clothing & Textiles'),
  ('A_LEVEL','Foods and Nutrition','Food & Nutrition'),
  ('A_LEVEL','Lugbarati','LugbaraTi'),
  ('A_LEVEL','Mathematics','Principal Mathematics'),
  ('A_LEVEL','Metal Work','Metalwork'),
  ('A_LEVEL','Runyankore-Rukiga','Runyankore/Rukiga'),
  ('A_LEVEL','Wood Work','Woodwork')
)
update public.system_subjects s set subject_name=a.new_name,short_name=a.new_name,updated_at=now()
from aliases a where s.programme::text=a.programme and s.subject_name=a.old_name
and not exists(select 1 from public.system_subjects x where x.programme=s.programme and x.subject_name=a.new_name);

with official(programme,subject_code,subject_name,short_name,department_category,subject_level,catalogue_code,is_compulsory) as (values
  ('O_LEVEL','456','Mathematics','Mathematics','Mathematics','ORDINARY','UCE',true),
  ('O_LEVEL','112','English Language','English Language','Languages','ORDINARY','UCE',true),
  ('O_LEVEL','241','History & Political Education','History & Political Education','Humanities','ORDINARY','UCE',false),
  ('O_LEVEL','273','Geography','Geography','Humanities','ORDINARY','UCE',false),
  ('O_LEVEL','500','General Science','General Science','Sciences','ORDINARY','UCE',false),
  ('O_LEVEL','535','Physics','Physics','Sciences','ORDINARY','UCE',false),
  ('O_LEVEL','545','Chemistry','Chemistry','Sciences','ORDINARY','UCE',false),
  ('O_LEVEL','553','Biology','Biology','Sciences','ORDINARY','UCE',false),
  ('O_LEVEL','208','Literature in English','Literature in English','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','840','Information & Communications Technology','Information & Communications Technology','ICT','ORDINARY','UCE',false),
  ('O_LEVEL','336','Kiswahili','Kiswahili','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','527','Agriculture','Agriculture','Sciences','ORDINARY','UCE',false),
  ('O_LEVEL','223','Christian Religious Education','Christian Religious Education','Humanities','ORDINARY','UCE',false),
  ('O_LEVEL','225','Islamic Religious Education','Islamic Religious Education','Humanities','ORDINARY','UCE',false),
  ('O_LEVEL','621','Performing Arts','Performing Arts','Creative Arts','ORDINARY','UCE',false),
  ('O_LEVEL','612','Art & Design','Art & Design','Creative Arts','ORDINARY','UCE',false),
  ('O_LEVEL','555','Physical Education','Physical Education','General','ORDINARY','UCE',false),
  ('O_LEVEL','845','Entrepreneurship','Entrepreneurship','General','ORDINARY','UCE',false),
  ('O_LEVEL','662','Nutrition & Food Technology','Nutrition & Food Technology','Vocational','ORDINARY','UCE',false),
  ('O_LEVEL','745','Technology & Design','Technology & Design','Vocational','ORDINARY','UCE',false),
  ('O_LEVEL','301','Latin','Latin','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','309','German','German','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','314','French','French','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','337','Arabic','Arabic','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','396','Chinese','Chinese','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','397','Ugandan Sign Language','Ugandan Sign Language','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','305','Leb Acoli','Leb Acoli','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','315','Leblango','Leblango','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','325','LugbaraTi','LugbaraTi','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','335','Luganda','Luganda','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','345','Runyankore/Rukiga','Runyankore/Rukiga','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','355','Lusoga','Lusoga','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','365','Ateso','Ateso','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','375','Dhopadhola','Dhopadhola','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','385','Runyoro-Rutooro','Runyoro-Rutooro','Languages','ORDINARY','UCE',false),
  ('O_LEVEL','395','Lumasaaba','Lumasaaba','Languages','ORDINARY','UCE',false),
  ('A_LEVEL','P210','History','History','Humanities','PRINCIPAL','UACE',false),
  ('A_LEVEL','P425','Principal Mathematics','Principal Mathematics','Mathematics','PRINCIPAL','UACE',false),
  ('A_LEVEL','P220','Economics','Economics','Humanities','PRINCIPAL','UACE',false),
  ('A_LEVEL','P250','Geography','Geography','Humanities','PRINCIPAL','UACE',false),
  ('A_LEVEL','P310','Literature in English','Literature in English','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P510','Physics','Physics','Sciences','PRINCIPAL','UACE',false),
  ('A_LEVEL','P525','Chemistry','Chemistry','Sciences','PRINCIPAL','UACE',false),
  ('A_LEVEL','P530','Biology','Biology','Sciences','PRINCIPAL','UACE',false),
  ('A_LEVEL','P245','Christian Religious Education','Christian Religious Education','Humanities','PRINCIPAL','UACE',false),
  ('A_LEVEL','P235','Islamic Religious Education','Islamic Religious Education','Humanities','PRINCIPAL','UACE',false),
  ('A_LEVEL','P320','Kiswahili','Kiswahili','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P615','Art & Design','Art & Design','Creative Arts','PRINCIPAL','UACE',false),
  ('A_LEVEL','P620','Music','Music','Creative Arts','PRINCIPAL','UACE',false),
  ('A_LEVEL','P515','Agriculture','Agriculture','Sciences','PRINCIPAL','UACE',false),
  ('A_LEVEL','P230','Entrepreneurship Education','Entrepreneurship Education','General','PRINCIPAL','UACE',false),
  ('A_LEVEL','S475','Subsidiary Mathematics','Subsidiary Mathematics','Mathematics','SUBSIDIARY','UACE',false),
  ('A_LEVEL','S850','Subsidiary ICT','Subsidiary ICT','ICT','SUBSIDIARY','UACE',false),
  ('A_LEVEL','S101','General Paper','General Paper','General','GENERAL_PAPER','UACE',false),
  ('A_LEVEL','P630','Clothing & Textiles','Clothing & Textiles','Vocational','PRINCIPAL','UACE',false),
  ('A_LEVEL','P640','Food & Nutrition','Food & Nutrition','Vocational','PRINCIPAL','UACE',false),
  ('A_LEVEL','P730','Woodwork','Woodwork','Vocational','PRINCIPAL','UACE',false),
  ('A_LEVEL','P740','Metalwork','Metalwork','Vocational','PRINCIPAL','UACE',false),
  ('A_LEVEL','P720','Technical Drawing','Technical Drawing','Vocational','PRINCIPAL','UACE',false),
  ('A_LEVEL','P330','French','French','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P340','German','German','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P350','Latin','Latin','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P370','Arabic','Arabic','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P372','Chinese','Chinese','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P360','Luganda','Luganda','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P361','Leb Acoli','Leb Acoli','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P362','Leblango','Leblango','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P363','LugbaraTi','LugbaraTi','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P364','Runyankore/Rukiga','Runyankore/Rukiga','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P366','Lusoga','Lusoga','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P367','Ateso','Ateso','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P368','Dhopadhola','Dhopadhola','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P369','Runyoro/Rutooro','Runyoro/Rutooro','Languages','PRINCIPAL','UACE',false),
  ('A_LEVEL','P371','Lumasaaba','Lumasaaba','Languages','PRINCIPAL','UACE',false)
)
insert into public.system_subjects(programme,subject_code,subject_name,short_name,department_category,subject_level,curriculum_version,exam_body,is_examinable,is_active,verification_status,effective_from,examination_catalogue_id,official_source,is_official,is_compulsory)
select o.programme::public.subject_programme,o.subject_code,o.subject_name,o.short_name,o.department_category,o.subject_level::public.subject_level,
 'UNEB 2026','UNEB',true,true,'VERIFIED',date '2026-01-01',c.id,'UNEB Official 2026',true,o.is_compulsory
from official o join public.examination_catalogues c on c.code=o.catalogue_code
on conflict(programme,subject_name) do update set
 subject_code=excluded.subject_code,short_name=excluded.short_name,subject_level=excluded.subject_level,
 curriculum_version='UNEB 2026',exam_body='UNEB',is_examinable=true,is_active=true,
 verification_status='VERIFIED',effective_from=date '2026-01-01',
 examination_catalogue_id=excluded.examination_catalogue_id,official_source='UNEB Official 2026',
 is_official=true,is_compulsory=excluded.is_compulsory,updated_at=now();

with official(programme,subject_code,paper_code,paper_name,official_component_type,component_type,display_order) as (values
  ('O_LEVEL','456','456/1','Mathematics','General','OTHER',1),
  ('O_LEVEL','112','112/1','English Language','General','OTHER',1),
  ('O_LEVEL','241','241/1','History & Political Education','General','OTHER',1),
  ('O_LEVEL','273','273/1','Geography','General','OTHER',1),
  ('O_LEVEL','500','500/1','General Science (Physics)','Theory','THEORY',1),
  ('O_LEVEL','500','500/2','General Science (Chemistry)','Theory','THEORY',2),
  ('O_LEVEL','500','500/3','General Science (Biology)','Theory','THEORY',3),
  ('O_LEVEL','535','535/1','Physics (Theory)','Theory','THEORY',1),
  ('O_LEVEL','535','535/2','Physics (Practical)','Practical','PRACTICAL',2),
  ('O_LEVEL','535','535/3','Physics (Practical)','Practical','PRACTICAL',3),
  ('O_LEVEL','545','545/1','Chemistry (Theory)','Theory','THEORY',1),
  ('O_LEVEL','545','545/2','Chemistry (Practical)','Practical','PRACTICAL',2),
  ('O_LEVEL','545','545/3','Chemistry (Practical)','Practical','PRACTICAL',3),
  ('O_LEVEL','553','553/1','Biology (Theory)','Theory','THEORY',1),
  ('O_LEVEL','553','553/2','Biology (Practical)','Practical','PRACTICAL',2),
  ('O_LEVEL','553','553/3','Biology (Practical)','Practical','PRACTICAL',3),
  ('O_LEVEL','208','208/1','Literature in English','General','OTHER',1),
  ('O_LEVEL','840','840/1','Information & Communications Technology (ICT Theory)','Theory','THEORY',1),
  ('O_LEVEL','840','840/2','Information & Communications Technology (Practical)','Practical','PRACTICAL',2),
  ('O_LEVEL','336','336/1','Lugha na Fasihi ya Kiswahili','General','OTHER',1),
  ('O_LEVEL','336','336/2','Lugha na Fasihi ya Kiswahili','General','OTHER',2),
  ('O_LEVEL','527','527/1','Agriculture (Theory)','Theory','THEORY',1),
  ('O_LEVEL','527','527/2','Agriculture (Practical)','Practical','PRACTICAL',2),
  ('O_LEVEL','223','223/1','CRE: Christian Religious Education','General','OTHER',1),
  ('O_LEVEL','225','225/1','IRE: Islamic Religious Education','General','OTHER',1),
  ('O_LEVEL','621','621/1','Performing Arts','Theory','THEORY',1),
  ('O_LEVEL','621','621/2','Performing Arts','Practical','PRACTICAL',2),
  ('O_LEVEL','612','612/1','Art & Design','General','OTHER',1),
  ('O_LEVEL','612','612/2','Art & Design (Planning)','Planning','OTHER',2),
  ('O_LEVEL','612','612/3','Art & Design (Production)','Production','STUDIO',3),
  ('O_LEVEL','555','555/1','Physical Education (Theory)','Theory','THEORY',1),
  ('O_LEVEL','555','555/2','Physical Education Performance','Performance','PERFORMANCE',2),
  ('O_LEVEL','845','845/1','Entrepreneurship','General','OTHER',1),
  ('O_LEVEL','662','662/1','Nutrition & Food Technology (Theory)','Theory','THEORY',1),
  ('O_LEVEL','662','662/2','Nutrition & Food Technology','Practical','PRACTICAL',2),
  ('O_LEVEL','745','745/1','Technology & Design (Theory)','Theory','THEORY',1),
  ('O_LEVEL','745','745/2','Technology & Design (Design & Drawing)','Design & Drawing','OTHER',2),
  ('O_LEVEL','745','745/3','Technology & Design (Practical)','Practical','PRACTICAL',3),
  ('O_LEVEL','301','301/1','Latin Comprehension, Translation & Writing','Written','THEORY',1),
  ('O_LEVEL','301','301/2','Latin','Oral/Practical','ORAL',2),
  ('O_LEVEL','309','309/1','German: Reading Comprehension & Writing','Written','THEORY',1),
  ('O_LEVEL','309','309/2','German Speaking & Listening','Oral','ORAL',2),
  ('O_LEVEL','314','314/1','French: Reading Comprehension & Writing','Written','THEORY',1),
  ('O_LEVEL','314','314/2','French Oral','Oral','ORAL',2),
  ('O_LEVEL','337','337/1','Arabic: Reading Comprehension & Writing','Written','THEORY',1),
  ('O_LEVEL','337','337/2','Arabic','Oral/Practical','ORAL',2),
  ('O_LEVEL','396','396/1','Chinese: Reading Comprehension & Writing','Written','THEORY',1),
  ('O_LEVEL','396','396/2','Chinese','Oral/Practical','ORAL',2),
  ('O_LEVEL','397','397/1','Ugandan Sign Language: Reading Comprehension & Writing','Written','THEORY',1),
  ('O_LEVEL','397','397/2','Ugandan Sign Language: Observing and Signing','Oral','ORAL',2),
  ('O_LEVEL','305','305/1','Leb Acoli','General','OTHER',1),
  ('O_LEVEL','315','315/1','Leblango','General','OTHER',1),
  ('O_LEVEL','325','325/1','LugbaraTi','General','OTHER',1),
  ('O_LEVEL','335','335/1','Luganda','General','OTHER',1),
  ('O_LEVEL','345','345/1','Runyankore/Rukiga','General','OTHER',1),
  ('O_LEVEL','355','355/1','Lusoga','General','OTHER',1),
  ('O_LEVEL','365','365/1','Ateso','General','OTHER',1),
  ('O_LEVEL','375','375/1','Dhopadhola','General','OTHER',1),
  ('O_LEVEL','385','385/1','Runyoro-Rutooro','General','OTHER',1),
  ('O_LEVEL','395','395/1','Lumasaaba','General','OTHER',1),
  ('A_LEVEL','P210','P210/1','History: World Socio-Economic & Political History since 1800','Theory','THEORY',1),
  ('A_LEVEL','P210','P210/2','History: History of World Affairs since 1789','Theory','THEORY',2),
  ('A_LEVEL','P425','P425/1','Principal Mathematics','Theory','THEORY',1),
  ('A_LEVEL','P425','P425/2','Principal Mathematics','Theory','THEORY',2),
  ('A_LEVEL','P220','P220/1','Economics','Theory','THEORY',1),
  ('A_LEVEL','P220','P220/2','Economics','Theory','THEORY',2),
  ('A_LEVEL','P250','P250/1','Geography: Physical Geography','Theory','THEORY',1),
  ('A_LEVEL','P250','P250/2','Geography: World Problems & Development','Theory','THEORY',2),
  ('A_LEVEL','P310','P310/1','Literature in English','Theory','THEORY',1),
  ('A_LEVEL','P310','P310/2','Literature in English','Theory','THEORY',2),
  ('A_LEVEL','P510','P510/1','Physics (Theory)','Theory','THEORY',1),
  ('A_LEVEL','P510','P510/2','Physics (Practical)','Practical','PRACTICAL',2),
  ('A_LEVEL','P510','P510/3','Physics (Practical)','Practical','PRACTICAL',3),
  ('A_LEVEL','P525','P525/1','Chemistry (Theory)','Theory','THEORY',1),
  ('A_LEVEL','P525','P525/2','Chemistry (Practical)','Practical','PRACTICAL',2),
  ('A_LEVEL','P525','P525/3','Chemistry (Practical)','Practical','PRACTICAL',3),
  ('A_LEVEL','P530','P530/1','Biology (Theory)','Theory','THEORY',1),
  ('A_LEVEL','P530','P530/2','Biology (Practical)','Practical','PRACTICAL',2),
  ('A_LEVEL','P530','P530/3','Biology (Practical)','Practical','PRACTICAL',3),
  ('A_LEVEL','P245','P245/1','Christian Religious Education','Theory','THEORY',1),
  ('A_LEVEL','P245','P245/2','Christian Religious Education','Theory','THEORY',2),
  ('A_LEVEL','P235','P235/1','Islamic Religious Education','Theory','THEORY',1),
  ('A_LEVEL','P235','P235/2','Islamic Religious Education','Theory','THEORY',2),
  ('A_LEVEL','P320','P320/1','Fasihi ya Kiswahili','Theory','THEORY',1),
  ('A_LEVEL','P320','P320/2','Fasihi ya Kiswahili','Theory','THEORY',2),
  ('A_LEVEL','P615','P615/1','Art & Design','Theory','THEORY',1),
  ('A_LEVEL','P615','P615/2','Art & Design (Planning Session)','Planning','OTHER',2),
  ('A_LEVEL','P615','P615/2','Art & Design (Production Session)','Production','STUDIO',3),
  ('A_LEVEL','P620','P620/1','Music: Aural Harmony & Literature','Theory','THEORY',1),
  ('A_LEVEL','P620','P620/2','Music Practical','Practical','PRACTICAL',2),
  ('A_LEVEL','P515','P515/1','Agriculture: Principles & Practices (Theory)','Theory','THEORY',1),
  ('A_LEVEL','P515','P515/2','Agriculture: Principles & Practices (Practical)','Practical','PRACTICAL',2),
  ('A_LEVEL','P230','P230/1','Entrepreneurship Education','Theory','THEORY',1),
  ('A_LEVEL','P230','P230/2','Entrepreneurship Education','Theory','THEORY',2),
  ('A_LEVEL','S475','S475/1','Subsidiary Mathematics','Theory','THEORY',1),
  ('A_LEVEL','S850','S850/1','Subsidiary ICT','Theory','THEORY',1),
  ('A_LEVEL','S850','S850/2','Subsidiary ICT (Practical)','Practical','PRACTICAL',2),
  ('A_LEVEL','S850','S850/3','Subsidiary ICT (Practical)','Practical','PRACTICAL',3),
  ('A_LEVEL','S101','S101/1','General Paper','General','OTHER',1),
  ('A_LEVEL','P630','P630/1','Clothing & Textiles','Theory','THEORY',1),
  ('A_LEVEL','P630','P630/2','Clothing & Textiles','Practical','PRACTICAL',2),
  ('A_LEVEL','P640','P640/1','Food & Nutrition','Theory','THEORY',1),
  ('A_LEVEL','P640','P640/2','Food & Nutrition','Practical','PRACTICAL',2),
  ('A_LEVEL','P730','P730/1','Woodwork: Design & Drawing','Design & Drawing','OTHER',1),
  ('A_LEVEL','P730','P730/2','Woodwork','Practical','PRACTICAL',2),
  ('A_LEVEL','P740','P740/1','Metalwork: Design & Drawing','Design & Drawing','OTHER',1),
  ('A_LEVEL','P740','P740/2','Metalwork','Practical','PRACTICAL',2),
  ('A_LEVEL','P720','P720/1','Technical Drawing: Geometrical Drawing','Theory','THEORY',1),
  ('A_LEVEL','P720','P720/2','Technical Drawing: Mechanical Construction','Theory','THEORY',2),
  ('A_LEVEL','P720','P720/3','Technical Drawing: Building Construction','Theory','THEORY',3),
  ('A_LEVEL','P330','P330/1','French: Reading, Translation & Writing','Written','THEORY',1),
  ('A_LEVEL','P330','P330/2','French Oral','Oral','ORAL',2),
  ('A_LEVEL','P340','P340/1','German: Reading, Translation & Writing','Written','THEORY',1),
  ('A_LEVEL','P340','P340/2','German Oral','Oral','ORAL',2),
  ('A_LEVEL','P350','P350/1','Latin: Reading, Translation & Writing','Written','THEORY',1),
  ('A_LEVEL','P350','P350/2','Latin','Oral/Practical','ORAL',2),
  ('A_LEVEL','P370','P370/1','Arabic: Reading, Translation & Writing','Written','THEORY',1),
  ('A_LEVEL','P370','P370/2','Arabic','Oral/Practical','ORAL',2),
  ('A_LEVEL','P372','P372/1','Chinese: Reading, Translation & Writing','Written','THEORY',1),
  ('A_LEVEL','P372','P372/2','Chinese','Oral/Practical','ORAL',2),
  ('A_LEVEL','P360','P360/1','Luganda: Translation, Comprehension & Composition','Written','THEORY',1),
  ('A_LEVEL','P360','P360/2','Luganda: Creation & Literary Analysis','Written','THEORY',2),
  ('A_LEVEL','P361','P361/1','Leb Acoli: Translation, Comprehension & Composition','Written','THEORY',1),
  ('A_LEVEL','P361','P361/2','Leb Acoli: Creation & Literary Analysis','Written','THEORY',2),
  ('A_LEVEL','P362','P362/1','Leblango: Translation, Comprehension & Composition','Written','THEORY',1),
  ('A_LEVEL','P362','P362/2','Leblango: Creation & Literary Analysis','Written','THEORY',2),
  ('A_LEVEL','P363','P363/1','LugbaraTi: Translation, Comprehension & Composition','Written','THEORY',1),
  ('A_LEVEL','P363','P363/2','LugbaraTi: Creation & Literary Analysis','Written','THEORY',2),
  ('A_LEVEL','P364','P364/1','Runyankore/Rukiga: Translation, Comprehension & Composition','Written','THEORY',1),
  ('A_LEVEL','P364','P364/2','Runyankore/Rukiga: Creation & Literary Analysis','Written','THEORY',2),
  ('A_LEVEL','P366','P366/1','Lusoga: Translation, Comprehension & Composition','Written','THEORY',1),
  ('A_LEVEL','P366','P366/2','Lusoga: Creation & Literary Analysis','Written','THEORY',2),
  ('A_LEVEL','P367','P367/1','Ateso: Translation, Comprehension & Composition','Written','THEORY',1),
  ('A_LEVEL','P367','P367/2','Ateso: Creation & Literary Analysis','Written','THEORY',2),
  ('A_LEVEL','P368','P368/1','Dhopadhola: Translation, Comprehension & Composition','Written','THEORY',1),
  ('A_LEVEL','P368','P368/2','Dhopadhola: Creation & Literary Analysis','Written','THEORY',2),
  ('A_LEVEL','P369','P369/1','Runyoro/Rutooro: Translation, Comprehension & Composition','Written','THEORY',1),
  ('A_LEVEL','P369','P369/2','Runyoro/Rutooro: Creation & Literary Analysis','Written','THEORY',2),
  ('A_LEVEL','P371','P371/1','Lumasaaba: Translation, Comprehension & Composition','Written','THEORY',1),
  ('A_LEVEL','P371','P371/2','Lumasaaba: Creation & Literary Analysis','Written','THEORY',2)
)
insert into public.system_subject_papers(system_subject_id,paper_code,paper_number,paper_name,component_type,official_component_type,display_order,is_required,is_active,curriculum_version,examination_year,verification_status,source_reference,effective_from,official_source,is_official)
select s.id,o.paper_code,split_part(o.paper_code,'/',2),o.paper_name,o.component_type::public.subject_component_type,o.official_component_type,o.display_order,
 true,true,'UNEB 2026',2026,'VERIFIED','UNEB Official 2026',date '2026-01-01','UNEB Official 2026',true
from official o join public.system_subjects s on s.programme::text=o.programme and s.subject_code=o.subject_code
on conflict(system_subject_id,paper_code,official_component_type)
where paper_code is not null and official_component_type is not null
do update set paper_name=excluded.paper_name,component_type=excluded.component_type,paper_number=excluded.paper_number,
 display_order=excluded.display_order,is_required=true,is_active=true,curriculum_version='UNEB 2026',
 examination_year=2026,verification_status='VERIFIED',source_reference='UNEB Official 2026',
 effective_from=date '2026-01-01',official_source='UNEB Official 2026',is_official=true;

revoke insert,update,delete,truncate,references,trigger on public.system_subjects,public.system_subject_papers from authenticated,anon;

insert into public.school_subject_offerings(school_id,academic_year_id,system_subject_id,programme,school_subject_code,subject_source,status,subject_level)
select distinct c.school_id,c.academic_year_id,s.id,'O_LEVEL'::public.subject_programme,s.subject_code,'SYSTEM_CATALOGUE','ACTIVE'::public.offering_status,'ORDINARY'::public.subject_level
from public.academic_classes c
join public.system_subjects s on s.programme='O_LEVEL' and s.is_official and s.is_compulsory and s.is_active
where c.programme='O_LEVEL'
on conflict(school_id,academic_year_id,system_subject_id) do update set status='ACTIVE',retired_at=null;

create or replace function public.activate_required_uce_subjects()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.programme='O_LEVEL' then
    insert into public.school_subject_offerings(school_id,academic_year_id,system_subject_id,programme,school_subject_code,subject_source,status,subject_level)
    select new.school_id,new.academic_year_id,s.id,'O_LEVEL'::public.subject_programme,s.subject_code,'SYSTEM_CATALOGUE','ACTIVE'::public.offering_status,'ORDINARY'::public.subject_level
    from public.system_subjects s
    where s.programme='O_LEVEL' and s.is_official and s.is_compulsory and s.is_active
    on conflict(school_id,academic_year_id,system_subject_id) do update set status='ACTIVE',retired_at=null;
  end if;
  return new;
end $$;
revoke all on function public.activate_required_uce_subjects() from public,anon,authenticated;
drop trigger if exists academic_classes_activate_required_uce on public.academic_classes;
create trigger academic_classes_activate_required_uce after insert or update of programme,school_id,academic_year_id
on public.academic_classes for each row execute function public.activate_required_uce_subjects();
