import { ArrowLeft, BookOpen, CalendarDays, Phone, UserRound, Users } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { currentUser } from "../../config/currentUser";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
import { usePersistentLearners } from "./PersistentLearners";
import { ProfilePhotoEditor } from "../profile/ProfilePhotoEditor";
import { announceProfilePhotoChange, getProfilePhotoUrl, saveLearnerProfilePhoto } from "../profile/profilePhotoStorage";
import { LearnerGuardianLinksPanel } from "./LearnerGuardianLinksPanel";

export default function PersistentLearnerProfilePage() {
  const { learnerId } = useParams();
  const { schoolId } = useSchoolContext();
  const workspace = usePersistentLearners();
  const learner = workspace.learners.find((item) => item.id === learnerId);
  const [completionStatus, setCompletionStatus] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getProfilePhotoUrl(learner?.profilePhotoPath).then((url) => { if (active) setPhotoUrl(url); });
    return () => { active = false; };
  }, [learner?.profilePhotoPath]);
  useEffect(() => {
    if (!schoolId || !learnerId) { setCompletionStatus(""); return; }
    let active = true;
    void (supabase as any).rpc("get_school_learner_completion_status", { p_school_id: schoolId, p_learner_id: learnerId }).then(({ data, error }: { data: { completionStatus?: string } | null; error: { message: string } | null }) => {
      if (active) setCompletionStatus(error ? "" : data?.completionStatus ?? "");
    });
    return () => { active = false; };
  }, [learnerId, schoolId]);
  const canManage = currentUser.role === "SCHOOL_ADMIN" && currentUser.permissions.includes("users.manage");
  const [editing, setEditing] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [targetClassId, setTargetClassId] = useState("");
  const [targetStreamId, setTargetStreamId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [transferReason, setTransferReason] = useState("");
  const eligibleClasses = useMemo(() => workspace.classes.filter((item) => item.status === "ACTIVE" && item.academicYearId === learner?.enrolment?.academicYearId), [workspace.classes, learner?.enrolment?.academicYearId]);
  const targetClass = eligibleClasses.find((item) => item.id === targetClassId);
  if (workspace.loading) return <section className="panel"><p role="status">Loading learner record for the selected school…</p></section>;
  if (workspace.error) return <section className="panel"><div className="form-error-message" role="alert">{workspace.error}</div><Link className="secondary-button" to="/learners">Back to learners</Link></section>;
  if (!learner) return <section className="panel"><h1>Learner not found</h1><p>This learner is not visible in the selected school.</p><Link className="secondary-button" to="/learners">Back to learners</Link></section>;
  const currentLearner = learner;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    const values = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    const result = await workspace.updateLearnerProfile({
      learnerId: currentLearner.id, firstName: String(values.get("firstName") ?? ""),
      otherName: String(values.get("otherName") ?? ""), lastName: String(values.get("lastName") ?? ""),
      gender: String(values.get("gender") ?? ""), dateOfBirth: String(values.get("dateOfBirth") ?? ""),
      guardianName: String(values.get("guardianName") ?? ""), guardianPhone: String(values.get("guardianPhone") ?? ""),
    });
    setBusy(false);
    if (result) { setError(`Learner profile was not saved: ${result}`); return; }
    setEditing(false); setNotice("Learner profile saved.");
  }

  async function saveTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !targetClass || !transferReason.trim()) return;
    setBusy(true); setError(""); setNotice("");
    const result = await workspace.transferLearner({ learnerId: currentLearner.id, classId: targetClass.id, streamId: targetStreamId || null, effectiveFrom, reason: transferReason.trim() });
    setBusy(false);
    if (result) { setError(`Transfer was not confirmed: ${result}`); return; }
    setTransferring(false); setTransferReason(""); setTargetClassId(""); setTargetStreamId(""); setNotice("Learner transfer saved. The prior enrolment remains in the history.");
  }

  return <>
    <Link className="profile-back-button" to="/learners"><ArrowLeft size={16} /> Back to learners</Link>
    <section className="learner-profile-header">
      <div className="learner-profile-identity"><div className="learner-profile-avatar" aria-hidden="true">{photoUrl ? <img src={photoUrl} alt="" /> : `${learner.firstName[0] ?? ""}${learner.lastName[0] ?? ""}`}</div><div><span className="eyebrow">LEARNER PROFILE</span><h1>{[learner.firstName, learner.otherName, learner.lastName].filter(Boolean).join(" ")}</h1><p>Admission number {learner.admissionNumber}</p><span className={`status-badge ${learner.status === "ACTIVE" ? "status-active" : "status-inactive"}`}>{learner.status}</span>{completionStatus && completionStatus !== "NONE" && <span className="status-badge status-cycle-completed">{completionStatus === "COMPLETED_O_LEVEL" ? "Completed O-Level Cycle" : completionStatus === "COMPLETED_A_LEVEL" ? "Completed A-Level Cycle" : "Graduated"}</span>}</div></div>
      {canManage && <div className="session-row-actions"><button className="secondary-button" type="button" onClick={() => { setEditing((value) => !value); setTransferring(false); setError(""); }}>Edit learner</button>{learner.enrolment && <><button className="secondary-button" type="button" onClick={() => { setTransferring((value) => !value); setEditing(false); setError(""); }}>Transfer class</button><Link className="secondary-button" to={`/id-cards?type=LEARNER&person=${encodeURIComponent(learner.id)}`}>Issue learner ID</Link></>}{completionStatus === "COMPLETED_O_LEVEL" && !learner.enrolment && <Link className="primary-button" to={`/learners/${learner.id}/admit-a-level`}>Start A-Level admission</Link>}</div>}
    </section>
    {notice && <p className="form-success-message" role="status">{notice}</p>}
    {error && <div className="form-error-message" role="alert">{error}</div>}
    {canManage && schoolId && <LearnerGuardianLinksPanel schoolId={schoolId} learnerId={learner.id} />}
    {canManage && <section className="panel"><div className="panel-heading"><div><h2>Learner photo</h2><p>Optional and private to this school. Initials are used when no photo is set.</p></div></div><ProfilePhotoEditor name={`${learner.firstName} ${learner.lastName}`} initials={`${learner.firstName[0] ?? ""}${learner.lastName[0] ?? ""}`} photoUrl={photoUrl} onSave={async (file) => {
      try {
        const saved = await saveLearnerProfilePhoto(schoolId, learner.id, file, learner.profilePhotoPath);
        setPhotoUrl(saved.url);
        await workspace.reload();
        announceProfilePhotoChange(saved.url);
        return null;
      } catch (cause) { return cause instanceof Error ? cause.message : "Learner photo could not be saved."; }
    }} /></section>}
    {editing && canManage && <form className="panel" onSubmit={(event) => void saveProfile(event)}><div className="panel-heading"><div><h2>Edit learner information</h2><p>Changes are tenant-authorized and written to the audit log.</p></div></div><div className="form-grid"><Field label="First name"><input name="firstName" required defaultValue={learner.firstName} /></Field><Field label="Other name"><input name="otherName" defaultValue={learner.otherName ?? ""} /></Field><Field label="Last name"><input name="lastName" required defaultValue={learner.lastName} /></Field><Field label="Gender"><select name="gender" defaultValue={learner.gender ?? "Unspecified"}><option>Female</option><option>Male</option><option>Unspecified</option></select></Field><Field label="Date of birth"><input name="dateOfBirth" type="date" defaultValue={learner.dateOfBirth ?? ""} /></Field><Field label="Guardian name"><input name="guardianName" defaultValue={learner.guardianName ?? ""} /></Field><Field label="Guardian phone"><input name="guardianPhone" type="tel" defaultValue={learner.guardianPhone ?? ""} /></Field></div><div className="form-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save learner"}</button></div></form>}
    {transferring && canManage && learner.enrolment && <form className="panel" onSubmit={(event) => void saveTransfer(event)}><div className="panel-heading"><div><h2>Transfer learner</h2><p>Choose an active class in the learner’s current academic year. The previous enrolment is preserved.</p></div></div><div className="form-grid"><Field label="Destination class"><select required value={targetClassId} onChange={(event) => { setTargetClassId(event.target.value); setTargetStreamId(""); }}><option value="">Select class</option>{eligibleClasses.filter((item) => item.programme === learner.enrolment?.programme).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Destination stream"><select required={Boolean(targetClass?.streams.some((item) => item.status === "ACTIVE"))} disabled={!targetClass} value={targetStreamId} onChange={(event) => setTargetStreamId(event.target.value)}><option value="">{targetClass?.streams.length ? "Select stream" : "No stream"}</option>{targetClass?.streams.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Effective from"><input type="date" required value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></Field><Field label="Reason"><input required maxLength={500} value={transferReason} onChange={(event) => setTransferReason(event.target.value)} /></Field></div><div className="form-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setTransferring(false)}>Cancel</button><button className="primary-button" type="submit" disabled={busy || !targetClassId || !transferReason.trim()}>{busy ? "Saving transfer…" : "Save transfer"}</button></div></form>}
    <section className="teacher-profile-grid">
      <article className="panel"><div className="panel-heading"><div><h2><UserRound size={17} /> Personal information</h2><p>Persisted learner identity for the selected tenant.</p></div></div><dl className="profile-details"><div><dt>Admission number</dt><dd>{learner.admissionNumber}</dd></div><div><dt>Gender</dt><dd>{learner.gender || "Not recorded"}</dd></div><div><dt>Date of birth</dt><dd>{learner.sensitiveFieldsVisible === false ? "Restricted" : learner.dateOfBirth || "Not recorded"}</dd></div><div><dt>Account status</dt><dd>{learner.status}</dd></div></dl></article>
      <article className="panel"><div className="panel-heading"><div><h2><CalendarDays size={17} /> Current enrolment</h2><p>Active enrolment and class placement.</p></div></div>{learner.enrolment ? <dl className="profile-details"><div><dt>Academic year</dt><dd>{workspace.academicYears.find((year) => year.id === learner.enrolment?.academicYearId)?.name ?? "Selected year"}</dd></div><div><dt>Programme / class</dt><dd>{learner.enrolment.programme === "O_LEVEL" ? "O-Level" : "A-Level"} · {learner.enrolment.className}</dd></div><div><dt>Stream</dt><dd>{learner.enrolment.streamName || "No stream"}</dd></div><div><dt>Effective from</dt><dd>{learner.enrolment.effectiveFrom}</dd></div></dl> : <p>This learner has no active class enrolment.</p>}</article>
      <article className="panel"><div className="panel-heading"><div><h2><Phone size={17} /> Parent / guardian</h2><p>Contact details held for this learner.</p></div></div>{learner.sensitiveFieldsVisible === false ? <p>Guardian contact details are restricted to the School Administrator.</p> : <dl className="profile-details"><div><dt>Guardian</dt><dd>{learner.guardianName || "Not recorded"}</dd></div><div><dt>Phone</dt><dd>{learner.guardianPhone ? <a href={`tel:${encodeURIComponent(learner.guardianPhone)}`}>{learner.guardianPhone}</a> : "Not recorded"}</dd></div></dl>}</article>
      <article className="panel"><div className="panel-heading"><div><h2><BookOpen size={17} /> Active subject selections</h2><p>Selections joined to this learner's current enrolment.</p></div></div>{learner.activeSubjects?.length ? <ul>{learner.activeSubjects.map((subject) => <li key={subject.id}>{subject.code ? `${subject.code} · ` : ""}{subject.name}</li>)}</ul> : <p>No active subject selections are linked to the current enrolment.</p>}{learner.enrolment?.programme === "O_LEVEL" && <Link className="secondary-button" to={`/learners/${learner.id}/subjects`}>Open subject selection</Link>}</article>
      {learner.historyVisible !== false && <article className="panel"><div className="panel-heading"><div><h2><Users size={17} /> Enrolment and transfer history</h2><p>Historical class records remain visible.</p></div></div>{learner.history.length ? <div className="table-wrapper"><table className="data-table"><thead><tr><th>Class</th><th>Stream</th><th>Status</th><th>From</th><th>To</th></tr></thead><tbody>{learner.history.map((entry) => <tr key={entry.id}><td>{entry.className}</td><td>{entry.streamName || "—"}</td><td>{entry.status}</td><td>{entry.effectiveFrom}</td><td>{entry.effectiveTo || "Current"}</td></tr>)}</tbody></table></div> : <p>No enrolment history is available.</p>}</article>}
    </section>
  </>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}</label>;
}
