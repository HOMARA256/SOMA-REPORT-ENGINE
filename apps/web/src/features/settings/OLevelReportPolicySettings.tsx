import { ClipboardCheck, Eye, LockKeyhole, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { currentUser } from "../../config/currentUser";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";

type Policy = { configured: boolean; id?: string; version?: number; reflectedAoiCount?: number; selectionRule?: "LATEST_COMPLETED"; showClassPosition?: boolean; reportCardType: string; changedAt?: string; changeReason?: string };
const initial: Policy = { configured: false, reportCardType: "END_OF_TERM" };

export function OLevelReportPolicySettings() {
  const school = useSchoolContext();
  const canEdit = currentUser.role === "SCHOOL_ADMIN";
  const [reportType, setReportType] = useState<"END_OF_TERM" | "MID_TERM">("END_OF_TERM");
  const [policy, setPolicy] = useState<Policy>(initial);
  const [count, setCount] = useState("2");
  const [showPosition, setShowPosition] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setPolicy(initial); setLoading(true); setError(""); setNotice(""); setReason("");
    if (!school.schoolId || !school.academicYearId || !supabase) {
      setLoading(false); return () => { active = false; };
    }
    void (supabase as any).rpc("get_o_level_report_policy", {
      p_school_id: school.schoolId, p_academic_year_id: school.academicYearId, p_report_card_type: reportType,
    }).then((result: any) => {
      if (!active) return;
      if (result.error) setError(`O-Level report policy could not load: ${result.error.message}`);
      else {
        const next = (result.data ?? initial) as Policy;
        setPolicy(next); setCount(String(next.reflectedAoiCount ?? 2)); setShowPosition(next.showClassPosition ?? false);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [school.schoolId, school.academicYearId, reportType]);

  async function save() {
    if (!canEdit || !school.schoolId || !school.academicYearId || !supabase) return;
    const requestedCount = Number(count);
    if (!Number.isInteger(requestedCount) || requestedCount < 1) return setError("Choose at least one completed activity for the report card.");
    if (reason.trim().length < 5) return setError("Give a reason of at least five characters for this audited change.");
    setSaving(true); setError(""); setNotice("");
    const result = await (supabase as any).rpc("save_o_level_report_policy", {
      p_school_id: school.schoolId, p_academic_year_id: school.academicYearId, p_report_card_type: reportType,
      p_reflected_aoi_count: requestedCount, p_selection_rule: "LATEST_COMPLETED", p_show_class_position: showPosition, p_reason: reason.trim(),
    });
    setSaving(false);
    if (result.error) return setError(result.error.message);
    setPolicy(result.data as Policy); setReason("");
    setNotice(`Version ${result.data?.version ?? "?"} saved for ${school.academicYearName}. Previously issued reports remain unchanged.`);
  }

  const selectedCount = Number.isInteger(Number(count)) && Number(count) > 0 ? Number(count) : null;
  return <section className="panel o-level-policy-settings" aria-labelledby="o-level-policy-title">
    <div className="panel-heading"><div><h2 id="o-level-policy-title">O-Level assessment &amp; position policy</h2><p>School-specific, academic-year-specific controls. Teachers may continue recording additional activities.</p></div><span className="o-level-policy-version">{policy.configured ? `Version ${policy.version}` : "Not configured"}</span></div>
    {!canEdit && <p className="o-level-policy-readonly"><LockKeyhole size={16} aria-hidden="true"/> Only the School Administrator may change these settings.</p>}
    {!school.academicYearId && <p className="form-error-message">Select an academic year before configuring a report card.</p>}
    {error && <p className="form-error-message" role="alert">{error}</p>}{notice && <p className="form-success-message" role="status">{notice}</p>}
    {loading ? <p>Loading saved report-card policy…</p> : <div className="o-level-policy-grid">
      <div className="o-level-policy-fields">
        <label className="form-field"><span>Report-card type</span><select value={reportType} onChange={(event) => setReportType(event.target.value as "END_OF_TERM" | "MID_TERM")}><option value="END_OF_TERM">End of term</option><option value="MID_TERM">Mid term</option></select></label>
        <label className="form-field"><span>Completed AoIs reflected on each report</span><input type="number" min="1" step="1" value={count} disabled={!canEdit} onChange={(event) => setCount(event.target.value)}/><small>This does not limit how many activities teachers can record.</small></label>
        <label className="form-field"><span>Selection rule</span><select value="LATEST_COMPLETED" disabled><option value="LATEST_COMPLETED">Latest completed scores for each learner</option></select><small>Most recent activity date first; activity number breaks a tie. Absent, exempt and missing scores do not count as completed.</small></label>
        <label className="o-level-policy-checkbox"><input type="checkbox" checked={showPosition} disabled={!canEdit} onChange={(event) => setShowPosition(event.target.checked)}/><span><strong>Show class position</strong><small>Only after class results are approved. Comparison group: active learners in the same class and stream with complete approved subjects; equal averages share competition rank.</small></span></label>
        {canEdit && <><label className="form-field"><span>Reason for change</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Why are these settings being changed?"/></label><button type="button" className="primary-button" disabled={saving || !school.academicYearId} onClick={() => void save()}><Save size={16} aria-hidden="true"/> {saving ? "Saving…" : "Save new policy version"}</button></>}
      </div>
      <aside className="o-level-policy-preview" aria-label="Policy effect preview without learner data"><div><Eye size={18} aria-hidden="true"/><h3>Report effect preview</h3></div><p>No learner data is used in this preview.</p><dl><div><dt>Activities recorded</dt><dd>Unlimited</dd></div><div><dt>Activities selected</dt><dd>{selectedCount ?? "Choose a count"} latest completed per learner</dd></div><div><dt>Fewer than required</dt><dd>Incomplete assessment; final report blocked</dd></div><div><dt>Additional activities</dt><dd>Kept in the register, shown as not selected</dd></div><div><dt>Class position</dt><dd>{showPosition ? "Shown only for approved, complete results" : "Fully omitted from preview and print"}</dd></div></dl><p className="o-level-policy-preview-note"><ClipboardCheck size={16} aria-hidden="true"/> The individual draft lists the exact activity titles and dates selected before approval.</p></aside>
    </div>}
  </section>;
}
