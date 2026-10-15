import { supabase } from "../../config/supabaseClient";
/** Uses the same school-authorized directory RPC as Staff; never queries a client-selected tenant table directly. */
export async function fetchSchoolTeacherDirectory(schoolId) {
    if (!schoolId)
        throw new Error("Select an active school before loading staff.");
    if (!supabase)
        throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.rpc("get_school_teacher_directory", { p_school_id: schoolId });
    if (error)
        throw new Error(error.message || "Staff directory could not be loaded.");
    if (data == null)
        return [];
    if (!Array.isArray(data))
        throw new Error("Staff directory returned an unexpected response.");
    return data;
}
