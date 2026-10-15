import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { AcademicContext, useLiveAcademics } from "../alevel/useLiveAcademics";

const db = supabase as any;

export function ALevelAssessmentConfiguration() {
  const workspace = useLiveAcademics();
  const assessments = workspace.data?.assessments ?? [];
  const offerings = workspace.data?.offerings ?? [];
  const [assessmentId, setAssessmentId] = useState("");
  const [offeringId, setOfferingId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingSelection, setLoadingSelection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const activeAssessmentId = assessments.some(item => item.id === assessmentId) ? assessmentId : assessments[0]?.id ?? "";
  const activeOffering = offerings.find(item => item.id === offeringId) ?? offerings[0];
  const papers = useMemo(() => activeOffering?.papers ?? [], [activeOffering]);

  useEffect(() => {
    if (!db || !activeAssessmentId || !activeOffering?.id) { setSelected([]); return; }
    let current = true; setLoadingSelection(true); setError(""); setNotice("");
    void db.from("assessment_subject_papers").select("system_subject_paper_id").eq("assessment_id", activeAssessmentId).eq("school_subject_offering_id", activeOffering.id).order("display_order")
      .then(({ data, error: queryError }: any) => { if (!current) return; if (queryError) setError("Selected papers could not be loaded."); else setSelected((data ?? []).map((item: any) => item.system_subject_paper_id)); setLoadingSelection(false); });
    return () => { current = false; };
  }, [activeAssessmentId, activeOffering?.id]);

  function toggle(paperId: string) { setSelected(items => items.includes(paperId) ? items.filter(id => id !== paperId) : [...items, paperId]); setNotice(""); }
  async function save() {
    if (!db || !activeAssessmentId || !activeOffering?.id || !selected.length) { setError("Select at least one configured paper."); return; }
    setSaving(true); setError(""); setNotice("");
    const { error: saveError } = await db.rpc("set_assessment_subject_papers", { p_assessment: activeAssessmentId, p_offering: activeOffering.id, p_papers: selected });
    setSaving(false);
    if (saveError) { setError(saveError.message || "Paper selection could not be saved."); return; }
    setNotice(`${selected.length} required paper${selected.length === 1 ? "" : "s"} saved for ${activeOffering.name}.`);
  }

  const ready = workspace.setupState === "READY" && !workspace.error && !workspace.loading && Boolean(workspace.data);
  return <><AcademicContext workspace={workspace}/>{ready && <section className="panel assessment-management-panel">
    <div className="assessment-results-heading"><h2>A-Level assessment paper selection</h2><p>Select only the configured papers that teachers must record for each subject and assessment. Unselected papers never count as missing or zero.</p></div>
    <div className="live-academic-controls">
      <label className="form-field"><span>Assessment</span><select value={activeAssessmentId} onChange={event => setAssessmentId(event.target.value)}><option value="">Select assessment</option>{assessments.map(item => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label>
      <label className="form-field"><span>A-Level subject offering</span><select value={activeOffering?.id ?? ""} onChange={event => setOfferingId(event.target.value)}><option value="">Select subject</option>{offerings.map(item => <option key={item.id} value={item.id}>{item.short_name} · {item.name}</option>)}</select></label>
    </div>
    {!assessments.length && <p className="table-empty-state">Create an A-Level assessment before selecting papers.</p>}
    {activeOffering && <div className="assessment-paper-selector" aria-busy={loadingSelection}><h3>{activeOffering.name}: configured papers</h3>{!papers.length ? <p className="form-error-message">This subject has no active configured paper structure.</p> : <div className="assessment-paper-options">{papers.map((paper, index) => <label className="assessment-paper-option" key={paper.id}><input type="checkbox" checked={selected.includes(paper.id)} disabled={loadingSelection || saving} onChange={() => toggle(paper.id)} /><span><strong>Paper {index + 1}</strong>{paper.paper_name}</span></label>)}</div>}</div>}
    {error && <p className="form-error-message" role="alert">{error}</p>}{notice && <p className="form-success-message" role="status">{notice}</p>}
    <div className="action-form-footer"><button type="button" className="primary-button" disabled={saving || loadingSelection || !activeAssessmentId || !activeOffering || !selected.length} onClick={() => void save()}><Save size={16}/>{saving ? "Saving…" : "Save required papers"}</button></div>
  </section>}</>;
}
