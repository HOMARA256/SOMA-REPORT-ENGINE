import { BookOpen, ChevronDown, ChevronUp, Download, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { platformSupabase as supabase } from "../../config/supabaseClient";

type PaperRow = {
  id: string; paper_code: string | null; paper_number: string | null; paper_name: string;
  component_type: string; official_component_type: string | null; maximum_mark: number | null; duration_minutes: number | null;
  is_required: boolean; verification_status: string; source_reference: string | null;
};
type SubjectRow = {
  id: string; programme: "O_LEVEL" | "A_LEVEL"; subject_code: string | null;
  subject_name: string; short_name: string; department_category: string;
  subject_level: string | null; curriculum_version: string | null; exam_body: string | null;
  verification_status: string; is_active: boolean; is_official: boolean; is_compulsory: boolean;
  official_source: string | null; system_subject_papers: PaperRow[];
};

function exportCatalogue(rows: SubjectRow[]) {
  const columns = ["Academic Level","Subject Code","Learning Area","Subject Level","Department","Catalogue Version","Catalogue Status","Paper Code","Paper Name","Paper Type","Maximum Mark","Duration Minutes","Paper Status"];
  const records = rows.flatMap((subject) => subject.system_subject_papers.map((paper) => [subject.programme,subject.subject_code ?? "",subject.subject_name,subject.subject_level ?? "",subject.department_category,"National Subject Catalogue 2026","ACTIVE",paper.paper_code ?? "",paper.paper_name,paper.official_component_type ?? paper.component_type,paper.maximum_mark ?? "",paper.duration_minutes ?? "","ACTIVE"]));
  const csv = [columns,...records].map((row) => row.map((value) => `"${String(value).replaceAll('"','""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href=url; link.download="soma-report-engine-national-subject-catalogue.csv"; link.click(); URL.revokeObjectURL(url);
}

export function PlatformSubjectCataloguePage() {
  const [subjects,setSubjects]=useState<SubjectRow[]>([]); const [loading,setLoading]=useState(true);
  const [error,setError]=useState(""); const [query,setQuery]=useState(""); const [programme,setProgramme]=useState("ALL");
  const [expanded,setExpanded]=useState<string | null>(null);
  async function load() {
    if(!supabase){setError("Supabase is not configured for this deployment.");setLoading(false);return;}
    setLoading(true);setError("");
    const {data,error:loadError}=await supabase.from("system_subjects").select("id,programme,subject_code,subject_name,short_name,department_category,subject_level,curriculum_version,exam_body,verification_status,is_active,is_official,is_compulsory,official_source,system_subject_papers(id,paper_code,paper_number,paper_name,component_type,official_component_type,maximum_mark,duration_minutes,is_required,verification_status,source_reference)").eq("is_active",true).eq("is_official",true).order("programme").order("subject_name");
    if(loadError){setError("The national catalogue could not be loaded.");setSubjects([]);}else setSubjects((data ?? []) as unknown as SubjectRow[]);
    setLoading(false);
  }
  useEffect(()=>{void load();},[]);
  const filtered=useMemo(()=>subjects.filter((subject)=>{
    const matchesQuery=`${subject.subject_name} ${subject.short_name} ${subject.subject_code ?? ""} ${subject.department_category}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery&&(programme==="ALL"||subject.programme===programme);
  }),[subjects,query,programme]);
  const oLevel=subjects.filter((item)=>item.programme==="O_LEVEL").length; const aLevel=subjects.filter((item)=>item.programme==="A_LEVEL").length;
  const oLevelPapers=subjects.filter((item)=>item.programme==="O_LEVEL").reduce((total,item)=>total+item.system_subject_papers.length,0);
  const aLevelPapers=subjects.filter((item)=>item.programme==="A_LEVEL").reduce((total,item)=>total+item.system_subject_papers.length,0);
  return <div className="platform-catalogue-page">
    <section className="platform-page-heading"><div><span className="eyebrow">SOMA REPORT ENGINE PLATFORM ADMIN</span><h1>SOMA REPORT ENGINE National Subject Catalogue</h1><p>The central O-Level and A-Level catalogue from which each school activates its own subject offerings.</p></div><div className="platform-catalogue-actions"><button className="secondary-button" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={17}/> Refresh</button><button className="primary-button" type="button" onClick={()=>exportCatalogue(filtered)} disabled={!filtered.length}><Download size={17}/> Export catalogue</button></div></section>
    <section className="platform-catalogue-stats"><article><span>O-Level subjects</span><strong>{oLevel}</strong><small>National Subject Catalogue 2026</small></article><article><span>O-Level papers</span><strong>{oLevelPapers}</strong><small>Active paper structures</small></article><article><span>A-Level subjects</span><strong>{aLevel}</strong><small>National Subject Catalogue 2026</small></article><article><span>A-Level papers</span><strong>{aLevelPapers}</strong><small>Active paper structures</small></article></section>
    <section className="panel platform-catalogue-governance"><ShieldCheck size={20}/><div><strong>Catalogue governance</strong><p>Master subject names, codes and paper structures are read-only to schools. O-Level Mathematics and English Language are required; optional subjects are activated independently by each school.</p></div></section>
    <section className="panel platform-catalogue-panel"><div className="platform-catalogue-filters"><label className="platform-catalogue-search"><span>Search catalogue</span><div><Search size={18}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Learning area, code, or department"/></div></label><label><span>Academic Level</span><select value={programme} onChange={(event)=>setProgramme(event.target.value)}><option value="ALL">All academic levels</option><option value="O_LEVEL">O-Level</option><option value="A_LEVEL">A-Level</option></select></label></div>
      {error&&<div className="form-error" role="alert">{error}</div>}{loading?<div className="platform-catalogue-empty">Loading national catalogue…</div>:<div className="table-wrapper"><table className="data-table platform-catalogue-table"><thead><tr><th>Subject</th><th>Programme</th><th>Classification</th><th>Department</th><th>Official code</th><th>Papers</th><th>Policy</th><th/></tr></thead><tbody>{filtered.map((subject)=><Fragment key={subject.id}><tr><td><strong>{subject.subject_name}</strong><small>{subject.official_source ?? subject.curriculum_version}</small></td><td>{subject.programme==="O_LEVEL"?"UCE":"UACE"}</td><td>{subject.subject_level?.replaceAll("_"," ") ?? "Pending"}</td><td>{subject.department_category}</td><td>{subject.subject_code}</td><td>{subject.system_subject_papers.length} official component{subject.system_subject_papers.length===1?"":"s"}</td><td><span className="platform-badge success">{subject.is_compulsory?"REQUIRED / LOCKED":"OPTIONAL"}</span></td><td><button className="table-action" type="button" aria-label={`${expanded===subject.id?"Hide":"Show"} ${subject.subject_name} papers`} onClick={()=>setExpanded(expanded===subject.id?null:subject.id)}>{expanded===subject.id?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button></td></tr>{expanded===subject.id&&<tr className="platform-catalogue-paper-row"><td colSpan={8}><div className="platform-catalogue-papers">{subject.system_subject_papers.map((paper)=><article key={paper.id}><BookOpen size={18}/><div><strong>{paper.paper_code} · {paper.paper_name}</strong><span>{paper.official_component_type ?? paper.component_type.replaceAll("_"," ")}</span><small>Official and active · {paper.source_reference}</small></div></article>)}</div></td></tr>}</Fragment>)}{!filtered.length&&<tr><td colSpan={8} className="platform-catalogue-empty">No subjects match these filters.</td></tr>}</tbody></table></div>}<footer>{filtered.length} of {subjects.length} official UNEB 2026 subjects</footer></section>
  </div>;
}
