import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
const empty = { academicYears: [], classes: [], learners: [] };
function errorMessage(error) { return error instanceof Error ? error.message : "Unexpected Supabase connection error."; }
export function usePersistentLearners() {
    const context = useSchoolContext();
    const schoolId = context.schoolId;
    const [data, setData] = useState(empty);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const reloadVersion = useRef(0);
    const reload = useCallback(async () => {
        const version = ++reloadVersion.current;
        const isCurrent = () => version === reloadVersion.current;
        if (context.loading)
            return { ok: false, error: "School context is still loading." };
        if (context.error) {
            setData(empty);
            setError(context.error);
            setLoading(false);
            return { ok: false, error: context.error };
        }
        if (!schoolId) {
            const reason = "Active school context was not found.";
            setData(empty);
            setError(reason);
            setLoading(false);
            return { ok: false, error: reason };
        }
        setLoading(true);
        setError("");
        try {
            const result = await supabase.rpc("get_school_learner_register", { p_school_id: schoolId });
            if (!isCurrent())
                return { ok: false, error: "A newer school context replaced this learner-register request." };
            if (result.error)
                throw new Error(result.error.message);
            const loaded = (result.data ?? empty);
            setData(loaded);
            return { ok: true, data: loaded };
        }
        catch (loadError) {
            const reason = `Learner register could not be refreshed: ${errorMessage(loadError)}`;
            if (isCurrent()) {
                setData(empty);
                setError(reason);
            }
            return { ok: false, error: reason };
        }
        finally {
            if (isCurrent())
                setLoading(false);
        }
    }, [context.error, context.loading, schoolId]);
    useEffect(() => {
        if (context.loading) {
            reloadVersion.current += 1;
            setData(empty);
            setError("");
            setLoading(true);
            return;
        }
        void reload();
        return () => { reloadVersion.current += 1; };
    }, [context.loading, reload]);
    async function createLearner(input) {
        if (!schoolId)
            return { id: "", error: "Select an active school before enrolling a learner." };
        try {
            const result = await supabase.rpc("create_learner_with_enrolment", {
                p_school_id: schoolId, p_academic_year_id: input.academicYearId, p_class_id: input.classId,
                p_stream_id: input.streamId, p_admission_number: input.admissionNumber, p_first_name: input.firstName,
                p_other_name: input.otherName, p_last_name: input.lastName, p_gender: input.gender,
                p_date_of_birth: input.dateOfBirth, p_admission_date: input.admissionDate,
                p_guardian_name: input.guardianName, p_guardian_phone: input.guardianPhone,
            });
            if (result.error)
                return { id: "", error: result.error.message };
            const id = result.data;
            const refresh = await reload();
            if (!refresh.ok)
                return { id, error: `Learner ${input.admissionNumber} was saved (ID ${id}), but the register could not refresh. Do not submit again; open the learner record or refresh to verify. ${refresh.error}` };
            const saved = refresh.data.learners.find((learner) => learner.id === id);
            if (!saved)
                return { id, error: `Learner ${input.admissionNumber} was created (ID ${id}), but is not visible in the refreshed register yet. Refresh before retrying.` };
            return { id, error: "" };
        }
        catch (createError) {
            return { id: "", error: `Learner enrolment was not confirmed: ${errorMessage(createError)}` };
        }
    }
    async function transferLearner(input) {
        try {
            const result = await supabase.rpc("transfer_learner_enrolment", {
                p_learner_id: input.learnerId, p_class_id: input.classId, p_stream_id: input.streamId,
                p_effective_from: input.effectiveFrom, p_reason: input.reason,
            });
            if (result.error)
                return result.error.message;
            const refresh = await reload();
            return refresh.ok ? null : `Transfer was saved, but the learner register could not refresh. Verify before retrying. ${refresh.error}`;
        }
        catch (transferError) {
            return `Learner transfer was not confirmed: ${errorMessage(transferError)}`;
        }
    }
    async function updateLearnerProfile(input) {
        if (!schoolId)
            return "Select an active school before editing a learner.";
        try {
            const result = await supabase.rpc("update_school_learner_profile", {
                p_school_id: schoolId, p_learner_id: input.learnerId, p_first_name: input.firstName,
                p_other_name: input.otherName, p_last_name: input.lastName, p_gender: input.gender,
                p_date_of_birth: input.dateOfBirth || null, p_guardian_name: input.guardianName,
                p_guardian_phone: input.guardianPhone,
            });
            if (result.error)
                return result.error.message;
            if (result.data !== input.learnerId)
                return "The database did not confirm the learner profile update.";
            const refresh = await reload();
            return refresh.ok ? null : `The profile was saved but the register could not refresh. Verify before retrying. ${refresh.error}`;
        }
        catch (updateError) {
            return `Learner profile update was not confirmed: ${errorMessage(updateError)}`;
        }
    }
    return { schoolId, ...data, loading: loading || context.loading, error, reload, createLearner, transferLearner, updateLearnerProfile };
}
