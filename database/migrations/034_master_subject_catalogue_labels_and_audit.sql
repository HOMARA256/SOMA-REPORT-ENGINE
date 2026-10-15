-- OURSCHOOL Stage 34
-- Non-destructive catalogue label alignment and an operational audit summary.
-- Stable subject IDs, official codes, papers and relationships are preserved.

with labels(programme,subject_name,short_name) as (values
 ('O_LEVEL','English Language','ENG'),('O_LEVEL','Mathematics','MTC'),('O_LEVEL','History & Political Education','HPE'),
 ('O_LEVEL','Geography','GEOG'),('O_LEVEL','Physics','PHY'),('O_LEVEL','Biology','BIO'),('O_LEVEL','Chemistry','CHEM'),
 ('O_LEVEL','General Science','GS'),('O_LEVEL','Physical Education','PE'),('O_LEVEL','Christian Religious Education','CRE'),
 ('O_LEVEL','Islamic Religious Education','IRE'),('O_LEVEL','Entrepreneurship Education','ENT'),('O_LEVEL','Kiswahili','KIS'),
 ('O_LEVEL','Agriculture','AGRIG'),('O_LEVEL','Information and Communication Technology','ICT'),('O_LEVEL','French','FRE'),
 ('O_LEVEL','German','GER'),('O_LEVEL','Latin','LAT'),('O_LEVEL','Arabic','ARA'),('O_LEVEL','Chinese','CHI'),
 ('O_LEVEL','Literature in English','LIE'),('O_LEVEL','Art and Design','A&D'),('O_LEVEL','Performing Arts','PA'),
 ('O_LEVEL','Technology and Design','TD'),('O_LEVEL','Nutrition and Food Technology','NFT'),('O_LEVEL','Ateso','Ateso'),
 ('O_LEVEL','Dhopadhola','Dhopadhola'),('O_LEVEL','Leb Acoli','Leb-Acholi'),('O_LEVEL','Leblango','Leblango'),
 ('O_LEVEL','Luganda','Luganda'),('O_LEVEL','Lugbarati','Lugbarati'),('O_LEVEL','Lumasaaba','Lumasaaba'),
 ('O_LEVEL','Lusoga','Lusoga'),('O_LEVEL','Runyoro-Rutooro','Ru-Rutooro'),('O_LEVEL','Runyankore-Rukiga','RU-Rukiga'),
 ('A_LEVEL','Agriculture','AGRIC'),('A_LEVEL','Arabic','ARAB'),('A_LEVEL','Art and Design','A&D'),
 ('A_LEVEL','Biology','BIO'),('A_LEVEL','Chemistry','CHEM'),('A_LEVEL','Chinese','CHIN'),
 ('A_LEVEL','Christian Religious Education','CRE'),('A_LEVEL','Clothing and Textile','C&T'),('A_LEVEL','Economics','ECON'),
 ('A_LEVEL','Entrepreneurship Education','ENT'),('A_LEVEL','Foods and Nutrition','F&N'),('A_LEVEL','French','FREN'),
 ('A_LEVEL','General Paper','GP'),('A_LEVEL','Geography','GEOG'),('A_LEVEL','German','GER'),('A_LEVEL','History','HIST'),
 ('A_LEVEL','Islamic Religious Education','IRE'),('A_LEVEL','Kiswahili','KIS'),('A_LEVEL','Latin','LAT'),
 ('A_LEVEL','Literature in English','LIT'),('A_LEVEL','Mathematics','MTC'),('A_LEVEL','Metal Work','MW'),('A_LEVEL','Music','MUS'),
 ('A_LEVEL','Physics','PHY'),('A_LEVEL','Subsidiary ICT','SUB ICT'),('A_LEVEL','Subsidiary Mathematics','SUB MTC'),
 ('A_LEVEL','Technical Drawing','TD'),('A_LEVEL','Wood Work','WW'),('A_LEVEL','Ateso','Ateso'),
 ('A_LEVEL','Dhopadhola','Dhopadhola'),('A_LEVEL','Leb Acoli','Leb-Acholi'),('A_LEVEL','Leblango','Leblango'),
 ('A_LEVEL','Luganda','Luganda'),('A_LEVEL','Lugbarati','Lugbarati'),('A_LEVEL','Lumasaaba','Lumasaaba'),
 ('A_LEVEL','Lusoga','Lusoga'),('A_LEVEL','Runyoro-Rutooro','Ru-Rutooro'),('A_LEVEL','Runyankore-Rukiga','Ru-rukiga'),
 ('A_LEVEL','Physical Education','PE')
)
update public.system_subjects s set short_name=l.short_name,updated_at=now()
from labels l where s.programme::text=l.programme and public.normalized_subject_name(s.subject_name)=public.normalized_subject_name(l.subject_name)
  and s.short_name is distinct from l.short_name;

-- Later verified imports may have introduced punctuation variants. Flag every
-- affected stable record for manual resolution; never merge or delete in place.
insert into public.subject_catalogue_audit_findings(programme,requested_name,normalized_name,finding,matched_subject_id,detail)
select s.programme,s.subject_name,public.normalized_subject_name(s.subject_name),'DUPLICATE',s.id,
 'Multiple stable catalogue records now share the same normalized programme/name. Relationships are preserved pending manual review.'
from public.system_subjects s join (
 select programme,public.normalized_subject_name(subject_name) normalized_name from public.system_subjects
 group by programme,public.normalized_subject_name(subject_name) having count(*)>1
) d on d.programme=s.programme and d.normalized_name=public.normalized_subject_name(s.subject_name)
on conflict do nothing;

insert into public.subject_catalogue_audit_findings(programme,requested_name,normalized_name,finding,matched_subject_id,detail)
select s.programme,s.subject_name,public.normalized_subject_name(s.subject_name),'REVIEW_REQUIRED',s.id,
 'Possible naming alias requires a human decision; records and references were not changed.'
from public.system_subjects s where
 (s.programme='A_LEVEL' and public.normalized_subject_name(s.subject_name) in ('foodandnutrition','foodsandnutrition','principalmathematics','mathematics'))
 or (s.programme='O_LEVEL' and public.normalized_subject_name(s.subject_name) in ('informationandcommunicationtechnology','informationcommunicationstechnology'))
on conflict do nothing;

create or replace view public.subject_catalogue_audit_summary as
select s.programme,
 count(*) as subject_count,
 count(*) filter(where s.is_active) as active_count,
 count(*) filter(where s.subject_level is null) as missing_classification_count,
 count(*) filter(where s.verification_status='PENDING_VERIFICATION') as pending_verification_count,
 count(*) filter(where s.subject_code is null) as missing_official_code_count,
 count(*) filter(where not exists(select 1 from public.system_subject_papers p where p.system_subject_id=s.id and p.is_active)) as subjects_without_papers_count,
 count(*) filter(where exists(select 1 from public.subject_catalogue_audit_findings f where f.matched_subject_id=s.id and f.finding in ('DUPLICATE','REVIEW_REQUIRED'))) as manual_review_count
from public.system_subjects s group by s.programme;

revoke all on public.subject_catalogue_audit_summary from anon;
grant select on public.subject_catalogue_audit_summary to authenticated;
