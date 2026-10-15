import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";

export type PersistentClass = {
  id: string; academicYearId: string; name: string; programme: "O_LEVEL" | "A_LEVEL";
  level: number; status: string; capacity: number | null; classTeacherUserId: string | null;
  learnerCount: number; streams: { id: string; name: string; status: string; capacity: number | null }[];
  subjects: { id: string; code: string; name: string; compulsory: boolean; status: string }[];
};
export type ActivatedSubject = { id: string; academicYearId: string; code: string; name: string; programme: "O_LEVEL" | "A_LEVEL"; compulsory: boolean; paperCount: number };
export type SetupStaff = { userId: string; name: string; role: string };
type SetupData = { academicYears: { id: string; name: string; status: string }[]; classes: PersistentClass[]; activatedSubjects: ActivatedSubject[]; staff: SetupStaff[] };
export type ALevelFoundationResult = { classesCreated: number; streamsCreated: number; subjectConnectionsProcessed: number };
type ReloadResult = { ok: true } | { ok: false; error: string };
const empty: SetupData = { academicYears: [], classes: [], activatedSubjects: [], staff: [] };
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Unexpected Supabase connection error."; }

export function usePersistentClassSetup() {
  const context = useSchoolContext();
  const schoolId = context.schoolId;
  const [data, setData] = useState<SetupData>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reloadVersion = useRef(0);
  const loadedSchoolId = useRef("");

  const reload = useCallback(async (): Promise<ReloadResult> => {
    const version = ++reloadVersion.current;
    const isCurrent = () => version === reloadVersion.current;
    if (context.loading) return { ok: false, error: "School context is still loading." };
    if (context.error) { loadedSchoolId.current = ""; setData(empty); setError(context.error); setLoading(false); return { ok: false, error: context.error }; }
    if (!schoolId) {
      const reason = "Active school context was not found.";
      loadedSchoolId.current = "";
      setData(empty); setError(reason); setLoading(false); return { ok: false, error: reason };
    }
    // A same-school refresh must not unmount the class workspace. Otherwise
    // a successful save loses its dialog state and success message mid-request.
    if (loadedSchoolId.current !== schoolId) {
      setData(empty);
      setLoading(true);
    }
    setError("");
    try {
      const result = await (supabase as any).rpc("get_school_class_setup", { p_school_id: schoolId });
      if (!isCurrent()) return { ok: false, error: "A newer school context replaced this class setup request." };
      if (result.error) throw new Error(result.error.message);
      setData(result.data ?? empty);
      loadedSchoolId.current = schoolId;
      return { ok: true };
    } catch (loadError) {
      const reason = `Class setup could not be refreshed: ${errorMessage(loadError)}`;
      if (isCurrent()) { setData(empty); loadedSchoolId.current = ""; setError(reason); }
      return { ok: false, error: reason };
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [context.error, context.loading, schoolId]);

  useEffect(() => {
    if (context.loading) {
      reloadVersion.current += 1;
      loadedSchoolId.current = "";
      setData(empty); setError(""); setLoading(true);
      return;
    }
    void reload();
    return () => { reloadVersion.current += 1; };
  }, [context.loading, reload]);

  async function createClass(input: { academicYearId: string; programme: string; level: number; name: string; status: string; capacity: number | null; classTeacherUserId: string | null }) {
    if (!schoolId) return { id: "", error: "Select an active school before creating a class." };
    try {
      const result = await (supabase as any).rpc("create_academic_class", {
        p_school_id: schoolId, p_academic_year_id: input.academicYearId, p_programme: input.programme,
        p_level: input.level, p_class_name: input.name, p_status: input.status,
        p_capacity: input.capacity, p_class_teacher_user_id: input.classTeacherUserId,
      });
      if (result.error) return { id: "", error: result.error.message };
      const id = result.data as string;
      const refresh = await reload();
      if (!refresh.ok) return { id, error: `Class ${input.name} was saved (ID ${id}), but the register could not refresh. Do not submit it again; open the class or refresh the page. ${refresh.error}` };
      if (!data.classes.some((item) => item.id === id)) {
        // State updates are asynchronous; the current render can be stale. The next load verifies via its returned state.
        const verify = await (supabase as any).rpc("get_school_class_setup", { p_school_id: schoolId });
        if (verify.error || !(verify.data?.classes ?? []).some((item: PersistentClass) => item.id === id))
          return { id, error: `Class ${input.name} was created (ID ${id}), but could not yet be verified in the register. Refresh before retrying.` };
        setData(verify.data);
      }
      return { id, error: "" };
    } catch (createError) {
      return { id: "", error: `Class was not confirmed: ${errorMessage(createError)}` };
    }
  }

  async function createStream(classId: string, name: string, capacity: number | null) {
    try {
      const result = await (supabase as any).rpc("create_class_stream", { p_class_id: classId, p_stream_name: name, p_capacity: capacity });
      if (result.error) return result.error.message;
      const refresh = await reload();
      return refresh.ok ? null : `Stream was saved, but the class register could not refresh. Refresh before retrying. ${refresh.error}`;
    } catch (createError) { return `Stream was not confirmed: ${errorMessage(createError)}`; }
  }

  async function offerSubjects(classId: string, subjectIds: string[]) {
    let completed = 0;
    try {
      for (const subjectId of subjectIds) {
        const subject = data.activatedSubjects.find((item) => item.id === subjectId);
        const result = await (supabase as any).rpc("offer_subject_to_class", {
          p_class_id: classId, p_school_subject_offering_id: subjectId, p_is_compulsory: subject?.compulsory ?? null,
        });
        if (result.error) return completed
          ? `${completed} subject offering(s) were saved, then Supabase rejected another: ${result.error.message}. Refresh and review before retrying.`
          : result.error.message;
        completed += 1;
      }
      const refresh = await reload();
      return refresh.ok ? null : `${completed} subject offering(s) were saved, but the class register could not refresh. Refresh and review before retrying. ${refresh.error}`;
    } catch (saveError) {
      return completed
        ? `${completed} subject offering(s) may already be saved; the connection failed during the remaining assignments. Refresh and review before retrying. ${errorMessage(saveError)}`
        : `Subject offerings were not confirmed: ${errorMessage(saveError)}`;
    }
  }

  async function prepareALevelFoundation(academicYearId: string, streamName: string) {
    if (!schoolId) return { data: null, error: "Select a school before preparing A-Level classes." };
    try {
      const result = await (supabase as any).rpc("ensure_a_level_class_foundation", { p_school_id: schoolId, p_academic_year_id: academicYearId, p_default_stream_name: streamName });
      if (result.error) return { data: null, error: result.error.message };
      const refresh = await reload();
      return { data: result.data as ALevelFoundationResult, error: refresh.ok ? "" : `Foundation was created, but its register could not refresh. Do not run it again until verified. ${refresh.error}` };
    } catch (saveError) { return { data: null, error: `A-Level foundation was not confirmed: ${errorMessage(saveError)}` }; }
  }

  return { schoolId, ...data, loading: loading || context.loading, error, reload, createClass, createStream, offerSubjects, prepareALevelFoundation };
}
