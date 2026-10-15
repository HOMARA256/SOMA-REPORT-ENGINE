import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
const emptyWorkspace = { schoolId: "", termId: "", academicYearId: "", role: "", canEnter: false, offerings: [] };
function errorMessage(error) { return error instanceof Error ? error.message : "Unexpected Supabase connection error."; }
export function usePersistentMarks() {
    const context = useSchoolContext();
    const [workspace, setWorkspace] = useState(emptyWorkspace);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [submissionError, setSubmissionError] = useState("");
    const [submissions, setSubmissions] = useState({});
    const requestVersion = useRef(0);
    const terms = useMemo(() => context.terms.map((term) => ({ id: term.id, academicYearId: term.academicYearId, name: term.name, status: term.status, startsOn: term.startsOn })), [context.terms]);
    const termId = context.termId;
    const loadWorkspace = useCallback(async (selectedTermId) => {
        const version = ++requestVersion.current;
        const isCurrent = () => version === requestVersion.current;
        if (context.loading)
            return { ok: false, error: "School context is still loading." };
        if (context.error) {
            setError(context.error);
            setSubmissionError("");
            setSubmissions({});
            setWorkspace(emptyWorkspace);
            setLoading(false);
            return { ok: false, error: context.error };
        }
        if (!selectedTermId) {
            setError("");
            setSubmissionError("");
            setSubmissions({});
            setWorkspace(emptyWorkspace);
            setLoading(false);
            return { ok: true };
        }
        setLoading(true);
        setError("");
        setSubmissionError("");
        setSubmissions({});
        setWorkspace(emptyWorkspace);
        try {
            const result = await supabase.rpc("get_marks_entry_workspace", { p_term_id: selectedTermId });
            if (!isCurrent())
                return { ok: false, error: "A newer school or term context replaced this marks request." };
            if (result.error)
                throw new Error(result.error.message);
            if (result.data?.schoolId && result.data.schoolId !== context.schoolId)
                throw new Error("The marks workspace does not belong to the selected school.");
            setWorkspace(result.data ?? emptyWorkspace);
            const submissionResult = await supabase.rpc("get_academic_mark_submission_statuses", { p_term_id: selectedTermId });
            if (!isCurrent())
                return { ok: false, error: "A newer school or term context replaced this marks request." };
            if (submissionResult.error) {
                const reason = `Mark submission workflow could not load: ${submissionResult.error.message}`;
                setSubmissionError(reason);
                setSubmissions({});
                return { ok: true, submissionError: reason };
            }
            else {
                setSubmissionError("");
                setSubmissions(Object.fromEntries((submissionResult.data ?? []).map((submission) => [submission.offeringId, submission])));
            }
            return { ok: true };
        }
        catch (loadError) {
            const reason = `Marks workspace could not be loaded: ${errorMessage(loadError)}`;
            if (isCurrent()) {
                setError(reason);
                setSubmissionError("");
                setSubmissions({});
                setWorkspace(emptyWorkspace);
            }
            return { ok: false, error: reason };
        }
        finally {
            if (isCurrent())
                setLoading(false);
        }
    }, [context.loading, context.error, context.schoolId]);
    useEffect(() => {
        if (context.loading) {
            requestVersion.current += 1;
            setWorkspace(emptyWorkspace);
            setSubmissions({});
            setSubmissionError("");
            setError("");
            setLoading(true);
            return;
        }
        void loadWorkspace(termId);
        return () => { requestVersion.current += 1; };
    }, [termId, loadWorkspace, context.loading]);
    function selectTerm(id) { context.selectTerm(id); }
    async function save(input) {
        if (!termId)
            return "Select a valid term before saving marks.";
        if (!workspace.canEnter)
            return "Your account cannot enter marks for this workspace.";
        if (!workspace.offerings.some((offering) => offering.id === input.offeringId && offering.learners.some((learner) => learner.id === input.learnerId)))
            return "This learner and subject are not in the current marks roster. Refresh before saving.";
        try {
            const result = await supabase.rpc("save_academic_mark_record", {
                p_term_id: termId, p_class_subject_offering_id: input.offeringId, p_learner_id: input.learnerId,
                p_aoi_mark: input.aoiMark, p_aoi_status: input.aoiStatus, p_exam_mark: input.examMark, p_exam_status: input.examStatus,
            });
            if (result.error)
                return result.error.message;
            const refresh = await loadWorkspace(termId);
            if (!refresh.ok)
                return `Marks were saved to Supabase, but the roster could not refresh. Do not submit the same row again until verified; use Refresh. ${refresh.error}`;
            return null;
        }
        catch (saveError) {
            return `Marks were not confirmed: ${errorMessage(saveError)}`;
        }
    }
    async function submitOffering(offeringId, note = "Submitted for academic review") {
        if (!termId)
            return "Select a valid term before submitting marks.";
        if (!workspace.offerings.some((offering) => offering.id === offeringId))
            return "This offering is not in the current authorised marks workspace.";
        try {
            const result = await supabase.rpc("submit_academic_mark_offering", {
                p_term_id: termId, p_class_subject_offering_id: offeringId, p_note: note,
            });
            if (result.error)
                return result.error.message;
            const refresh = await loadWorkspace(termId);
            if (!refresh.ok || refresh.submissionError)
                return `Marks were submitted, but submission status could not be verified. Refresh before trying again. ${refresh.ok ? refresh.submissionError : refresh.error}`;
            return null;
        }
        catch (submitError) {
            return `Submission was not confirmed: ${errorMessage(submitError)}`;
        }
    }
    return { terms, termId, workspace, loading: loading || context.loading, error, submissionError, submissions, selectTerm, save, submitOffering, reload: () => loadWorkspace(termId) };
}
