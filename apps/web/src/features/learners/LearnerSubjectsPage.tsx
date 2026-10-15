import { ArrowLeft, BookOpen, CheckCircle2, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { currentUser } from "../../config/currentUser";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
import { usePersistentLearners } from "./PersistentLearners";

type Choice = {
  offeringId: string | null;
  schoolOfferingId: string | null;
  systemSubjectId: string;
  schoolActive: boolean;
  classOffered: boolean;
  code: string;
  name: string;
  requirement: "CORE" | "RELIGION_OPTION" | "ELECTIVE" | "SNE_REPLACEMENT";
  category: string | null;
  selected: boolean;
  selectionType: string | null;
  available: boolean;
  availabilityReason: string | null;
  hasHistory: boolean;
};
type ChoiceWorkspace = {
  classLevel: number;
  className: string;
  streamName: string | null;
  academicYearId: string;
  academicYearName: string;
  curriculumVersion: string;
  learnerId: string;
  enrolmentId: string;
  requiredCount: number;
  electiveMin: number;
  electiveMax: number;
  religionMin: number;
  religionMax: number;
  sneReplacement?: boolean;
  subjects: Choice[];
};

export function LearnerSubjectsPage() {
  const { learnerId } = useParams();
  const context = useSchoolContext();
  const learners = usePersistentLearners();
  const learner = learners.learners.find(item => item.id === learnerId);
  const enrolmentId = learner?.enrolment?.id ?? "";
  const [data, setData] = useState<ChoiceWorkspace | null>(null);
  const [religionIds, setReligionIds] = useState<string[]>([]);
  const [electiveIds, setElectiveIds] = useState<string[]>([]);
  const [initialReligionIds, setInitialReligionIds] = useState<string[]>([]);
  const [initialElectiveIds, setInitialElectiveIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [setupChoice, setSetupChoice] = useState<Choice | null>(null);
  const [setupReason, setSetupReason] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState("");
  const requestNumber = useRef(0);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const actionAttempted = useRef(false);

  const reload = useCallback(async (): Promise<ChoiceWorkspace | null> => {
    const request = ++requestNumber.current;
    if (!enrolmentId || learner?.enrolment?.programme !== "O_LEVEL") return null;
    setLoading(true);
    setError("");
    try {
      if (!supabase) throw new Error("Supabase is not configured for this deployment.");
      const result = await (supabase as any).rpc("get_o_level_learner_subject_choices", { p_enrolment_id: enrolmentId });
      if (result.error) throw new Error(result.error.message);
      if (request !== requestNumber.current) return null;
      const workspace = result.data as ChoiceWorkspace;
      setData(workspace);
      const nextReligion = workspace.subjects.filter(item => item.requirement === "RELIGION_OPTION" && item.selected && item.offeringId).map(item => item.offeringId as string);
      const nextElectives = workspace.subjects.filter(item => item.requirement === "ELECTIVE" && item.selected && item.offeringId).map(item => item.offeringId as string);
      setReligionIds(nextReligion);
      setElectiveIds(nextElectives);
      setInitialReligionIds(nextReligion);
      setInitialElectiveIds(nextElectives);
      return workspace;
    } catch (reason) {
      if (request === requestNumber.current) setError(`Learner subjects could not be refreshed: ${reason instanceof Error ? reason.message : "Unexpected connection error."}`);
      return null;
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, [enrolmentId, learner?.enrolment?.programme]);
  useEffect(() => { void reload(); return () => { requestNumber.current++; }; }, [reload]);
  useEffect(() => {
    if (actionAttempted.current && (error || notice)) feedbackRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [error, notice]);

  const historyAffected = useMemo(() => data?.subjects.filter(item => item.offeringId && item.hasHistory && item.selected
    && ((item.requirement === "ELECTIVE" && initialElectiveIds.includes(item.offeringId) && !electiveIds.includes(item.offeringId))
      || (item.requirement === "RELIGION_OPTION" && initialReligionIds.includes(item.offeringId) && !religionIds.includes(item.offeringId)))) ?? [],
  [data, electiveIds, initialElectiveIds, initialReligionIds, religionIds]);

  async function persist(reason = "") {
    if (!data || busy) return;
    actionAttempted.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!supabase) throw new Error("Supabase is not configured for this deployment.");
      const result = await (supabase as any).rpc("set_o_level_learner_subject_choices", {
        p_enrolment_id: data.enrolmentId,
        p_religion_offering_ids: religionIds,
        p_elective_offering_ids: electiveIds,
        p_change_reason: reason.trim() || null,
      });
      if (result.error) throw new Error(result.error.message);
      const successMessage = `${result.data.requiredCount} required and ${result.data.electiveCount} elective subject${result.data.electiveCount === 1 ? "" : "s"} saved for this learner.`;
      setConfirmOpen(false);
      setChangeReason("");
      const refreshed = await reload();
      const selectedReligion = refreshed?.subjects.filter(item => item.requirement === "RELIGION_OPTION" && item.selected).map(item => item.offeringId) ?? [];
      const selectedElectives = refreshed?.subjects.filter(item => item.requirement === "ELECTIVE" && item.selected).map(item => item.offeringId) ?? [];
      if (refreshed && selectedReligion.length === religionIds.length && selectedElectives.length === electiveIds.length
        && religionIds.every(id => selectedReligion.includes(id)) && electiveIds.every(id => selectedElectives.includes(id))) {
        setNotice(successMessage);
      } else {
        setError("The database accepted the learner-subject save, but the refreshed selection did not confirm every choice. Do not submit again; refresh this learner and review the saved subjects.");
      }
    } catch (reason) {
      setError(`Learner-subject save could not be confirmed. Refresh this learner before retrying to avoid duplicate or conflicting changes. ${reason instanceof Error ? reason.message : "Unexpected connection error."}`);
    } finally { setBusy(false); }
  }

  function requestSave() {
    if (historyAffected.length) { setConfirmOpen(true); return; }
    void persist();
  }

  async function activateAndOffer() {
    if (!setupChoice || !learner?.enrolment || !context.schoolId || !data || setupBusy) return;
    if (!setupChoice.schoolActive && !setupReason) return;
    if (!supabase) { setSetupError("Supabase is not configured for this deployment."); return; }
    if (!setupChoice.systemSubjectId) {
      setSetupError("The learner-subject service did not return this catalogue subject's ID. Nothing was changed. Refresh this page; if the ID is still missing, the O-Level selection database function must be updated.");
      return;
    }
    if (setupChoice.schoolActive && !setupChoice.schoolOfferingId) {
      setSetupError("The learner-subject service did not return the active school offering ID. Nothing was changed. Refresh before trying to offer this subject.");
      return;
    }
    actionAttempted.current = true;
    setSetupBusy(true); setSetupError(""); setError(""); setNotice("");
    let schoolOfferingId = setupChoice.schoolOfferingId;
    let activated = false;
    try {
      if (!setupChoice.schoolActive) {
        const activatedResult = await (supabase as any).rpc("set_school_catalogue_subject_status", {
          p_school_id: context.schoolId,
          p_academic_year_id: data.academicYearId,
          p_system_subject_id: setupChoice.systemSubjectId,
          p_active: true,
          p_reason: setupReason,
        });
        if (activatedResult.error) throw new Error(activatedResult.error.message);
        schoolOfferingId = typeof activatedResult.data === "string" ? activatedResult.data : null;
        if (!schoolOfferingId) throw new Error("Supabase did not return the active school-subject offering ID.");
        activated = true;
      }
      if (!setupChoice.classOffered) {
        if (!schoolOfferingId) throw new Error("The active school subject offering could not be identified. Open Subject Settings and verify its status.");
        const offeredResult = await (supabase as any).rpc("offer_subject_to_class", {
          p_class_id: learner.enrolment.classId,
          p_school_subject_offering_id: schoolOfferingId,
          p_is_compulsory: false,
        });
        if (offeredResult.error) throw new Error(offeredResult.error.message);
      }
      const refreshed = await reload();
      const savedChoice = refreshed?.subjects.find(item => item.systemSubjectId === setupChoice.systemSubjectId);
      setSetupChoice(null); setSetupReason(""); setSetupError("");
      if (savedChoice?.schoolActive && savedChoice.classOffered && savedChoice.available && savedChoice.offeringId) {
        setNotice(`${setupChoice.name} is active for this school year and offered to this class. It is ready to select for this learner.`);
      } else {
        setError(`${setupChoice.name} was submitted, but the refreshed learner-subject data did not confirm an active class offering. Do not submit again yet; refresh this page and inspect the class offering.`);
      }
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : "Unexpected connection error.";
      if (activated && schoolOfferingId) {
        setSetupChoice(current => current ? { ...current, schoolActive: true, schoolOfferingId } : current);
        setSetupReason("");
        setSetupError(`${setupChoice.name} is active for this school year, but the class offer was not confirmed. Retry “Offer to class” here. ${detail}`);
      } else {
        setSetupError(/set_school_catalogue_subject_status.*schema cache/i.test(detail)
          ? "The activation request did not include the required catalogue subject ID, or the database schema cache is stale. Nothing was changed. Refresh this page and verify the O-Level selection service before retrying."
          : `The subject was not activated. ${detail}`);
      }
    } finally { setSetupBusy(false); }
  }

  if (learners.loading || loading) return <section className="panel">Loading learner subjects…</section>;
  if (!learner || !learner.enrolment) return <section className="panel"><h1>Learner enrolment unavailable</h1><Link to="/school/learners">Back to Learners</Link></section>;
  if (learner.enrolment.programme !== "O_LEVEL") return <section className="panel"><h1>O-Level subjects only</h1><p>A-Level subjects follow the learner’s combination.</p><Link to="/school/learners">Back to Learners</Link></section>;
  const learnerClassId = learner.enrolment.classId;
  const core = data?.subjects.filter(item => item.requirement === "CORE" || item.requirement === "SNE_REPLACEMENT") ?? [];
  const religion = data?.subjects.filter(item => item.requirement === "RELIGION_OPTION") ?? [];
  const electives = data?.subjects.filter(item => item.requirement === "ELECTIVE") ?? [];
  const missingActivationIds = electives.some(item => !item.schoolActive && !item.systemSubjectId);
  const validElectives = electiveIds.length >= (data?.electiveMin ?? 1) && electiveIds.length <= (data?.electiveMax ?? 1);
  const validReligion = religionIds.length >= (data?.religionMin ?? ((data?.classLevel ?? 1) <= 2 ? 1 : 0))
    && religionIds.length <= (data?.religionMax ?? ((data?.classLevel ?? 1) <= 2 ? 1 : 0));
  const religionValidationMessage = data?.religionMin === 1 && data?.religionMax === 1
    ? "Select one available CRE or IRE subject before saving."
    : `Select ${data?.religionMin ?? 1}${data?.religionMax !== data?.religionMin ? `–${data?.religionMax}` : ""} available Religious Education option(s) for this curriculum group.`;
  const coreReady = core.length > 0 && core.every(item => item.selected && item.available);

  return <>
    <Link className="profile-back-button" to="/school/learners"><ArrowLeft size={16} /> Back to Learners</Link>
    <header className="page-heading"><div><span className="eyebrow">NCDC LEARNER SUBJECTS</span><h1>{learner.firstName} {learner.lastName}</h1><p>{learner.admissionNumber} · {data?.className ?? learner.enrolment.className} · {data?.streamName ?? learner.enrolment.streamName ?? "No stream"}</p></div></header>
    {data && <section className="learner-subject-context" aria-label="Subject selection context"><span><small>Academic year</small><strong>{data.academicYearName}</strong></span><span><small>Curriculum version</small><strong>{data.curriculumVersion}</strong></span><span><small>Class</small><strong>Senior {data.classLevel}</strong></span><span><small>Stream</small><strong>{data.streamName ?? "All streams"}</strong></span></section>}
    <div ref={feedbackRef}>{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success-message" role="status">{notice}</p>}</div>
    {missingActivationIds && <div className="ncdc-curriculum-warning elective-service-warning" role="alert"><ShieldAlert size={17} /><span>Subject activation is unavailable because the live learner-subject service omitted catalogue IDs. No activation will be attempted. <button type="button" onClick={() => void reload()}>Refresh subject data</button> or ask the administrator to update the O-Level selection service.</span></div>}
    {!data && !loading && !error && <div className="form-error-message" role="alert">Curriculum and learner selection data are not available. Check that the learner’s O-Level class has an active curriculum and class offerings.</div>}
    <section className="panel"><div className="panel-heading"><div><h2>Required subjects</h2><p>{data?.sneReplacement ? "Platform-approved SNE policy replaces Physics, Biology and Chemistry with General Science. Earlier subject records and marks remain in history." : "Assigned automatically from the class curriculum. Their saved history remains with this enrolment."}</p></div><strong>{core.filter(item => item.selected && item.available).length} / {core.length} ready</strong></div><div className="ncdc-elective-grid">{core.map((item,index) => <article className={`ncdc-readonly-subject ${item.available ? "is-available" : "is-unavailable"}`} key={`${item.code}-${index}`}><BookOpen size={17} /><span><strong>{item.code} · {item.name}</strong><small>{item.requirement === "SNE_REPLACEMENT" ? "Approved SNE replacement" : item.selected && item.available ? "Assigned to this learner" : "Needs class or school-offering correction"}{!item.available && item.availabilityReason && <em>{item.availabilityReason}</em>}</small></span>{item.selected && item.available && <CheckCircle2 size={17} aria-label="Assigned" />}</article>)}</div>{core.length > 0 && !coreReady && <p className="ncdc-curriculum-warning"><ShieldAlert size={17} /> One or more compulsory subjects are missing or unavailable. Correct the class offering before saving learner choices.</p>}</section>
    {religion.length > 0 && <section className="panel"><div className="panel-heading"><div><h2>Religious Education</h2><p>Choose {data?.religionMin ?? 1}{data?.religionMax !== data?.religionMin ? `–${data?.religionMax}` : ""} currently available option(s) in the curriculum group. This choice is learner-specific and does not infer religion.</p></div><strong>{religionIds.length} of {data?.religionMax ?? 1}</strong></div><div className="ncdc-elective-grid">{religion.map((item,index) => <label className={!item.available ? "subject-choice-unavailable" : ""} key={`${item.code}-${index}`} title={!item.available ? item.availabilityReason ?? "Not available" : undefined}><input type={data?.religionMin===1&&data?.religionMax===1?"radio":"checkbox"} name="religion" checked={Boolean(item.offeringId && religionIds.includes(item.offeringId))} disabled={(!item.available && !religionIds.includes(item.offeringId ?? ""))||(!religionIds.includes(item.offeringId??"")&&religionIds.length>=(data?.religionMax??1))} onChange={(event) => item.offeringId && setReligionIds(current => event.target.checked ? (data?.religionMax===1?[item.offeringId as string]:[...new Set([...current,item.offeringId as string])]) : current.filter(id=>id!==item.offeringId))} /><span><strong>{item.code} · {item.name}</strong><small>{item.available ? "Available for this class/stream" : item.availabilityReason ?? "Not available"}</small></span></label>)}</div></section>}
    <section className="panel"><div className="panel-heading"><div><h2>Elective choices</h2><p>Senior {data?.classLevel}: choose {data?.electiveMin}–{data?.electiveMax} active subjects offered to this class and stream. Choices are saved for this learner only. S3 and S4 learners may each select up to two offered electives where the active curriculum rule permits it.</p></div><strong>{electiveIds.length} / {data?.electiveMax ?? 0} selected</strong></div><div className="ncdc-elective-grid">{electives.map((item,index) => {
      const selected = Boolean(item.offeringId && electiveIds.includes(item.offeringId));
      const lockedByLimit = !selected && electiveIds.length >= (data?.electiveMax ?? 0);
      return <div className={`elective-choice-card ${!item.available ? "subject-choice-unavailable" : ""}`} key={`${item.code}-${index}`}><label title={!item.available ? item.availabilityReason ?? "Not available" : undefined}><input type="checkbox" checked={selected} disabled={(!item.available && !selected) || lockedByLimit} onChange={() => item.offeringId && setElectiveIds(current => current.includes(item.offeringId as string) ? current.filter(id => id !== item.offeringId) : [...current, item.offeringId as string])} /><span><strong>{item.code} · {item.name}</strong><small>{item.available ? item.category?.replaceAll("_", " ") ?? "Elective" : item.availabilityReason ?? "Not available"}</small></span></label>{!item.available && currentUser.role === "SCHOOL_ADMIN" && (!item.systemSubjectId || (item.schoolActive && !item.schoolOfferingId) ? <span className="elective-setup-unavailable">Setup needs refreshed database subject IDs</span> : <button type="button" className="elective-setup-button" disabled={setupBusy} onClick={() => { setSetupChoice(item); setSetupReason(""); setSetupError(""); }}>{item.schoolActive ? "Offer to this class" : "Activate & offer"}</button>)}{!item.available && currentUser.role !== "SCHOOL_ADMIN" && <Link className="elective-setup-link" to={item.schoolActive ? `/setup/classes/${learnerClassId}` : "/school/o-level/subjects"}>{item.schoolActive ? "Ask School Admin to offer this" : "Ask School Admin to activate"}</Link>}</div>;
    })}{!electives.length && <p>No electives have been offered to this class. Open the <Link to={`/setup/classes/${learnerClassId}`}>class workspace</Link>.</p>}</div>
      {!validReligion && <p className="ncdc-curriculum-warning"><ShieldAlert size={17} /> {religionValidationMessage}</p>}
      {!validElectives && <p className="ncdc-curriculum-warning"><ShieldAlert size={17} /> Select between {data?.electiveMin} and {data?.electiveMax} electives before saving.</p>}
      {historyAffected.length > 0 && <p className="subject-history-warning"><ShieldAlert size={17} /> Changing this selection affects {historyAffected.length} subject{historyAffected.length === 1 ? "" : "s"} with existing assessment, mark, or report history. Previous records will be retained.</p>}
      <div className="form-actions"><button className="primary-button" type="button" disabled={busy || !validElectives || !validReligion || !coreReady || !data} onClick={requestSave}>{busy ? "Saving…" : "Save learner subjects"}</button></div>
    </section>
    <ConfirmDialog open={confirmOpen} title="Confirm change to learner subjects" description="This learner has existing academic records for one or more subjects being removed." confirmLabel="Save subject changes" busy={busy} confirmDisabled={changeReason.trim().length < 12} impact="Removed subjects will no longer appear in the learner’s active marks-entry roster." preserved="Existing marks, assessment records and published reports remain unchanged and available in history." reversible={false} destination="The learner’s updated active subject list" onConfirm={() => void persist(changeReason)} onCancel={() => { if (!busy) setConfirmOpen(false); }}>
      <p>The following subjects have existing history:</p><ul className="subject-history-list">{historyAffected.map((item,index) => <li key={`${item.code}-${index}`}><strong>{item.code} · {item.name}</strong><span>Historical marks, assessment setup or reports exist</span></li>)}</ul>
      <label className="subject-change-reason">Reason for this change<textarea value={changeReason} onChange={event => setChangeReason(event.target.value)} minLength={12} rows={3} placeholder="Explain why this learner’s subject selection is changing" required /></label>
      {changeReason.trim().length > 0 && changeReason.trim().length < 12 && <small className="form-field-hint">Enter at least 12 characters so the audit trail is meaningful.</small>}
    </ConfirmDialog>
    <ConfirmDialog open={Boolean(setupChoice)} title={setupChoice?.schoolActive ? "Offer elective to this class" : "Activate and offer elective"} description={setupChoice?.schoolActive ? "This makes the subject available to every learner in this class who meets the curriculum and stream rules." : "This activates the catalogue subject for the selected school year, then offers it to this class."} confirmLabel={setupChoice?.schoolActive ? "Offer to class" : "Activate & offer"} busy={setupBusy} confirmDisabled={!setupChoice?.schoolActive && !setupReason} error={setupError} impact="The subject becomes eligible for learner selection after the page refreshes." onConfirm={() => void activateAndOffer()} onCancel={() => { if (!setupBusy) { setSetupChoice(null); setSetupReason(""); setSetupError(""); } }}>
      {setupChoice && <><p><strong>{setupChoice.code} · {setupChoice.name}</strong><br />Senior {data?.classLevel} · {data?.academicYearName}</p>{!setupChoice.schoolActive && <label className="subject-change-reason">Reason for activation<select value={setupReason} onChange={event => setSetupReason(event.target.value)} required><option value="">Select a reason</option><option value="Part of the school's approved curriculum offering">Part of the school's approved curriculum offering</option><option value="Required by current learner enrolment and subject choices">Required by current learner enrolment and subject choices</option><option value="Qualified teacher and timetable capacity are available">Qualified teacher and timetable capacity are available</option><option value="Approved by school academic leadership">Approved by school academic leadership</option></select></label>}</>}
    </ConfirmDialog>
  </>;
}
