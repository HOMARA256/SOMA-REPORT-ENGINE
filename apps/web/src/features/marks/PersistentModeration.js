import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
export function usePersistentModeration(enabled = true) {
    const school = useSchoolContext();
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const requestVersion = useRef(0);
    const reload = useCallback(async () => {
        const version = ++requestVersion.current;
        const isCurrent = () => version === requestVersion.current;
        if (!enabled) {
            setSubmissions([]);
            setError("");
            setLoading(false);
            return null;
        }
        if (school.loading)
            return null;
        if (school.error || !school.schoolId) {
            const reason = school.error || "Select an active school before loading the moderation queue.";
            setSubmissions([]);
            setError(reason);
            setLoading(false);
            return reason;
        }
        if (!school.termId) {
            setSubmissions([]);
            setError("");
            setLoading(false);
            return null;
        }
        setLoading(true);
        setError("");
        setSubmissions([]);
        let result;
        try {
            result = await supabase.rpc("get_academic_mark_moderation_queue", { p_term_id: school.termId });
        }
        catch (cause) {
            const message = cause instanceof Error ? cause.message : "Unexpected connection error.";
            if (!isCurrent())
                return null;
            const reason = `Moderation queue could not load: ${message}`;
            setSubmissions([]);
            setError(reason);
            setLoading(false);
            return reason;
        }
        if (!isCurrent())
            return null;
        if (result.error) {
            setError(`Moderation queue could not load: ${result.error.message}`);
            setLoading(false);
            return `Moderation queue could not load: ${result.error.message}`;
        }
        setSubmissions((result.data ?? []));
        setError("");
        setLoading(false);
        return null;
    }, [enabled, school.error, school.loading, school.schoolId, school.termId]);
    useEffect(() => {
        if (!enabled) {
            requestVersion.current += 1;
            setSubmissions([]);
            setError("");
            setLoading(false);
            return;
        }
        if (school.loading) {
            requestVersion.current += 1;
            setSubmissions([]);
            setError("");
            setLoading(true);
            return;
        }
        void reload();
        return () => { requestVersion.current += 1; };
    }, [enabled, reload, school.loading]);
    async function decide(id, decision, note) {
        if (!note.trim())
            return "A reviewer note is required.";
        try {
            const result = await supabase.rpc("review_academic_mark_submission", {
                p_submission_id: id, p_decision: decision, p_note: note.trim(),
            });
            if (result.error)
                return result.error.message;
            const refreshError = await reload();
            return refreshError ? `Decision was saved, but the moderation queue could not refresh. Verify before repeating. ${refreshError}` : null;
        }
        catch (error) {
            return error instanceof Error ? error.message : "Moderation decision was not confirmed.";
        }
    }
    return { submissions, loading: loading || school.loading, error, reload, decide };
}
