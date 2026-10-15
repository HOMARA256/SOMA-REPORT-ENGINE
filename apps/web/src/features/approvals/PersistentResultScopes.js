import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
function message(error) { return error instanceof Error ? error.message : "Unexpected Supabase result workflow error."; }
export function usePersistentResultScopes() {
    const school = useSchoolContext();
    const [scopes, setScopes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const loadScopes = useCallback(async () => {
        if (school.loading)
            return { error: null, scopes: [] };
        if (!school.termId) {
            setScopes([]);
            setError("Select an academic term to review class results.");
            setLoading(false);
            return { error: "Select an academic term to review class results.", scopes: [] };
        }
        setLoading(true);
        setError("");
        try {
            const result = await supabase.rpc("get_academic_result_scopes", { p_term_id: school.termId });
            if (result.error)
                throw new Error(result.error.message);
            const loadedScopes = (result.data ?? []);
            setScopes(loadedScopes);
            return { error: null, scopes: loadedScopes };
        }
        catch (loadError) {
            const reason = `Persistent result scopes could not load: ${message(loadError)}`;
            setScopes([]);
            setError(reason);
            return { error: reason, scopes: [] };
        }
        finally {
            setLoading(false);
        }
    }, [school.loading, school.termId]);
    const reload = useCallback(async () => (await loadScopes()).error, [loadScopes]);
    useEffect(() => { void reload(); }, [reload]);
    async function lock(classId, note) {
        if (!school.termId)
            return "Select an academic term before locking results.";
        if (!note.trim())
            return "Enter a lock reason.";
        try {
            const result = await supabase.rpc("lock_academic_class_results", {
                p_term_id: school.termId, p_class_id: classId, p_note: note.trim(),
            });
            if (result.error)
                return result.error.message;
            if (typeof result.data !== "string" || !result.data)
                return "Supabase did not return a result-scope ID. Refresh the page and verify before retrying.";
            const refreshed = await loadScopes();
            if (refreshed.error)
                return `The result lock was saved, but its status could not be verified. Refresh before retrying. ${refreshed.error}`;
            const confirmed = refreshed.scopes.find((scope) => scope.id === result.data && scope.classId === classId);
            return confirmed ? null : "Supabase returned success, but the saved lock was not visible in the refreshed result scopes. Refresh and verify before retrying.";
        }
        catch (lockError) {
            return `The result lock was not confirmed: ${message(lockError)}`;
        }
    }
    async function approve(scopeId, note) {
        if (!note.trim())
            return "Enter an approval reason.";
        try {
            const result = await supabase.rpc("approve_academic_class_results", {
                p_result_scope_id: scopeId, p_note: note.trim(),
            });
            if (result.error)
                return result.error.message;
            const refreshed = await loadScopes();
            if (refreshed.error)
                return `Approval was saved, but its status could not be verified. Refresh before retrying. ${refreshed.error}`;
            const confirmed = refreshed.scopes.find((scope) => scope.id === scopeId && scope.status === "APPROVED");
            return confirmed ? null : "Supabase returned success, but the approved status was not visible after refresh. Verify before retrying.";
        }
        catch (approvalError) {
            return `Approval was not confirmed: ${message(approvalError)}`;
        }
    }
    return { scopes, loading: loading || school.loading, error, reload, lock, approve };
}
