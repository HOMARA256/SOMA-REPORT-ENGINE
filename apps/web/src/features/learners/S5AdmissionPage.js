import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpenCheck } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { currentUser } from "../../config/currentUser";
import { supabase } from "../../config/supabaseClient";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { useSchoolContext } from "../context/SchoolContext";
import { usePersistentLearners } from "./PersistentLearners";
export function S5AdmissionPage() {
    const { learnerId = "" } = useParams();
    const navigate = useNavigate();
    const { schoolId, academicYearId, academicYears } = useSchoolContext();
    const workspace = usePersistentLearners();
    const learner = workspace.learners.find((item) => item.id === learnerId);
    const canManage = currentUser.role === "SCHOOL_ADMIN" && currentUser.permissions.includes("academics.manage");
    const [yearId, setYearId] = useState(academicYearId);
    const [options, setOptions] = useState(null);
    const [classId, setClassId] = useState("");
    const [streamId, setStreamId] = useState("");
    const [combinationId, setCombinationId] = useState("");
    const [effectiveFrom, setEffectiveFrom] = useState("");
    const [reason, setReason] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const selectedClass = options?.classes.find((item) => item.id === classId);
    const selectedCombination = options?.combinations.find((item) => item.id === combinationId);
    const eligibleYears = useMemo(() => academicYears, [academicYears]);
    const loadOptions = useCallback(async () => {
        if (!schoolId || !learnerId || !yearId || !canManage) {
            setOptions(null);
            return;
        }
        setLoading(true);
        setError("");
        const result = await supabase.rpc("get_school_s5_admission_options", { p_school_id: schoolId, p_learner_id: learnerId, p_academic_year_id: yearId });
        setLoading(false);
        if (result.error) {
            setOptions(null);
            setError(result.error.message);
            return;
        }
        setOptions(result.data);
        setClassId("");
        setStreamId("");
        setCombinationId("");
        setEffectiveFrom(result.data?.academicYear?.startsOn ?? "");
    }, [canManage, learnerId, schoolId, yearId]);
    useEffect(() => { void loadOptions(); }, [loadOptions]);
    async function admit() {
        if (!schoolId || !learner || !selectedClass || !selectedCombination || !reason.trim())
            return;
        setBusy(true);
        setError("");
        const result = await supabase.rpc("admit_completed_o_level_learner_to_s5", {
            p_school_id: schoolId,
            p_learner_id: learner.id,
            p_academic_year_id: yearId,
            p_class_id: classId,
            p_stream_id: streamId || null,
            p_combination_id: combinationId,
            p_effective_from: effectiveFrom,
            p_reason: reason.trim(),
        });
        setBusy(false);
        if (result.error) {
            setDialogOpen(false);
            setError(result.error.message);
            return;
        }
        navigate(`/learners/${learner.id}`, { state: { notice: "Separate S5 A-Level admission saved. This was not an automatic promotion." } });
    }
    const closeDialog = useCallback(() => { if (!busy)
        setDialogOpen(false); }, [busy]);
    if (!canManage)
        return <section className="panel" role="alert"><h1>School administrator access required</h1><p>Only an authorised school administrator may admit a completed O-Level learner to S5.</p></section>;
    if (!workspace.loading && (!learner || !learnerId))
        return <section className="panel" role="alert"><h1>Learner not found</h1><p>The selected learner is not in the active school.</p><Link className="secondary-button" to="/learners">Return to learners</Link></section>;
    return <div className="s5-admission-page">
    <Link className="profile-back-button" to={learner ? `/learners/${learner.id}` : "/learners"}><ArrowLeft size={16} aria-hidden="true"/> Back to learner profile</Link>
    <header className="page-heading"><div><span className="eyebrow">SEPARATE A-LEVEL ADMISSION</span><h1>Admit completed learner to S5</h1><p>This creates a new S5 enrolment after O-Level completion. It does not promote the learner or replace their history.</p></div></header>
    {error && <p className="form-error-message" role="alert">{error}</p>}
    {workspace.loading ? <p className="panel" role="status">Loading learner record…</p> : learner && <>
      <section className="panel s5-admission-identity"><div><span className="eyebrow">COMPLETED O-LEVEL LEARNER</span><h2>{[learner.firstName, learner.otherName, learner.lastName].filter(Boolean).join(" ")}</h2><p>{learner.admissionNumber} · The prior cycle remains in learner history.</p></div></section>
      <section className="panel"><div className="panel-heading"><div><h2>New S5 academic admission</h2><p>Select the subsequent school year, an active S5 class, and a verified active A-Level combination.</p></div></div>
        <div className="form-grid s5-admission-form">
          <label className="form-field"><span>Academic year</span><select value={yearId} onChange={(event) => setYearId(event.target.value)}><option value="">Select academic year</option>{eligibleYears.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}</select></label>
          <label className="form-field"><span>S5 class</span><select value={classId} disabled={loading || !options?.classes.length} onChange={(event) => { setClassId(event.target.value); setStreamId(""); }}><option value="">Select S5 class</option>{options?.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="form-field"><span>Stream</span><select value={streamId} disabled={!selectedClass} required={Boolean(selectedClass?.streams.length)} onChange={(event) => setStreamId(event.target.value)}><option value="">{selectedClass?.streams.length ? "Select stream" : "No stream required"}</option>{selectedClass?.streams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="form-field"><span>A-Level combination</span><select value={combinationId} disabled={loading || !options?.combinations.length} onChange={(event) => setCombinationId(event.target.value)}><option value="">Select active combination</option>{options?.combinations.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          <label className="form-field"><span>Admission effective from</span><input type="date" min={options?.academicYear.startsOn} max={options?.academicYear.endsOn} required value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)}/></label>
          <label className="form-field"><span>Admission reason</span><input value={reason} maxLength={500} required onChange={(event) => setReason(event.target.value)} placeholder="Record the authorised admission reason."/></label>
        </div>
      </section>
      {selectedCombination && <section className="panel s5-combination-preview"><div className="panel-heading"><div><h2><BookOpenCheck size={18}/> {selectedCombination.code} · {selectedCombination.name}</h2><p>Subject load for this S5 admission.</p></div><span className="approval-count">{selectedCombination.subjects.length} subjects</span></div><ul>{selectedCombination.subjects.map((subject) => <li key={subject.offeringId}><strong>{subject.name}</strong><span>{subject.code} · {subject.role.replaceAll("_", " ")}</span></li>)}</ul></section>}
      {!loading && options && (!options.classes.length || !options.combinations.length) && <p className="form-info-message" role="status">Set up an active S5 class and active A-Level combination for this school year before admission.</p>}
      <div className="form-actions"><button className="primary-button" type="button" disabled={loading || busy || !classId || !combinationId || !effectiveFrom || !reason.trim() || Boolean(selectedClass?.streams.length && !streamId)} onClick={() => setDialogOpen(true)}>Review S5 admission</button></div>
    </>}
    <ConfirmDialog open={dialogOpen} title="Confirm separate S5 admission?" description="This is a new A-Level admission after O-Level completion, not a promotion." confirmLabel="Admit to S5" busy={busy} error={error} currentState="Completed O-Level cycle" nextState={`Active S5 · ${selectedClass?.name ?? "Class"}`} impact="Creates a new class enrolment and A-Level learner assignment with the selected combination." preserved="Learner identity, O-Level completion, prior enrolments, marks, subjects and audit history." reversible={false} destination="S5 A-Level register" onCancel={closeDialog} onConfirm={() => void admit()}><p>{selectedCombination?.code} · {selectedCombination?.name} · {selectedCombination?.subjects.length ?? 0} subjects</p><p>Reason: {reason}</p></ConfirmDialog>
  </div>;
}
