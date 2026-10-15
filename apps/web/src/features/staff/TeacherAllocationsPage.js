import { AlertTriangle, CheckCircle2, Save, Users } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { currentUser } from "../../config/currentUser";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
function messageOf(error) {
    return error instanceof Error ? error.message : "An unexpected connection error occurred.";
}
function localDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function csvCell(value) {
    const text = String(value ?? "");
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
}
export function TeacherAllocationsPage() {
    const context = useSchoolContext();
    const schoolId = context.schoolId;
    const canManage = currentUser.role === "SCHOOL_ADMIN" && currentUser.permissions.includes("users.manage");
    const [terms, setTerms] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [offerings, setOfferings] = useState([]);
    const [allocations, setAllocations] = useState([]);
    const [termId, setTermId] = useState("");
    const [offeringIds, setOfferingIds] = useState([]);
    const [offeringQuery, setOfferingQuery] = useState("");
    const [teacherId, setTeacherId] = useState("");
    const [role, setRole] = useState("PRIMARY_SUBJECT_TEACHER");
    const [effectiveFrom, setEffectiveFrom] = useState(localDate);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [confirmReplacement, setConfirmReplacement] = useState(false);
    const [replacementReason, setReplacementReason] = useState("");
    const [endingAllocation, setEndingAllocation] = useState(null);
    const [editingAllocation, setEditingAllocation] = useState(null);
    const [editStartDate, setEditStartDate] = useState("");
    const [editEndDate, setEditEndDate] = useState("");
    const [editRole, setEditRole] = useState("PRIMARY_SUBJECT_TEACHER");
    const [editReason, setEditReason] = useState("");
    const [effectiveTo, setEffectiveTo] = useState(localDate);
    const [endReason, setEndReason] = useState("");
    const [filterClass, setFilterClass] = useState("ALL");
    const [filterSubject, setFilterSubject] = useState("ALL");
    const [filterTeacher, setFilterTeacher] = useState("ALL");
    const [filterRole, setFilterRole] = useState("ALL");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const loadVersion = useRef(0);
    const load = useCallback(async () => {
        const version = ++loadVersion.current;
        const isCurrent = () => version === loadVersion.current;
        if (context.loading)
            return { ok: false, error: "Loading school context…" };
        if (!canManage) {
            const reason = "Teacher allocations are restricted to authorised School Administrators.";
            setError(reason);
            return { ok: false, error: reason };
        }
        if (context.error) {
            setError(context.error);
            return { ok: false, error: context.error };
        }
        if (!schoolId) {
            const reason = "Active school context was not found. Select a school and try again.";
            setError(reason);
            return { ok: false, error: reason };
        }
        setLoading(true);
        try {
            const result = await supabase.rpc("get_teacher_allocation_setup", { p_school_id: schoolId });
            if (!isCurrent())
                return { ok: false, error: "A newer school context replaced this allocation request." };
            if (result.error)
                throw new Error(result.error.message);
            const data = result.data ?? {};
            const nextTerms = (Array.isArray(data.terms) ? data.terms : []);
            const nextAllocations = (data.allocations ?? []);
            setTerms(nextTerms);
            const nextTeachers = (Array.isArray(data.teachers) ? data.teachers : [])
                .map((row) => ({
                id: String(row.id ?? row.userId ?? row.user_id ?? ""),
                name: String(row.name ?? row.fullName ?? row.full_name ?? ""),
                email: String(row.email ?? ""),
            }))
                .filter((teacher) => teacher.id && teacher.name);
            setTeachers(nextTeachers);
            setOfferings((data.offerings ?? []));
            setAllocations(nextAllocations);
            setTermId((current) => {
                const preferred = context.termId || current;
                return nextTerms.some((term) => term.id === preferred) ? preferred : nextTerms[0]?.id ?? "";
            });
            setError("");
            return { ok: true, allocations: nextAllocations };
        }
        catch (loadError) {
            const reason = `Could not load teacher allocations: ${messageOf(loadError)}`;
            if (isCurrent()) {
                setError(reason);
                setTerms([]);
                setTeachers([]);
                setOfferings([]);
                setAllocations([]);
            }
            return { ok: false, error: reason };
        }
        finally {
            if (isCurrent())
                setLoading(false);
        }
    }, [canManage, context.error, context.loading, context.termId, schoolId]);
    useEffect(() => {
        if (context.loading) {
            loadVersion.current += 1;
            setTerms([]);
            setTeachers([]);
            setOfferings([]);
            setAllocations([]);
            setError("");
            setLoading(true);
            return;
        }
        void load();
        return () => { loadVersion.current += 1; };
    }, [context.loading, load]);
    const current = useMemo(() => allocations.filter((allocation) => !termId || allocation.termId === termId), [allocations, termId]);
    const filteredCurrent = useMemo(() => current.filter((allocation) => {
        const offering = offerings.find((item) => item.id === allocation.offeringId);
        return (filterClass === "ALL" || offering?.classId === filterClass) &&
            (filterSubject === "ALL" || offering?.subjectCode === filterSubject) &&
            (filterTeacher === "ALL" || allocation.teacherId === filterTeacher) &&
            (filterRole === "ALL" || allocation.role === filterRole) &&
            (filterStatus === "ALL" || allocation.status === filterStatus);
    }), [current, filterClass, filterRole, filterStatus, filterSubject, filterTeacher, offerings]);
    const availableOfferings = useMemo(() => {
        const yearId = terms.find((term) => term.id === termId)?.academicYearId;
        return offerings.filter((offering) => offering.status === "ACTIVE" && (!offering.schoolSubjectStatus || offering.schoolSubjectStatus === "ACTIVE") && (!yearId || offering.academicYearId === yearId));
    }, [offerings, termId, terms]);
    const coverage = useMemo(() => {
        const activeOfferingIds = new Set(current.filter((row) => row.status === "ACTIVE" && row.role === "PRIMARY_SUBJECT_TEACHER").map((row) => row.offeringId));
        const activeTeacherIds = new Set(current.filter((row) => row.status === "ACTIVE").map((row) => row.teacherId));
        const classGroups = new Map();
        availableOfferings.forEach((offering) => {
            const key = `${offering.classId}:${offering.streamId ?? "whole-class"}`;
            const group = classGroups.get(key) ?? { label: `${offering.className}${offering.streamName ? ` · ${offering.streamName}` : ""}`, total: 0, covered: 0 };
            group.total += 1;
            if (activeOfferingIds.has(offering.id))
                group.covered += 1;
            classGroups.set(key, group);
        });
        return {
            uncovered: availableOfferings.filter((offering) => !activeOfferingIds.has(offering.id)),
            idleTeachers: teachers.filter((teacher) => !activeTeacherIds.has(teacher.id)),
            byTeacher: teachers.map((teacher) => ({ teacher, count: current.filter((row) => row.teacherId === teacher.id && row.status === "ACTIVE").length }))
                .sort((a, b) => b.count - a.count),
            byClass: Array.from(classGroups.values()).sort((a, b) => a.label.localeCompare(b.label)),
        };
    }, [availableOfferings, current, teachers]);
    const isLoading = loading || context.loading;
    const visibleOfferings = useMemo(() => {
        const query = offeringQuery.trim().toLowerCase();
        if (!query)
            return availableOfferings;
        return availableOfferings.filter((offering) => `${offering.className} ${offering.streamName ?? ""} ${offering.subjectCode} ${offering.subjectName}`.toLowerCase().includes(query));
    }, [availableOfferings, offeringQuery]);
    const primaryReplacements = useMemo(() => offeringIds.flatMap((id) => {
        const currentPrimary = allocations.find((allocation) => allocation.termId === termId && allocation.offeringId === id &&
            allocation.status === "ACTIVE" && allocation.role === "PRIMARY_SUBJECT_TEACHER");
        return currentPrimary && currentPrimary.teacherId !== teacherId ? [currentPrimary] : [];
    }), [allocations, offeringIds, teacherId, termId]);
    const teacherCurrentLoad = useMemo(() => current.filter((allocation) => allocation.teacherId === teacherId && allocation.status === "ACTIVE").length, [current, teacherId]);
    const newAllocationCount = useMemo(() => offeringIds.filter((offeringId) => !current.some((allocation) => allocation.offeringId === offeringId && allocation.teacherId === teacherId &&
        allocation.role === role && allocation.status === "ACTIVE")).length, [current, offeringIds, role, teacherId]);
    async function save(reason = "") {
        if (!termId || !offeringIds.length || !teacherId) {
            setError("Select a term, one or more class subjects, and a teacher before saving.");
            return;
        }
        if (offeringIds.some((id) => !availableOfferings.some((offering) => offering.id === id))) {
            setError("One or more selected class subjects do not belong to the selected academic year. Choose them again.");
            setOfferingIds([]);
            return;
        }
        if (!effectiveFrom || effectiveFrom > localDate()) {
            setError("Choose an effective-from date that is today or earlier.");
            return;
        }
        if (confirmReplacement && !reason.trim()) {
            setError("Enter a reason for replacing the current primary teacher.");
            return;
        }
        if (role === "PRIMARY_SUBJECT_TEACHER" && primaryReplacements.length > 0 && !reason.trim()) {
            setReplacementReason("");
            setConfirmReplacement(true);
            return;
        }
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const result = await supabase.rpc("assign_teacher_to_offerings", {
                p_class_subject_offering_ids: offeringIds,
                p_term_id: termId,
                p_teacher_id: teacherId,
                p_allocation_role: role,
                p_reason: reason.trim() || null,
                p_effective_from: effectiveFrom,
            });
            if (result.error) {
                const detail = String(result.error.message ?? messageOf(result.error));
                if (result.error.code === "PGRST202" || /schema cache|could not find the function/i.test(detail)) {
                    throw new Error("The teacher allocation functions are not available in the database API yet. Apply migration 20261008110000_teacher_multi_subject_allocation.sql, then refresh this page.");
                }
                throw new Error(detail);
            }
            const refresh = await load();
            if (!refresh.ok) {
                setNotice("Supabase accepted the allocation, but the register could not refresh. Refresh this page to verify it; retrying after the allocation migration is applied is safe.");
                return;
            }
            const confirmed = offeringIds.every((id) => refresh.allocations.some((allocation) => allocation.termId === termId && allocation.offeringId === id &&
                allocation.teacherId === teacherId && allocation.role === role && allocation.status === "ACTIVE"));
            if (!confirmed) {
                setNotice("Supabase accepted the allocation, but it is not visible in the refreshed register yet. Refresh before trying again.");
                return;
            }
            setNotice(`${offeringIds.length} subject allocation${offeringIds.length === 1 ? "" : "s"} saved and confirmed in the register.`);
            setConfirmReplacement(false);
            setReplacementReason("");
            setOfferingIds([]);
            setOfferingQuery("");
            setTeacherId("");
        }
        catch (saveError) {
            setError(`Teacher allocation was not confirmed: ${messageOf(saveError)}`);
        }
        finally {
            setBusy(false);
        }
    }
    async function endAllocation() {
        if (!endingAllocation || !endReason.trim() || !effectiveTo)
            return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const { data, error: rpcError } = await supabase.rpc("end_teacher_allocation", {
                p_allocation_id: endingAllocation.id,
                p_effective_to: effectiveTo,
                p_reason: endReason.trim(),
            });
            if (rpcError)
                throw new Error(rpcError.message);
            if (data !== endingAllocation.id)
                throw new Error("The database did not confirm the allocation record that was selected.");
            const refreshed = await load();
            if (!refreshed.ok)
                throw new Error("The allocation was ended, but the register could not refresh. Refresh and verify before retrying.");
            setNotice(`Allocation ended effective ${effectiveTo}; its history remains in the register.`);
            setEndingAllocation(null);
            setEndReason("");
        }
        catch (endError) {
            setError(`Allocation was not ended: ${messageOf(endError)}`);
        }
        finally {
            setBusy(false);
        }
    }
    async function saveAllocationEdit() {
        if (!editingAllocation || !editStartDate || !editReason.trim())
            return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const { data, error: rpcError } = await supabase.rpc("edit_teacher_allocation_dates", {
                p_allocation_id: editingAllocation.id,
                p_effective_from: editStartDate,
                p_effective_to: editEndDate || null,
                p_allocation_role: editRole,
                p_reason: editReason.trim(),
            });
            if (rpcError)
                throw new Error(rpcError.message);
            if (data !== editingAllocation.id)
                throw new Error("The database did not confirm the selected allocation.");
            const refreshed = await load();
            if (!refreshed.ok)
                throw new Error("The allocation was updated, but the register did not refresh. Refresh and verify before retrying.");
            setNotice("Allocation dates were updated and the change was recorded in the audit trail.");
            setEditingAllocation(null);
            setEditReason("");
        }
        catch (editError) {
            setError(`Allocation was not updated: ${messageOf(editError)}`);
        }
        finally {
            setBusy(false);
        }
    }
    function exportCsv() {
        const header = ["Term", "Class", "Stream", "Subject code", "Subject", "Teacher", "Role", "Status", "Effective from", "Effective to"];
        const rows = filteredCurrent.map((allocation) => {
            const offering = offerings.find((item) => item.id === allocation.offeringId);
            return [terms.find((item) => item.id === allocation.termId)?.name, offering?.className,
                offering?.streamName, offering?.subjectCode, offering?.subjectName, allocation.teacherName,
                allocation.role, allocation.status, allocation.effectiveFrom, allocation.effectiveTo]
                .map(csvCell).join(",");
        });
        const blob = new Blob([[header.map(csvCell).join(","), ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `teacher-allocations-${termId || "all-terms"}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }
    return <>
    <header className="page-heading teacher-allocation-heading">
      <div>
        <span className="eyebrow">O-LEVEL · STAFFING</span>
        <h1>Teacher allocations</h1>
        <p>Assign an active Teacher account to a class subject for the selected term.</p>
      </div>
      <Link className="secondary-button" to="/setup/health">Setup Health</Link>
    </header>
    {!canManage && <div className="form-error-message" role="alert">This page is limited to authorised School Administrators. Contact your School Administrator if you need allocation access.</div>}
    {canManage && <>
    {error && <div className="form-error-message" role="alert">{error}</div>}
    {notice && <p className="form-success-message" role="status">{notice}</p>}

    <section className="teacher-allocation-summary" aria-label="Teacher allocation readiness">
      <article><span>Eligible teachers</span><strong>{isLoading ? "…" : teachers.length}</strong><small>Active Teacher-role school accounts</small></article>
      <article><span>Class offerings</span><strong>{isLoading ? "…" : availableOfferings.length}</strong><small>Active in the selected academic year</small></article>
      <article><span>Current allocations</span><strong>{isLoading ? "…" : current.length}</strong><small>For the selected term</small></article>
    </section>
    <section className="teacher-allocation-summary" aria-label="Coverage and workload checks">
      <article><span>Unallocated class subjects</span><strong>{isLoading ? "…" : coverage.uncovered.length}</strong><small>Active offerings with no active teacher record</small></article>
      <article><span>Teachers without allocations</span><strong>{isLoading ? "…" : coverage.idleTeachers.length}</strong><small>For the selected term</small></article>
      <article><span>Timetable conflicts</span><strong>Not checked</strong><small>There is no timetable-period data connected to this allocation workflow yet.</small></article>
    </section>
    {!isLoading && coverage.byTeacher.some((item) => item.count > 0) && <section className="panel teacher-workload-panel"><div className="panel-heading"><div><h2>Teacher workload overview</h2><p>Active allocated class-subject records in the selected term; this is not a timetable period or workload-capacity measure.</p></div></div><div className="teacher-workload-grid">{coverage.byTeacher.filter((item) => item.count > 0).map(({ teacher, count }) => <article key={teacher.id}><strong>{teacher.name}</strong><span>{count} class-subject allocation{count === 1 ? "" : "s"}</span><small>{offerings.filter((item) => current.some((allocation) => allocation.teacherId === teacher.id && allocation.offeringId === item.id && allocation.status === "ACTIVE")).map((item) => item.className).filter((item, index, list) => list.indexOf(item) === index).join(", ")}</small></article>)}</div></section>}
    {!isLoading && coverage.byClass.length > 0 && <section className="panel teacher-workload-panel"><div className="panel-heading"><div><h2>Coverage by class and stream</h2><p>Primary teacher coverage for each active class-subject menu.</p></div></div><div className="teacher-workload-grid">{coverage.byClass.map((group) => <article key={group.label}><strong>{group.label}</strong><span>{group.covered} / {group.total} subjects covered</span><small>{group.total - group.covered ? `${group.total - group.covered} primary allocation${group.total - group.covered === 1 ? "" : "s"} missing` : "All active subjects have a primary teacher"}</small></article>)}</div></section>}

    <section className="panel teacher-allocation-form">
      <div className="panel-heading"><div>
        <h2>New allocation</h2>
        <p>Select one or more class subjects. Replacing a primary teacher requires a reason and keeps the previous allocation in history.</p>
      </div></div>
      <div className="teacher-allocation-controls">
        <Field label="Term"><select value={termId} onChange={(event) => {
                setTermId(event.target.value);
                context.selectTerm(event.target.value);
                setOfferingIds([]);
            }} disabled={isLoading}>
          <option value="">Select term</option>
          {terms.map((term) => <option key={term.id} value={term.id}>{term.name} · {term.status.replaceAll("_", " ")}</option>)}
        </select></Field>
        <Field label="Teacher"><select value={teacherId} onChange={(event) => setTeacherId(event.target.value)} disabled={isLoading}>
          <option value="">Select teacher</option>
          {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.email}</option>)}
        </select></Field>
        <Field label="Allocation role"><select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="PRIMARY_SUBJECT_TEACHER">Primary subject teacher</option>
          <option value="CO_TEACHER">Co-teacher</option>
          <option value="SUBJECT_MODERATOR">Subject moderator</option>
        </select></Field>
        <Field label="Effective from"><input type="date" value={effectiveFrom} max={localDate()} onChange={(event) => setEffectiveFrom(event.target.value)} disabled={busy || isLoading}/></Field>
        <button className="primary-button" disabled={busy || isLoading || !schoolId || !termId || !teachers.length || !offeringIds.length} onClick={() => void save()}>
          <Save size={16}/>{busy ? "Saving…" : offeringIds.length ? `Save ${offeringIds.length} allocation${offeringIds.length === 1 ? "" : "s"}` : "Save allocations"}
        </button>
        <Field className="teacher-offering-search" label="Find a class or subject"><input value={offeringQuery} onChange={(event) => setOfferingQuery(event.target.value)} disabled={isLoading || !termId} placeholder="Search class, stream, code, or subject"/></Field>
        <fieldset className="teacher-offering-picker" disabled={isLoading || !termId || busy}>
          <legend>Class subjects · {offeringIds.length} selected</legend>
          <div className="teacher-offering-actions">
            <span>Choose every subject this teacher should cover for the selected term.</span>
            <button type="button" className="text-button" onClick={() => {
                const visibleIds = visibleOfferings.map((offering) => offering.id);
                setOfferingIds((current) => visibleIds.every((id) => current.includes(id))
                    ? current.filter((id) => !visibleIds.includes(id))
                    : [...new Set([...current, ...visibleIds])]);
            }} disabled={!visibleOfferings.length}>
              {visibleOfferings.length > 0 && visibleOfferings.every((offering) => offeringIds.includes(offering.id)) ? "Clear shown" : `Select shown (${visibleOfferings.length})`}
            </button>
          </div>
          <div className="teacher-offering-groups">
            {Array.from(visibleOfferings.reduce((groups, offering) => {
                const key = `${offering.classId}:${offering.streamId ?? "whole-class"}`;
                const current = groups.get(key) ?? { title: `${offering.className}${offering.streamName ? ` · ${offering.streamName}` : ""}`, offerings: [] };
                current.offerings.push(offering);
                groups.set(key, current);
                return groups;
            }, new Map()).entries()).map(([groupKey, group]) => {
                const groupIds = group.offerings.map((offering) => offering.id);
                const allSelected = groupIds.every((id) => offeringIds.includes(id));
                return <section className="teacher-offering-group" key={groupKey}>
                <div className="teacher-offering-group-heading"><strong>{group.title}</strong><button type="button" className="text-button" onClick={() => setOfferingIds((current) => allSelected
                        ? current.filter((id) => !groupIds.includes(id))
                        : [...new Set([...current, ...groupIds])])}>{allSelected ? "Clear class" : "Select all for class"}</button></div>
                <div className="teacher-offering-options">{group.offerings.map((offering) => {
                        const checked = offeringIds.includes(offering.id);
                        return <label className={`teacher-offering-option ${checked ? "is-selected" : ""}`} key={offering.id}>
                    <input type="checkbox" checked={checked} onChange={() => setOfferingIds((current) => checked
                                ? current.filter((id) => id !== offering.id) : [...current, offering.id])}/>
                    <span><strong>{offering.subjectCode} · {offering.subjectName}</strong></span>
                  </label>;
                    })}</div>
              </section>;
            })}
            {!visibleOfferings.length && <p className="teacher-offering-empty">No active class subjects match this search.</p>}
          </div>
        </fieldset>
      </div>
      {teacherId && <p className="teacher-allocation-preview" role="status">Preview: {teachers.find((teacher) => teacher.id === teacherId)?.name} currently has {teacherCurrentLoad} active allocation{teacherCurrentLoad === 1 ? "" : "s"} in this term; this save creates or changes {newAllocationCount} of the {offeringIds.length} selected subjects. {primaryReplacements.length > 0 ? `${primaryReplacements.length} primary teacher replacement${primaryReplacements.length === 1 ? "" : "s"} will require a reason.` : "No active primary allocation will be replaced."}</p>}
      {!isLoading && !teachers.length && <div className="teacher-eligibility-notice" role="status">
        <AlertTriangle size={19} aria-hidden="true"/>
        <div><strong>No eligible Teacher account was returned.</strong><p>The account must exist in Supabase Auth, have an active membership in this school, use the <code>TEACHER</code> role, and be active. A staff review profile alone does not create an account or membership.</p><Link to="/people/users">Invite a Teacher account in Staff &amp; Users</Link></div>
      </div>}
      {!isLoading && terms.length > 0 && teachers.length > 0 && availableOfferings.length > 0 && <p className="teacher-allocation-ready" role="status"><CheckCircle2 size={17} aria-hidden="true"/>Teachers, terms, and active class offerings are ready to allocate.</p>}
      {!isLoading && (!terms.length || !availableOfferings.length) && <div className="form-info-message" role="status">
        {!terms.length ? "No academic terms are configured for this school. Set up a term before allocating teachers. " : ""}
        {!availableOfferings.length ? "No active class subject offerings exist for the selected term’s academic year. Activate and offer subjects to classes first." : ""}
      </div>}
    </section>

    <section className="panel teacher-allocation-register">
      <div className="panel-heading"><div>
        <h2>Allocation register</h2>
        <p>{isLoading ? "Loading persistent allocations…" : `${filteredCurrent.length} of ${current.length} record${current.length === 1 ? "" : "s"} for the selected term, including retained history.`}</p>
      </div><div className="teacher-register-actions"><button className="secondary-button" onClick={exportCsv} disabled={isLoading || !filteredCurrent.length}>Export CSV</button><button className="secondary-button" onClick={() => window.print()} disabled={isLoading || !filteredCurrent.length}>Print / Save PDF</button><button className="secondary-button" onClick={() => void load()} disabled={isLoading}>Refresh</button></div></div>
      <div className="teacher-register-filters">
        <Field label="Class"><select value={filterClass} onChange={(event) => setFilterClass(event.target.value)}><option value="ALL">All classes</option>{Array.from(new Map(offerings.map((item) => [item.classId, item.className])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
        <Field label="Subject"><select value={filterSubject} onChange={(event) => setFilterSubject(event.target.value)}><option value="ALL">All subjects</option>{Array.from(new Map(offerings.map((item) => [item.subjectCode, `${item.subjectCode} · ${item.subjectName}`])).entries()).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
        <Field label="Teacher"><select value={filterTeacher} onChange={(event) => setFilterTeacher(event.target.value)}><option value="ALL">All teachers</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></Field>
        <Field label="Role"><select value={filterRole} onChange={(event) => setFilterRole(event.target.value)}><option value="ALL">All roles</option><option value="PRIMARY_SUBJECT_TEACHER">Primary</option><option value="CO_TEACHER">Co-teacher</option><option value="SUBJECT_MODERATOR">Moderator</option></select></Field>
        <Field label="Status"><select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Ended / inactive</option></select></Field>
      </div>
      <div className="table-wrapper"><table className="data-table">
        <thead><tr><th>Class / Stream</th><th>Subject</th><th>Teacher</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {filteredCurrent.map((allocation) => {
                const offering = offerings.find((item) => item.id === allocation.offeringId);
                return <tr key={allocation.id}>
              <td>{offering ? `${offering.className}${offering.streamName ? ` · ${offering.streamName}` : ""}` : "—"}</td>
              <td>{offering ? `${offering.subjectCode} · ${offering.subjectName}` : "—"}</td>
              <td>{allocation.teacherName}</td><td>{allocation.role.replaceAll("_", " ")}</td><td>{allocation.status}{allocation.effectiveTo ? ` · to ${allocation.effectiveTo}` : ""}</td>
              <td>{allocation.status === "ACTIVE" && <><button className="text-button" disabled={busy} onClick={() => { setEditingAllocation(allocation); setEditStartDate(allocation.effectiveFrom); setEditEndDate(allocation.effectiveTo ?? ""); setEditRole(allocation.role); setEditReason(""); }}>Edit allocation</button><button className="text-button danger-text-button" disabled={busy} onClick={() => { setEndingAllocation(allocation); setEffectiveTo(localDate()); setEndReason(""); }}>End allocation</button></>}{allocation.status === "INACTIVE" && <button className="text-button" disabled={busy || !teachers.some((teacher) => teacher.id === allocation.teacherId)} onClick={() => { setOfferingIds([allocation.offeringId]); setTeacherId(allocation.teacherId); setRole(allocation.role); setEffectiveFrom(localDate()); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Restore teacher</button>}</td>
            </tr>;
            })}
          {!isLoading && !filteredCurrent.length && <tr><td colSpan={6}><div className="learner-empty-state"><Users /><strong>No matching teacher allocations</strong><span>Clear filters or assign a Teacher-role account to an active class subject.</span></div></td></tr>}
        </tbody>
      </table></div>
    </section>
    <ConfirmDialog open={Boolean(endingAllocation)} title="End this teacher allocation?" description="The record remains in the register and audit history. Ending it removes the teacher’s active allocation for this class subject." confirmLabel="End allocation" destructive busy={busy} confirmDisabled={!endReason.trim() || !effectiveTo || Boolean(endingAllocation && effectiveTo < endingAllocation.effectiveFrom)} onCancel={() => { if (!busy)
            setEndingAllocation(null); }} onConfirm={() => void endAllocation()} currentState={endingAllocation ? `${endingAllocation.teacherName} · ${endingAllocation.role.replaceAll("_", " ")}` : ""} nextState={effectiveTo ? `Inactive effective ${effectiveTo}` : "Choose an end date"} impact="Teacher access to marks entry for this offering will end; saved marks are preserved." preserved="Allocation and academic records remain available in history." reversible={true}>
      <label className="form-field"><span>Effective to</span><input type="date" value={effectiveTo} min={endingAllocation?.effectiveFrom} max={localDate()} onChange={(event) => setEffectiveTo(event.target.value)} required/></label>
      <label className="form-field"><span>Reason</span><textarea value={endReason} onChange={(event) => setEndReason(event.target.value)} maxLength={500} required placeholder="Record the approved staffing change"/></label>
    </ConfirmDialog>
    <ConfirmDialog open={Boolean(editingAllocation)} title="Edit allocation" description="Role and dates are audited. To change the teacher, create a replacement allocation so the previous teacher remains in history." confirmLabel="Save allocation" busy={busy} confirmDisabled={!editStartDate || !editReason.trim() || editStartDate > localDate() || Boolean(editEndDate && (editEndDate < editStartDate || editEndDate > localDate()))} onCancel={() => { if (!busy)
            setEditingAllocation(null); }} onConfirm={() => void saveAllocationEdit()} currentState={editingAllocation ? `${editingAllocation.teacherName} · ${editingAllocation.role.replaceAll("_", " ")}` : ""} nextState={`${editRole.replaceAll("_", " ")} · ${editStartDate || "No start date"}${editEndDate ? ` to ${editEndDate}` : " · ongoing"}`} impact="An end date marks the allocation inactive. Changing to primary is blocked if another primary assignment must first be replaced." preserved="Saved academic marks and the allocation audit trail are preserved." reversible={true}>
      <label className="form-field"><span>Allocation role</span><select value={editRole} onChange={(event) => setEditRole(event.target.value)}><option value="PRIMARY_SUBJECT_TEACHER">Primary subject teacher</option><option value="CO_TEACHER">Co-teacher</option><option value="SUBJECT_MODERATOR">Subject moderator</option></select></label>
      <label className="form-field"><span>Effective from</span><input type="date" value={editStartDate} max={localDate()} onChange={(event) => setEditStartDate(event.target.value)} required/></label>
      <label className="form-field"><span>Effective to (optional)</span><input type="date" value={editEndDate} min={editStartDate} max={localDate()} onChange={(event) => setEditEndDate(event.target.value)}/></label>
      <label className="form-field"><span>Reason for editing dates</span><textarea value={editReason} onChange={(event) => setEditReason(event.target.value)} maxLength={500} required placeholder="Explain the approved date correction"/></label>
    </ConfirmDialog>
    <ConfirmDialog open={confirmReplacement} title="Replace the primary subject teacher?" description={`This will replace ${primaryReplacements.length} current primary allocation${primaryReplacements.length === 1 ? "" : "s"} and retain their history.`} confirmLabel="Replace primary teacher" destructive busy={busy} confirmDisabled={!replacementReason.trim()} error={confirmReplacement ? error : ""} currentState={`${primaryReplacements.length} current primary allocation${primaryReplacements.length === 1 ? "" : "s"}`} nextState={teachers.find((teacher) => teacher.id === teacherId)?.name ?? "Selected teacher"} impact={`Marks-entry access changes for ${primaryReplacements.length} class subject${primaryReplacements.length === 1 ? "" : "s"}; previous allocations remain in history.`} preserved="Previously saved marks and allocation history are preserved." reversible={true} onCancel={() => { if (!busy) {
            setConfirmReplacement(false);
            setReplacementReason("");
            setError("");
        } }} onConfirm={() => void save(replacementReason)}>
      <label className="form-field"><span>Reason for replacing the teacher</span><textarea required maxLength={500} value={replacementReason} onChange={(event) => { setReplacementReason(event.target.value); setError(""); }} placeholder="Explain the approved staffing change"/></label>
    </ConfirmDialog>
    </>}
  </>;
}
function Field({ label, children, className = "" }) {
    return <label className={`form-field ${className}`}><span>{label}</span>{children}</label>;
}
