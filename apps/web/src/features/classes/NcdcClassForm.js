import { BookOpen, Save, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
import { useNcdcCurriculum } from "./NcdcCurriculum";
import { usePersistentClassSetup } from "./PersistentClassSetup";
export function NcdcClassForm() {
    const setup = usePersistentClassSetup();
    const context = useSchoolContext();
    const navigate = useNavigate();
    const inOLevelWorkspace = useLocation().pathname.startsWith("/school/o-level");
    const [level, setLevel] = useState(1);
    const [name, setName] = useState("");
    const [streams, setStreams] = useState("A");
    const [capacity, setCapacity] = useState("");
    const [teacher, setTeacher] = useState("");
    const [termOverride, setTermOverride] = useState("");
    const [electiveIds, setElectiveIds] = useState([]);
    const [error, setError] = useState("");
    const [savedClassId, setSavedClassId] = useState("");
    const [submissionUncertain, setSubmissionUncertain] = useState(false);
    const [busy, setBusy] = useState(false);
    const year = setup.academicYears.find(item => item.id === context.academicYearId)
        ?? setup.academicYears.find(item => item.status === "ACTIVE") ?? setup.academicYears[0];
    const terms = context.terms.filter(item => item.academicYearId === year?.id);
    const termId = termOverride || (terms.some(item => item.id === context.termId) ? context.termId : terms[0]?.id ?? "");
    const curriculum = useNcdcCurriculum(year?.id ?? "", level, termId);
    const required = curriculum.data?.subjects.filter(item => item.requirement === "CORE" || item.requirement === "RELIGION_OPTION") ?? [];
    const electives = curriculum.data?.subjects.filter(item => item.requirement === "ELECTIVE" && item.available) ?? [];
    const missingCore = required.filter(item => item.requirement === "CORE" && !item.available);
    const activeReligion = required.filter(item => item.requirement === "RELIGION_OPTION" && item.available).length;
    const readyToActivate = missingCore.length === 0 && (level > 2 || activeReligion > 0)
        && electiveIds.length > 0 && Boolean(streams.trim());
    async function save(activate) {
        if (busy)
            return;
        if (savedClassId || submissionUncertain) {
            setError("This class submission may already be saved. Review the class register before trying again.");
            return;
        }
        if (curriculum.loading || curriculum.error || !curriculum.data) {
            setError("The curriculum must finish loading before this class can be saved.");
            return;
        }
        if (!supabase || !setup.schoolId) {
            setError("The school database or selected school is unavailable. Nothing was saved.");
            return;
        }
        if (!year || !termId) {
            setError("Select an academic year and term first.");
            return;
        }
        if (!name.trim()) {
            setError("Enter a class name.");
            return;
        }
        const streamNames = [...new Set(streams.split(",").map(item => item.trim()).filter(Boolean))];
        if (activate && !streamNames.length) {
            setError("Add at least one stream before activating the class.");
            return;
        }
        setBusy(true);
        setError("");
        let rpcReturned = false;
        try {
            const result = await supabase.rpc("create_o_level_curriculum_class", {
                p_school_id: setup.schoolId,
                p_academic_year_id: year.id,
                p_term_id: termId,
                p_level: level,
                p_class_name: name.trim(),
                p_capacity: capacity ? Number(capacity) : null,
                p_class_teacher_user_id: teacher || null,
                p_stream_names: streamNames,
                p_elective_offering_ids: electiveIds,
                p_activate: activate,
            });
            rpcReturned = true;
            if (result.error)
                throw new Error(result.error.message);
            const classId = typeof result.data === "string" ? result.data : "";
            if (!classId) {
                setSubmissionUncertain(true);
                throw new Error("The database did not return a class ID. Review the class register before retrying.");
            }
            setSavedClassId(classId);
            // The create RPC is atomic. Leave this form as soon as it returns the new
            // ID; the destination page reads and verifies the saved record itself.
            navigate(inOLevelWorkspace ? `/school/o-level/classes/${classId}` : `/setup/classes/${classId}`, {
                replace: true,
                state: {
                    classSetupNotice: activate ? "Class activated and saved." : "Draft class saved.",
                    classSetupExpectation: {
                        academicYearId: year.id,
                        programme: "O_LEVEL",
                        level,
                        status: activate ? "ACTIVE" : "DRAFT",
                        streamNames,
                        electiveOfferingIds: electiveIds,
                    },
                },
            });
        }
        catch (failure) {
            if (!rpcReturned)
                setSubmissionUncertain(true);
            setError(failure instanceof Error ? failure.message : "Class save could not be confirmed. Refresh the class register before retrying.");
        }
        finally {
            setBusy(false);
        }
    }
    return <form onSubmit={(event) => { event.preventDefault(); void save(true); }}>
    <section className="panel"><div className="panel-heading"><div><h2>Class identity</h2><p>Use the school academic year and term in the header.</p></div></div>
      <div className="form-grid">
        <label className="form-field"><span>Academic year</span><input value={year?.name ?? "No year configured"} readOnly/></label>
        <label className="form-field"><span>Term</span><select value={termId} onChange={event => setTermOverride(event.target.value)} required><option value="">Select term</option>{terms.map(item => <option key={item.id} value={item.id}>{item.name} · {item.status.replaceAll("_", " ")}</option>)}</select></label>
        <label className="form-field"><span>Class level</span><select value={level} onChange={event => { setLevel(Number(event.target.value)); setElectiveIds([]); }}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>Senior {value}</option>)}</select></label>
        <label className="form-field"><span>Class name</span><input value={name} onChange={event => setName(event.target.value)} placeholder={`Senior ${level}`} required/></label>
        <label className="form-field"><span>Streams</span><input value={streams} onChange={event => setStreams(event.target.value)} placeholder="A, B"/><small>Separate multiple streams with commas.</small></label>
        <label className="form-field"><span>Capacity</span><input type="number" min="1" value={capacity} onChange={event => setCapacity(event.target.value)} placeholder="Optional"/></label>
        <label className="form-field"><span>Class teacher</span><select value={teacher} onChange={event => setTeacher(event.target.value)}><option value="">Assign later</option>{setup.staff.filter(item => ["TEACHER", "HEAD_TEACHER", "DEPUTY_HEAD_TEACHER", "DIRECTOR_OF_STUDIES", "SCHOOL_ADMIN"].includes(item.role)).map(item => <option key={item.userId} value={item.userId}>{item.name} · {item.role.replaceAll("_", " ")}</option>)}</select></label>
      </div>
    </section>
    <section className="panel ncdc-curriculum-panel"><div className="panel-heading"><div><h2>Curriculum structure · Senior {level}</h2><p>{level <= 2 ? "11 compulsory subjects, including one CRE or IRE choice, and one learner elective" : "Seven compulsory subjects and one or two learner electives"}. Choices are saved per learner.</p></div><span className="approval-count">{level <= 2 ? 11 : 7} required</span></div>
      {curriculum.error && <p className="form-error" role="alert">{curriculum.error}</p>}
      {curriculum.loading && <p>Loading subjects from the national catalogue…</p>}
      <div className="ncdc-subject-list">{required.map(subject => <article key={subject.systemSubjectId} className={subject.available ? "" : "ncdc-subject-missing"}><BookOpen size={18}/><div><strong>{subject.name}</strong><small>{subject.code} · {subject.requirement === "RELIGION_OPTION" ? "Religious Education option" : "Required"}</small></div><span>{subject.available ? "Active" : "Needs activation"}</span><span>{subject.teacherAssigned ? "Teacher assigned" : "Teacher not assigned"}</span>{!subject.available && <Link to={`/setup/subjects?search=${encodeURIComponent(subject.code)}`}>Activate subject</Link>}</article>)}</div>
      {missingCore.length > 0 && <p className="ncdc-curriculum-warning"><ShieldAlert size={17}/> {missingCore.length} fixed subject{missingCore.length === 1 ? " needs" : "s need"} activation. You can save a draft now.</p>}
      {curriculum.data && level <= 2 && activeReligion === 0 && <p className="ncdc-curriculum-warning"><ShieldAlert size={17}/> Activate CRE or IRE before activating this class.</p>}
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Available electives</h2><p>Choose subjects to offer to this class, not subjects for an individual learner. Each Senior {level} learner later selects {level <= 2 ? "exactly one" : "one or two"} from this menu.</p></div><strong>{electiveIds.length} offered to class</strong></div>
      <div className="ncdc-elective-grid">{electives.map(subject => <label key={subject.systemSubjectId}><input type="checkbox" checked={Boolean(subject.offeringId && electiveIds.includes(subject.offeringId))} onChange={() => subject.offeringId && setElectiveIds(current => current.includes(subject.offeringId) ? current.filter(id => id !== subject.offeringId) : [...current, subject.offeringId])}/><span><strong>{subject.code} · {subject.name}</strong><small>{subject.category?.replaceAll("_", " ") ?? "Elective"} · Active</small></span></label>)}{!electives.length && !curriculum.loading && <p>No active electives. Activate one in <Link to="/setup/subjects">Subject Settings</Link>.</p>}</div>
    </section>
    <p className="ncdc-class-save-help">Save Draft stores an inactive class for later setup. Save &amp; Activate Class checks compulsory subjects, streams, and the class elective menu before making the class active. Learners choose their own electives afterward.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {savedClassId && error && <Link className="secondary-button" to={inOLevelWorkspace ? `/school/o-level/classes/${savedClassId}` : `/setup/classes/${savedClassId}`}>Open saved class</Link>}
    {submissionUncertain && error && <Link className="secondary-button" to={inOLevelWorkspace ? "/school/o-level/classes" : "/setup/classes"}>Review class register</Link>}
    <div className="form-actions"><Link className="secondary-button" to={inOLevelWorkspace ? "/school/o-level/classes" : "/setup/classes"}>Cancel</Link><button className="secondary-button" type="button" disabled={busy || Boolean(savedClassId) || submissionUncertain || setup.loading || curriculum.loading || Boolean(curriculum.error) || !curriculum.data} onClick={() => void save(false)}><Save size={17}/>{busy ? "Saving…" : "Save Draft"}</button><button className="primary-button" type="submit" disabled={busy || Boolean(savedClassId) || submissionUncertain || setup.loading || curriculum.loading || Boolean(curriculum.error) || !curriculum.data || !readyToActivate}>{busy ? "Saving…" : "Save & Activate Class"}</button></div>
  </form>;
}
