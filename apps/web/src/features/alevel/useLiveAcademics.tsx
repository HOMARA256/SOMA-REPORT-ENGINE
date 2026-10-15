import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
import { Link } from "react-router-dom";

export type AcademicOffering = {
  id: string;
  name: string;
  short_name: string;
  subject_level: "PRINCIPAL" | "SUBSIDIARY" | "GENERAL_PAPER" | "COMPULSORY" | null;
  papers: Array<{ id: string; paper_name: string }>;
};

export type AcademicCombination = {
  id: string; code: string; name: string; level: string; status: string;
  subjects: Array<{ school_subject_offering_id: string; subject_role: string }>;
};

export type AcademicLearner = {
  id: string; first_name: string; last_name: string; admission_number: string;
  class_name: string; combination_id: string | null;
};

export type AcademicWorkspaceData = {
  offerings: AcademicOffering[];
  combinations: AcademicCombination[];
  assessments: Array<{ id: string; name: string; status: string }>;
  learners: AcademicLearner[];
  can_manage: boolean;
};

export type AcademicWorkspace = {
  data: AcademicWorkspaceData | null; loading: boolean; error: string; year: string;
  term: string; setupState: "READY"|"NO_YEAR"|"NO_TERM"|"CONTEXT_ERROR"; yearName:string;
  reload: () => Promise<void>;
};

// The generated database type predates the A-Level migrations. Keep the escape hatch
// local to this adapter until database.generated.ts is regenerated from Supabase.
const db = supabase as any;

export function useLiveAcademics(): AcademicWorkspace {
  const context=useSchoolContext();
  const [data, setData] = useState<AcademicWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState("");
  const [term, setTerm] = useState("");
  const requestVersion = useRef(0);

  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    const isCurrent = () => version === requestVersion.current;
    if(context.loading){setData(null);setYear("");setTerm("");setError("");setLoading(true);return;}
    if (!db) { setError("Supabase is not configured for this deployment."); setLoading(false); return; }
    setLoading(true); setError(""); setData(null);
    try {
      if(context.error)throw new Error(context.error);
      if(context.contextIssue){setYear(context.academicYearId);setTerm(context.termId);return;}
      if(!context.schoolId||!context.academicYearId||!context.termId){setData(null);setYear(context.academicYearId);setTerm(context.termId);return;}
      const schoolId=context.schoolId;setYear(context.academicYearId);setTerm(context.termId);

      const [offeringResult, combinationResult, assessmentResult, learnerResult, assignmentResult] = await Promise.all([
        db.from("school_subject_offerings").select("id,display_name_override,school_subject_code,subject_level,system_subjects(subject_name,short_name,system_subject_papers(id,paper_name))").eq("school_id", schoolId).eq("academic_year_id", context.academicYearId).eq("programme", "A_LEVEL").eq("status", "ACTIVE"),
        db.from("a_level_combinations").select("id,code,name,level,status,a_level_combination_subjects(school_subject_offering_id,subject_role)").eq("school_id", schoolId).eq("academic_year_id", context.academicYearId).order("code"),
        db.from("academic_assessments").select("id,name,status").eq("school_id", schoolId).eq("academic_year_id", context.academicYearId).eq("term_id",context.termId).eq("programme", "A_LEVEL"),
        db.from("learner_class_enrolments").select("learner_id,academic_classes!inner(class_name,level,programme),learners!inner(id,first_name,last_name,admission_number)").eq("school_id", schoolId).eq("academic_year_id", context.academicYearId).eq("status", "ACTIVE").eq("academic_classes.programme", "A_LEVEL").in("academic_classes.level", [5, 6]),
        db.from("a_level_learner_assignments").select("learner_id,combination_id").eq("school_id", schoolId).eq("status", "ACTIVE"),
      ]);
      if(!isCurrent())return;
      const firstError = [offeringResult, combinationResult, assessmentResult, learnerResult, assignmentResult].find(result => result.error)?.error;
      if (firstError) throw firstError;
      const assignments = new Map((assignmentResult.data ?? []).map((item: any) => [item.learner_id, item.combination_id]));
      setData({
        offerings: (offeringResult.data ?? []).map((item: any) => ({ id: item.id, name: item.display_name_override ?? item.system_subjects?.subject_name ?? item.school_subject_code, short_name: item.system_subjects?.short_name ?? item.school_subject_code, subject_level: item.subject_level, papers: item.system_subjects?.system_subject_papers ?? [] })),
        combinations: (combinationResult.data ?? []).map((item: any) => ({ ...item, subjects: item.a_level_combination_subjects ?? [] })),
        assessments: assessmentResult.data ?? [],
        learners: (learnerResult.data ?? []).map((item: any) => ({ id: item.learners.id, first_name: item.learners.first_name, last_name: item.learners.last_name, admission_number: item.learners.admission_number, class_name: item.academic_classes.class_name, combination_id: assignments.get(item.learners.id) ?? null })),
        can_manage: true,
      });
    } catch (reason) { if(isCurrent())setError((reason as Error).message || "The A-Level workspace could not be loaded."); }
    finally { if(isCurrent())setLoading(false); }
  }, [context.loading,context.error,context.contextIssue,context.schoolId,context.academicYearId,context.termId]);

  useEffect(() => { void reload(); }, [reload]);
  const setupState=context.contextIssue?"CONTEXT_ERROR":!context.academicYearId?"NO_YEAR":!context.termId?"NO_TERM":"READY";
  return { data, loading:loading||context.loading, error, year, term, setupState, yearName:context.academicYearName, reload };
}

export async function academicRpc<T = unknown>(name: string, parameters: Record<string, unknown>): Promise<T> {
  if (!db) throw new Error("Supabase is not configured for this deployment.");
  const { data, error } = await db.rpc(name, parameters);
  if (error) throw error;
  return data as T;
}

export function AcademicContext({ workspace }: { workspace: AcademicWorkspace }) {
  const context=useSchoolContext();
  if (workspace.loading) return <div className="panel live-academic-status academic-context-loading" role="status"><span/><span/><span/></div>;
  if(workspace.setupState==="NO_YEAR")return <section className="panel academic-guidance guidance-info"><div><strong>Academic year required</strong><p>Create an academic year before configuring A-Level subjects, combinations, papers, assessments, and learners.</p></div><Link className="primary-button" to="/setup/academic-years">Create Academic Year</Link></section>;
  if(workspace.setupState==="NO_TERM")return <section className="panel academic-guidance guidance-warning"><div><strong>Term required</strong><p>Create a term for {workspace.yearName} before configuring A-Level work.</p></div><Link className="primary-button" to="/setup/academic-years">Create Term</Link></section>;
  if(workspace.setupState==="CONTEXT_ERROR")return context.contextIssue==="PROFILE_REQUIRED"
    ? <section className="panel academic-guidance guidance-error" role="alert"><div><strong>School setup requires attention</strong><p>The required School Profile is missing or incomplete. Platform Administration has been notified.</p></div><div><button className="secondary-button" type="button" onClick={()=>void context.refresh()}>Retry</button><Link className="primary-button" to="/settings/school-profile">Open School Profile</Link></div></section>
    : <section className="panel academic-guidance guidance-error" role="alert"><div><strong>Academic context could not be loaded</strong><p>The selected academic year or term is unavailable for this school. Refresh the workspace or choose a valid academic year.</p></div><div><button className="secondary-button" type="button" onClick={()=>{context.clearContextIssue();void context.refresh();}}>Refresh Context</button><Link className="primary-button" to="/setup/academic-years">Choose Academic Year</Link></div></section>;
  if (workspace.error) return <section className="panel academic-guidance guidance-error" role="alert"><div><strong>Could not load A-Level workspace</strong><p>{workspace.error}</p></div><button className="secondary-button" onClick={()=>void workspace.reload()}>Retry</button></section>;
  if (!workspace.data) return <p className="panel live-academic-status">No academic configuration is available.</p>;
  return null;
}
