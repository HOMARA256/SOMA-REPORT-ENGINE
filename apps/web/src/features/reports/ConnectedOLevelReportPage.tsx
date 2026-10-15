import { FileText, Printer, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
import { activeOLLevelGradingConfiguration, formatThreePoint, getOLLevelGradingBand } from "../marks/gradingConfiguration";
import { getMarksPreview } from "../marks/marksCalculation";
import { usePersistentMarks } from "../marks/PersistentMarks";
import { useSchoolSettings } from "../settings/SchoolSettingsWorkspace";

type LearnerProfile = { gender: string | null; date_of_birth: string | null; photo_url: string | null };
const shown = (value: number | null | undefined) => value == null ? "—" : Number(value.toFixed(2)).toString();

export function ConnectedOLevelReportPage() {
  const school = useSchoolContext();
  const settings = useSchoolSettings();
  const marks = usePersistentMarks();
  const [params] = useSearchParams();
  const [classId, setClassId] = useState(params.get("class") ?? "");
  const [learnerId, setLearnerId] = useState(params.get("learner") ?? "");
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [policy, setPolicy] = useState<{configured?: boolean; showClassPosition?: boolean; reflectedAoiCount?: number; version?: number} | null>(null);
  const [policyError, setPolicyError] = useState("");
  const [position, setPosition] = useState<{position?: number; outOf?: number; state?: string} | null>(null);
  const offerings = useMemo(() => marks.workspace.offerings.filter((item) => item.programme === "O_LEVEL"), [marks.workspace.offerings]);
  const classes = useMemo(() => [...new Map(offerings.map((item) => [item.classId, { id: item.classId, name: item.className }])).values()], [offerings]);
  const activeClass = classes.find((item) => item.id === classId) ?? classes.find((item) => item.name === classId) ?? classes[0];
  const classOfferings = offerings.filter((item) => item.classId === activeClass?.id);
  const learners = [...new Map(classOfferings.flatMap((item) => item.learners.map((learner) => [learner.id, learner]))).values()].sort((a,b) => a.name.localeCompare(b.name));
  const learner = learners.find((item) => item.id === learnerId) ?? learners[0];
  const results = classOfferings.flatMap((item) => {
    const row = item.learners.find((candidate) => candidate.id === learner?.id);
    if (!row) return [];
    const selected = row.aoiSelection;
    const selectedMatchesSavedMark = selected?.contribution != null && row.aoiMark != null && Math.abs(selected.contribution - row.aoiMark) < 0.011;
    const hasNewComponents = selected?.state === "COMPLETE" && selectedMatchesSavedMark && row.examRaw != null && row.examStatus === "PRESENT";
    const preview = getMarksPreview(hasNewComponents ? String(selected.contribution) : "", hasNewComponents && row.examMark != null ? String(row.examMark) : "", hasNewComponents ? "PRESENT" : "MISSING", hasNewComponents ? "PRESENT" : "MISSING");
    return [{ offering: item, row, preview, selection: selected }];
  }).sort((a,b) => a.offering.subjectName.localeCompare(b.offering.subjectName));
  const complete = Boolean(policy?.configured) && results.length > 0 && results.every((item) => item.preview.state === "PRESENT" && item.selection?.state === "COMPLETE" && item.row.examRaw != null);
  const average = complete ? results.reduce((sum,item) => sum + Number(item.preview.total),0) / results.length : null;
  const overallScore = complete ? results.reduce((sum,item) => sum + (item.preview.threePointScoreExact ?? 0),0) / results.length : null;
  const overallBand = average == null ? null : getOLLevelGradingBand(average);
  const header = settings.resolveHeader();
  const profileMatchesSchool = settings.profile.officialName.trim().toLocaleLowerCase() === school.schoolName.trim().toLocaleLowerCase();
  const nextTerm = header.displaySettings.additionalInformation.nextTermStartDate;

  useEffect(() => {
    let active = true;
    setPolicy(null); setPolicyError("");
    if (!school.schoolId || !school.academicYearId || !supabase) return () => { active = false; };
    void (supabase as any).rpc("get_o_level_report_policy", { p_school_id: school.schoolId, p_academic_year_id: school.academicYearId, p_report_card_type: "END_OF_TERM" }).then((result: any) => {
      if (!active) return;
      if (result.error) setPolicyError(`Report policy could not load: ${result.error.message}`);
      else setPolicy(result.data ?? null);
    });
    return () => { active = false; };
  }, [school.schoolId, school.academicYearId]);

  useEffect(() => {
    let active = true;
    setPosition(null);
    if (!policy?.showClassPosition || !school.schoolId || !marks.termId || !activeClass?.id || !learner?.id || !supabase) return () => { active = false; };
    void (supabase as any).rpc("get_o_level_class_position", { p_term_id: marks.termId, p_class_id: activeClass.id, p_learner_id: learner.id, p_report_card_type: "END_OF_TERM" }).then((result: any) => {
      if (active && !result.error) setPosition(result.data ?? null);
    });
    return () => { active = false; };
  }, [policy?.showClassPosition, school.schoolId, marks.termId, activeClass?.id, learner?.id]);

  useEffect(() => {
    let active = true;
    setProfile(null); setProfileError("");
    if (!school.schoolId || !learner?.id || !supabase) return () => { active = false; };
    void (supabase as any).from("learners").select("gender,date_of_birth,photo_url").eq("school_id",school.schoolId).eq("id",learner.id).maybeSingle().then((result: any) => {
      if (!active) return;
      if (result.error) setProfileError("Learner identity details could not be loaded for this draft.");
      else setProfile(result.data ?? null);
    });
    return () => { active = false; };
  }, [school.schoolId, learner?.id]);

  return <div className="report-page connected-o-report">
    <header className="page-heading report-page-heading"><div><span className="eyebrow">O-LEVEL · CONNECTED MARKS</span><h1>O-Level report card</h1><p>Live draft using the selected completed Activities of Integration and examination records. The approved school conversion and grades remain in use.</p></div><div className="report-heading-actions"><Link className="secondary-button" to="/results/approvals">Open approvals</Link><button type="button" className="secondary-button" disabled={marks.loading} onClick={() => void marks.reload()}><RefreshCw size={16}/> Refresh marks</button><button type="button" className="secondary-button" disabled={!learner || !complete || Boolean(policyError)} onClick={() => window.print()}><Printer size={16}/> Print draft</button></div></header>
    <section className="panel report-controls" aria-label="O-Level report selection"><label><span>Term</span><select value={marks.termId} onChange={(event) => marks.selectTerm(event.target.value)}>{marks.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label><label><span>Class</span><select value={activeClass?.id ?? ""} onChange={(event) => { setClassId(event.target.value); setLearnerId(""); }}><option value="" disabled>No class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Learner</span><select value={learner?.id ?? ""} onChange={(event) => setLearnerId(event.target.value)}><option value="" disabled>No learner</option>{learners.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.admissionNumber}</option>)}</select></label></section>
    {marks.error && <p className="form-error-message" role="alert">{marks.error}</p>}{profileError && <p className="form-error-message" role="alert">{profileError}</p>}{policyError && <p className="form-error-message" role="alert">{policyError}</p>}
    <p className="report-draft-notice"><FileText size={18}/><span><strong>Live draft—not an issued report.</strong> {complete ? `All displayed subjects have ${policy?.reflectedAoiCount} selected completed activities and an examination mark.` : "The required completed activities, saved contribution, or examination marks are missing; no final grade or average is invented."} Comments, project work, attendance and fees remain unverified. Approval, immutable snapshot and publication are separate workflows.</span></p>
    {!learner ? <section className="panel report-empty"><h2>No learner in this context</h2><p>Choose a term and class with an active O-Level learner. <Link to="/marks/entry">Open marks entry</Link>.</p></section> : <div className="report-paper-wrap"><article className={`report-paper report-paper-draft connected-o-paper${complete ? "" : " report-paper-incomplete"}`} style={{ "--report-primary":header.primaryColour,"--report-secondary":header.secondaryColour } as CSSProperties} aria-label={`Draft O-Level report card for ${learner.name}`}>
      {!complete && <p className="report-print-blocked">This O-Level report cannot be printed: required selected activities, saved contribution, or examination results are incomplete.</p>}
      {school.schoolLogo && <div className="report-badge-watermark" aria-hidden="true"><img src={school.schoolLogo} alt=""/></div>}
      <div className="report-watermark" aria-hidden="true">DRAFT · NOT FOR ISSUE</div>
      <div className="connected-o-school-header"><div className="connected-o-badge">{school.schoolLogo ? <img src={school.schoolLogo} alt={`${school.schoolName} badge`}/> : <span>Badge not set</span>}</div><div><h2>{school.schoolName}</h2><p>{profileMatchesSchool && settings.profile.physicalAddress || "School address not recorded"} · {profileMatchesSchool && settings.profile.primaryTelephone || "Contact not recorded"}</p>{profileMatchesSchool && settings.profile.officialEmail && <p>{settings.profile.officialEmail}</p>}{profileMatchesSchool && settings.profile.motto && <em>{settings.profile.motto}</em>}</div><div className="connected-o-photo">{profile?.photo_url ? <img src={profile.photo_url} alt={`${learner.name} portrait`}/> : <span>Photo not recorded</span>}</div></div>
      <h3 className="connected-o-title">Ordinary Level End of Term Report Card · {school.academicYearName} · {school.termName}</h3>
      <dl className="connected-o-identity"><div><dt>Name</dt><dd>{learner.name}</dd></div><div><dt>Gender</dt><dd>{profile?.gender || "Not recorded"}</dd></div><div><dt>Date of birth</dt><dd>{profile?.date_of_birth || "Not recorded"}</dd></div><div><dt>Admission / Roll No.</dt><dd>{learner.admissionNumber || "Not recorded"}</dd></div><div><dt>Class</dt><dd>{activeClass?.name}</dd></div><div><dt>Stream</dt><dd>{classOfferings.find((item) => item.learners.some((candidate) => candidate.id === learner.id))?.streamName || "Not recorded"}</dd></div></dl>
      <div className="connected-o-table-wrap"><table className="connected-o-results"><thead><tr><th>Code</th><th>Subject</th><th>Selected AoIs</th><th>AoI /20</th><th>EOT /80</th><th>Total /100</th><th>Grade</th><th>Comment</th><th>Score /3</th></tr></thead><tbody>{results.map(({offering,row,preview,selection}) => <tr key={offering.id}><td>{offering.subjectCode}</td><td>{offering.subjectName}</td><td>{selection?.state === "COMPLETE" ? `${selection.selected.length} of ${selection.recorded.length}` : `Incomplete · ${selection?.completed ?? 0}/${selection?.required ?? "?"}`}</td><td>{selection?.state === "COMPLETE" ? shown(selection.contribution) : "—"}</td><td>{shown(row.examMark)}</td><td>{preview.total}</td><td>{preview.gradingAbbreviation || "—"}</td><td>{preview.gradingLabel || "Pending"}</td><td>{preview.threePointScoreDisplayed}</td></tr>)}</tbody></table></div>
      <section className="connected-o-activity-evidence"><h4>Activities selected for this draft</h4><p>Latest completed activity date first. Additional records remain in the register; missing, absent and exempt scores are not selected.</p>{results.map(({offering,selection}) => { const selectedIds = new Set(selection?.selected.map((activity) => activity.id) ?? []); const notSelected = selection?.recorded.filter((activity) => !selectedIds.has(activity.id)) ?? []; return <div key={offering.id}><strong>{offering.subjectName}</strong><span>{selection?.selected.length ? <ul>{selection.selected.map((activity) => <li key={activity.id}>{activity.title} · {activity.date || "date not recorded"} · {shown(activity.score)}/{shown(activity.maximum)} · {formatThreePoint(activity.threePoint)}/3</li>)}</ul> : "No qualifying activities selected."}{notSelected.length > 0 && <small>Recorded but not selected: {notSelected.map((activity) => `${activity.title} (${activity.status.toLowerCase()})`).join(" · ")}</small>}</span></div>; })}</section>
      <div className="connected-o-summary"><div><span>Overall average</span><strong>{average === null ? "—" : `${average.toFixed(1)}%`}</strong></div><div><span>Overall achievement</span><strong>{overallBand?.label ?? "Pending"}</strong></div><div><span>Overall score /3</span><strong>{overallScore === null ? "—" : formatThreePoint(overallScore)}</strong></div>{policy?.showClassPosition && <div><span>Class position</span><strong>{position?.state === "READY" && position.position != null ? `${position.position} of ${position.outOf}` : "Awaiting approved complete results"}</strong></div>}</div>
      <section className="connected-o-key"><h4>Approved school grading key</h4><p>{activeOLLevelGradingConfiguration.bands.map((band) => `${band.minimumPercentage}–${Math.floor(band.maximumPercentage)}% ${band.label} (${band.abbreviation})`).join(" · ")}</p><small>Each selected raw activity score is normalized to /100 and uses the approved piecewise 3-point conversion; their mean is scaled to /20. Exam raw /100 is scaled to /80. The total /100 uses the approved final conversion and grades.</small></section>
      <section className="connected-o-unavailable"><h4>Project / practical work</h4><p>Not recorded in the connected marks source.</p></section>
      <div className="connected-o-comments"><section><h4>Class Teacher’s comment</h4><p>Not recorded in the connected report workflow.</p><span>Signature withheld on draft</span></section><section><h4>Headteacher’s comment</h4><p>Not recorded in the connected report workflow.</p><span>Authorized signature withheld until approved publication</span></section></div>
      <div className="connected-o-footer"><span>Date issued: Not issued</span><span>Next term: {nextTerm || "Not confirmed"}</span><span>Fees: Not connected</span></div>
      <p className="connected-o-integrity">Live academic evidence · {school.schoolName} · {learner.admissionNumber} · draft preview only. An official report requires a persistent approved snapshot and publication.</p>
    </article></div>}
  </div>;
}
