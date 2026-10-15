import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";

export type PersistentMarkState = "MISSING" | "PRESENT" | "ABSENT" | "EXEMPT";
export type PersistentActivity = { id: string; number: number; title: string; date: string | null; maximum: number; createdBy: string };
export type PersistentActivityMark = { activityId: string; score: number | null; rawPercentage: number | null; status: PersistentMarkState; enteredBy: string; updatedAt: string };
export type PersistentAoiSelection = { state: "POLICY_NOT_CONFIGURED" | "COMPLETE" | "INCOMPLETE"; required: number | null; completed: number; selectionRule?: string; settingVersionId?: string; settingVersion?: number; selected: Array<{ id: string; number: number; title: string; date: string | null; maximum: number; score: number; rawPercentage: number; threePoint: number }>; recorded: Array<{ id: string; number: number; title: string; date: string | null; maximum: number; score: number | null; rawPercentage: number | null; status: PersistentMarkState }>; contribution: number | null };
export type PersistentMarkLearner = { id: string; admissionNumber: string; name: string; aoiMark: number | null; aoiStatus: PersistentMarkState; examMark: number | null; examStatus: PersistentMarkState; workflowStatus: string; updatedAt: string | null; activity1Raw?: number | null; activity1Status?: PersistentMarkState; activity2Raw?: number | null; activity2Status?: PersistentMarkState; examRaw?: number | null; activityMarks?: PersistentActivityMark[]; aoiSelection?: PersistentAoiSelection };
export type PersistentMarkOffering = { id: string; classId: string; className: string; programme: "O_LEVEL" | "A_LEVEL"; streamId: string | null; streamName: string | null; subjectCode: string; subjectName: string; teacherName: string | null; learners: PersistentMarkLearner[]; activities?: PersistentActivity[] };
export type MarksTerm = { id: string; academicYearId: string; name: string; status: string; startsOn: string };
export type PersistentSubmission = { id: string; offeringId: string; status: "HOD_REVIEW" | "READY" | "MODERATED" | "RETURNED"; submittedAt: string; reviewedAt: string | null; reviewNote: string | null };
type Workspace = { schoolId: string; termId: string; academicYearId: string; role: string; canEnter: boolean; offerings: PersistentMarkOffering[] };
type LoadResult = { ok: true; submissionError?: string } | { ok: false; error: string };
const emptyWorkspace: Workspace = { schoolId: "", termId: "", academicYearId: "", role: "", canEnter: false, offerings: [] };
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Unexpected Supabase connection error."; }

export function usePersistentMarks() {
  const context = useSchoolContext();
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [submissions, setSubmissions] = useState<Record<string, PersistentSubmission>>({});
  const requestVersion = useRef(0);
  const terms = useMemo<MarksTerm[]>(() => context.terms.map((term) => ({ id: term.id, academicYearId: term.academicYearId, name: term.name, status: term.status, startsOn: term.startsOn })), [context.terms]);
  const termId = context.termId;

  const loadWorkspace = useCallback(async (selectedTermId: string): Promise<LoadResult> => {
    const version = ++requestVersion.current;
    const isCurrent = () => version === requestVersion.current;
    if (context.loading) return { ok: false, error: "School context is still loading." };
    if (context.error) { setError(context.error); setSubmissionError(""); setSubmissions({}); setWorkspace(emptyWorkspace); setLoading(false); return { ok: false, error: context.error }; }
    if (!selectedTermId) { setError(""); setSubmissionError(""); setSubmissions({}); setWorkspace(emptyWorkspace); setLoading(false); return { ok: true }; }
    setLoading(true);
    setError("");
    setSubmissionError("");
    setSubmissions({});
    setWorkspace(emptyWorkspace);
    try {
      const result = await (supabase as any).rpc("get_marks_entry_workspace", { p_term_id: selectedTermId });
      if (!isCurrent()) return { ok: false, error: "A newer school or term context replaced this marks request." };
      if (result.error) throw new Error(result.error.message);
      if (result.data?.schoolId && result.data.schoolId !== context.schoolId) throw new Error("The marks workspace does not belong to the selected school.");
      setWorkspace(result.data ?? emptyWorkspace);
      const submissionResult = await (supabase as any).rpc("get_academic_mark_submission_statuses", { p_term_id: selectedTermId });
      if (!isCurrent()) return { ok: false, error: "A newer school or term context replaced this marks request." };
      if (submissionResult.error) {
        const reason = `Mark submission workflow could not load: ${submissionResult.error.message}`;
        setSubmissionError(reason);
        setSubmissions({});
        return { ok: true, submissionError: reason };
      } else {
        setSubmissionError("");
        setSubmissions(Object.fromEntries(((submissionResult.data ?? []) as PersistentSubmission[]).map((submission) => [submission.offeringId, submission])));
      }
      return { ok: true };
    } catch (loadError) {
      const reason = `Marks workspace could not be loaded: ${errorMessage(loadError)}`;
      if (isCurrent()) { setError(reason); setSubmissionError(""); setSubmissions({}); setWorkspace(emptyWorkspace); }
      return { ok: false, error: reason };
    } finally { if (isCurrent()) setLoading(false); }
  }, [context.loading, context.error, context.schoolId]);

  useEffect(() => {
    if (context.loading) {
      requestVersion.current += 1;
      setWorkspace(emptyWorkspace); setSubmissions({}); setSubmissionError(""); setError(""); setLoading(true);
      return;
    }
    void loadWorkspace(termId);
    return () => { requestVersion.current += 1; };
  }, [termId, loadWorkspace, context.loading]);

  function selectTerm(id: string) { context.selectTerm(id); }

  async function save(input: { offeringId: string; learnerId: string; aoiMark: number | null; aoiStatus: PersistentMarkState; examMark: number | null; examStatus: PersistentMarkState }) {
    if (!termId) return "Select a valid term before saving marks.";
    if (!workspace.canEnter) return "Your account cannot enter marks for this workspace.";
    if (!workspace.offerings.some((offering) => offering.id === input.offeringId && offering.learners.some((learner) => learner.id === input.learnerId))) return "This learner and subject are not in the current marks roster. Refresh before saving.";
    try {
      const result = await (supabase as any).rpc("save_academic_mark_record", {
        p_term_id: termId, p_class_subject_offering_id: input.offeringId, p_learner_id: input.learnerId,
        p_aoi_mark: input.aoiMark, p_aoi_status: input.aoiStatus, p_exam_mark: input.examMark, p_exam_status: input.examStatus,
      });
      if (result.error) return result.error.message;
      const refresh = await loadWorkspace(termId);
      if (!refresh.ok) return `Marks were saved to Supabase, but the roster could not refresh. Do not submit the same row again until verified; use Refresh. ${refresh.error}`;
      return null;
    } catch (saveError) { return `Marks were not confirmed: ${errorMessage(saveError)}`; }
  }

  async function saveOLevelComponent(input: { offeringId: string; learnerId: string; component: "A1" | "A2" | "EXAM"; rawMark: number | null; status: PersistentMarkState }) {
    if (!termId) return "Select a valid term before saving marks.";
    if (!workspace.canEnter) return "Your account cannot enter marks for this workspace.";
    if (!workspace.offerings.some((offering) => offering.id === input.offeringId && offering.programme === "O_LEVEL" && offering.learners.some((learner) => learner.id === input.learnerId))) return "This learner and O-Level subject are not in the current marks roster. Refresh before saving.";
    try {
      const result = input.component === "EXAM"
        ? await (supabase as any).rpc("save_o_level_exam_raw_mark", { p_term_id: termId, p_class_subject_offering_id: input.offeringId, p_learner_id: input.learnerId, p_raw_mark: input.rawMark, p_status: input.status })
        : await (supabase as any).rpc("save_o_level_activity_mark", { p_term_id: termId, p_class_subject_offering_id: input.offeringId, p_learner_id: input.learnerId, p_activity_number: input.component === "A1" ? 1 : 2, p_raw_mark: input.rawMark, p_status: input.status });
      if (result.error) return result.error.message;
      const refresh = await loadWorkspace(termId);
      if (!refresh.ok) return `${input.component} was saved, but the roster could not refresh. Do not submit it again until verified. ${refresh.error}`;
      return null;
    } catch (saveError) { return `${input.component} was not confirmed: ${errorMessage(saveError)}`; }
  }

  async function createActivity(input: { offeringId: string; title: string; date: string; maximum: number }) {
    if (!termId) return "Select a valid term before creating an activity.";
    if (!workspace.offerings.some((item) => item.id === input.offeringId && item.programme === "O_LEVEL")) return "Choose an O-Level subject offering.";
    try {
      const result = await (supabase as any).rpc("create_o_level_integration_activity", {
        p_term_id: termId, p_class_subject_offering_id: input.offeringId,
        p_title: input.title.trim(), p_activity_date: input.date, p_maximum_mark: input.maximum,
      });
      if (result.error) return result.error.message;
      const refresh = await loadWorkspace(termId);
      if (!refresh.ok) return `The activity was created, but the roster could not refresh. ${refresh.error}`;
      return null;
    } catch (cause) { return `Activity creation was not confirmed: ${errorMessage(cause)}`; }
  }

  async function saveActivityScore(input: { offeringId: string; activityId: string; learnerId: string; score: number | null; status: PersistentMarkState }) {
    if (!termId) return "Select a valid term before saving a score.";
    if (!workspace.offerings.some((item) => item.id === input.offeringId && item.programme === "O_LEVEL"
      && item.activities?.some((activity) => activity.id === input.activityId)
      && item.learners.some((learner) => learner.id === input.learnerId))) return "The activity or learner is not in this roster. Refresh before saving.";
    try {
      const result = await (supabase as any).rpc("save_o_level_activity_score", {
        p_activity_id: input.activityId, p_learner_id: input.learnerId, p_score: input.score, p_status: input.status,
      });
      if (result.error) return result.error.message;
      const refresh = await loadWorkspace(termId);
      if (!refresh.ok) return `The score was saved, but the roster could not refresh. ${refresh.error}`;
      return null;
    } catch (cause) { return `Activity score was not confirmed: ${errorMessage(cause)}`; }
  }

  async function submitOffering(offeringId: string, note = "Submitted for academic review") {
    if (!termId) return "Select a valid term before submitting marks.";
    if (!workspace.offerings.some((offering) => offering.id === offeringId)) return "This offering is not in the current authorised marks workspace.";
    try {
      const result = await (supabase as any).rpc("submit_academic_mark_offering", {
        p_term_id: termId, p_class_subject_offering_id: offeringId, p_note: note,
      });
      if (result.error) return result.error.message;
      const refresh = await loadWorkspace(termId);
      if (!refresh.ok || refresh.submissionError) return `Marks were submitted, but submission status could not be verified. Refresh before trying again. ${refresh.ok ? refresh.submissionError : refresh.error}`;
      return null;
    } catch (submitError) { return `Submission was not confirmed: ${errorMessage(submitError)}`; }
  }

  return { terms, termId, workspace, loading: loading || context.loading, error, submissionError, submissions, selectTerm, save, saveOLevelComponent, createActivity, saveActivityScore, submitOffering, reload: () => loadWorkspace(termId) };
}
