import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { applyResolvedIdentity, currentUser } from "../../config/currentUser";
import { resolveCurrentIdentity } from "../auth/authSession";
const empty = {
    schoolId: "", schoolName: "", schoolShortName: "", schoolLogo: "", schoolProfileStatus: "LOADING",
    academicYearId: "", academicYearName: "", academicYearStatus: "", termId: "", termName: "", termStatus: "", academicLevel: "",
    schools: [], academicYears: [], terms: [], loading: true, error: "", contextIssue: "",
    selectSchool: () => undefined, selectAcademicYear: () => undefined, selectTerm: () => undefined, refresh: async () => undefined, clearContextIssue: () => undefined,
};
const Context = createContext(empty);
const SCHOOL_KEY = "ourschool.context.school";
const YEAR_KEY = "ourschool.context.year";
const TERM_KEY = "ourschool.context.term";
const invalidName = (value) => !value || /^(school|school profile not configured|school profile pending)$/i.test(value.trim()) || /not configured|profile pending/i.test(value);
export function SchoolContextProvider({ children }) {
    const [schools, setSchools] = useState([]);
    const [years, setYears] = useState([]);
    const [allTerms, setAllTerms] = useState([]);
    const [schoolId, setSchoolId] = useState("");
    const [academicYearId, setAcademicYearId] = useState("");
    const [termId, setTermId] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [contextIssue, setContextIssue] = useState("");
    const requestedSchool = useRef("");
    const refreshVersion = useRef(0);
    const notify = useCallback(async (id, issue, details = {}) => {
        await supabase?.rpc("notify_school_context_issue", { p_school_id: id, p_issue_code: issue, p_details: details });
    }, []);
    const refresh = useCallback(async () => {
        const version = ++refreshVersion.current;
        const isCurrent = () => version === refreshVersion.current;
        const client = supabase;
        setLoading(true);
        setError("");
        setContextIssue("");
        // Prevent pages from continuing to present the previous tenant while a new
        // membership/year/term snapshot is being resolved.
        setSchools([]);
        setSchoolId("");
        setAcademicYearId("");
        setTermId("");
        setYears([]);
        setAllTerms([]);
        if (!client) {
            requestedSchool.current = "";
            setError("Supabase is not configured.");
            setLoading(false);
            return;
        }
        try {
            const { data: auth } = await client.auth.getUser();
            if (!isCurrent())
                return;
            if (!auth?.user)
                throw new Error("Sign in is required to load the school workspace.");
            const userResult = await client.from("users").select("id").eq("auth_user_id", auth.user.id).eq("is_active", true).maybeSingle();
            if (!isCurrent())
                return;
            if (userResult.error)
                throw userResult.error;
            if (!userResult.data)
                throw new Error("The signed-in account is not linked to an active school user.");
            const membershipResult = await client.from("school_memberships").select("school_id,updated_at").eq("user_id", userResult.data.id).eq("status", "ACTIVE").order("updated_at", { ascending: false });
            if (!isCurrent())
                return;
            if (membershipResult.error)
                throw membershipResult.error;
            const ids = [...new Set((membershipResult.data ?? []).map((item) => item.school_id))];
            if (!ids.length)
                throw new Error("No active school membership was found.");
            const [schoolResult, profileResult, yearResult] = await Promise.all([
                client.from("schools").select("id,official_name,short_name,logo_url,school_level").in("id", ids),
                client.from("school_profiles").select("school_id,official_name,short_name,logo_url,profile_status").in("school_id", ids),
                client.from("academic_years").select("id,school_id,name,status,starts_on,ends_on").in("school_id", ids).order("starts_on", { ascending: false }),
            ]);
            if (!isCurrent())
                return;
            if (schoolResult.error)
                throw schoolResult.error;
            if (profileResult.error)
                throw profileResult.error;
            if (yearResult.error)
                throw yearResult.error;
            const profileMap = new Map((profileResult.data ?? []).map((item) => [item.school_id, item]));
            const options = (schoolResult.data ?? []).map((school) => {
                const profile = profileMap.get(school.id);
                const valid = Boolean(profile) && profile.profile_status === "CONFIGURED" && !invalidName(profile.official_name);
                return {
                    schoolId: school.id,
                    schoolName: valid ? profile.official_name : "School setup requires attention",
                    schoolShortName: valid ? profile.short_name || profile.official_name : "Setup required",
                    // The school row is the immediately updated tenant branding source;
                    // use the canonical profile only as a backfill for older tenants.
                    schoolLogo: valid ? school.logo_url || profile.logo_url || "" : "",
                    schoolProfileStatus: valid ? "CONFIGURED" : "REQUIRES_REPAIR",
                    academicLevel: school.school_level || "",
                };
            }).sort((a, b) => Number(b.schoolProfileStatus === "CONFIGURED") - Number(a.schoolProfileStatus === "CONFIGURED"));
            setSchools(options);
            const storedSchool = window.localStorage.getItem(SCHOOL_KEY);
            // Server-side preference is authoritative across browsers and sessions.
            // If an older database has not received the preference migration yet,
            // retain the existing membership-validated local fallback.
            const preferenceResult = await client.rpc("get_my_school_context_preference");
            if (!isCurrent())
                return;
            const preferredSchoolId = preferenceResult.error ? "" : String(preferenceResult.data ?? "");
            const configuredOptions = options.filter((item) => item.schoolProfileStatus === "CONFIGURED");
            const storedOption = options.find((item) => item.schoolId === storedSchool);
            const preferredOption = options.find((item) => item.schoolId === preferredSchoolId);
            const requestedOption = options.find((item) => item.schoolId === requestedSchool.current);
            requestedSchool.current = "";
            const resolvedSchool = requestedOption?.schoolId
                ?? preferredOption?.schoolId
                ?? (storedOption?.schoolProfileStatus === "CONFIGURED" ? storedOption.schoolId : undefined)
                ?? configuredOptions.find((item) => item.schoolId === currentUser.schoolId)?.schoolId
                ?? configuredOptions[0]?.schoolId ?? storedOption?.schoolId ?? options[0]?.schoolId ?? "";
            if (!isCurrent())
                return;
            requestedSchool.current = "";
            setSchoolId(resolvedSchool);
            window.localStorage.setItem(SCHOOL_KEY, resolvedSchool);
            const mappedYears = (yearResult.data ?? []).map((item) => ({
                id: item.id, schoolId: item.school_id, name: item.name, status: item.status, startsOn: item.starts_on, endsOn: item.ends_on,
            }));
            const selectedYears = mappedYears.filter((item) => item.schoolId === resolvedSchool);
            setYears(selectedYears);
            const yearIds = mappedYears.map((item) => item.id);
            const termResult = yearIds.length
                ? await client.from("terms").select("id,academic_year_id,name,lifecycle_status,starts_on,ends_on").in("academic_year_id", yearIds).order("starts_on", { ascending: false })
                : { data: [], error: null };
            if (!isCurrent())
                return;
            if (termResult.error)
                throw termResult.error;
            const mappedTerms = (termResult.data ?? []).map((item) => ({
                id: item.id, academicYearId: item.academic_year_id, name: item.name, status: item.lifecycle_status, startsOn: item.starts_on, endsOn: item.ends_on,
            }));
            setAllTerms(mappedTerms);
            const storedYear = window.localStorage.getItem(`${YEAR_KEY}.${resolvedSchool}`);
            const validStoredYear = selectedYears.find((item) => item.id === storedYear);
            if (storedYear && !validStoredYear) {
                setContextIssue("ACADEMIC_YEAR_UNAVAILABLE");
                void notify(resolvedSchool, "ACADEMIC_YEAR_UNAVAILABLE", { academicYearId: storedYear });
            }
            const resolvedYear = validStoredYear?.id ?? selectedYears.find((item) => item.status === "ACTIVE")?.id ?? selectedYears[0]?.id ?? "";
            setAcademicYearId(resolvedYear);
            if (resolvedYear)
                window.localStorage.setItem(`${YEAR_KEY}.${resolvedSchool}`, resolvedYear);
            const selectedTerms = mappedTerms.filter((item) => item.academicYearId === resolvedYear);
            const storedTerm = window.localStorage.getItem(`${TERM_KEY}.${resolvedYear}`);
            const validStoredTerm = selectedTerms.find((item) => item.id === storedTerm);
            if (storedTerm && !validStoredTerm) {
                setContextIssue("TERM_UNAVAILABLE");
                void notify(resolvedSchool, "TERM_UNAVAILABLE", { termId: storedTerm, academicYearId: resolvedYear });
            }
            const resolvedTerm = validStoredTerm?.id ?? selectedTerms.find((item) => ["OPEN", "MARKS_OPEN", "REVIEW"].includes(item.status))?.id ?? selectedTerms[0]?.id ?? "";
            setTermId(resolvedTerm);
            if (resolvedTerm)
                window.localStorage.setItem(`${TERM_KEY}.${resolvedYear}`, resolvedTerm);
            const selectedSchool = options.find((item) => item.schoolId === resolvedSchool);
            if (selectedSchool?.schoolProfileStatus !== "CONFIGURED") {
                setContextIssue("PROFILE_REQUIRED");
                void notify(resolvedSchool, "PROFILE_REQUIRED");
            }
        }
        catch (reason) {
            if (isCurrent()) {
                requestedSchool.current = "";
                setError(reason instanceof Error ? reason.message : "The school workspace context could not be loaded.");
            }
        }
        finally {
            if (isCurrent())
                setLoading(false);
        }
    }, [notify]);
    useEffect(() => { void refresh(); }, [refresh]);
    function selectSchool(id) {
        if (!schools.some((item) => item.schoolId === id) || id === schoolId)
            return;
        const client = supabase;
        if (!client)
            return;
        setContextIssue("");
        setError("");
        setLoading(true);
        void (async () => {
            const { error: preferenceError } = await client.rpc("set_my_school_context", { p_school_id: id });
            if (preferenceError)
                throw preferenceError;
            requestedSchool.current = id;
            window.localStorage.setItem(SCHOOL_KEY, id);
            const resolved = await resolveCurrentIdentity();
            if (resolved.error || !resolved.user || resolved.user.schoolId !== id) {
                throw new Error(resolved.error || "Your active role for this school could not be refreshed.");
            }
            applyResolvedIdentity(resolved.user);
            await refresh();
        })().catch((reason) => {
            requestedSchool.current = "";
            setError(reason instanceof Error ? reason.message : "The selected school could not be activated.");
            setLoading(false);
        });
    }
    function selectAcademicYear(id) {
        if (!years.some((item) => item.id === id))
            return;
        setAcademicYearId(id);
        window.localStorage.setItem(`${YEAR_KEY}.${schoolId}`, id);
        const choices = allTerms.filter((item) => item.academicYearId === id);
        const next = choices.find((item) => ["OPEN", "MARKS_OPEN", "REVIEW"].includes(item.status)) ?? choices[0];
        setTermId(next?.id ?? "");
        if (next)
            window.localStorage.setItem(`${TERM_KEY}.${id}`, next.id);
        setContextIssue("");
    }
    function selectTerm(id) { const choices = allTerms.filter((item) => item.academicYearId === academicYearId); if (!choices.some((item) => item.id === id))
        return; setTermId(id); window.localStorage.setItem(`${TERM_KEY}.${academicYearId}`, id); setContextIssue(""); }
    const selectedSchool = schools.find((item) => item.schoolId === schoolId);
    const selectedYear = years.find((item) => item.id === academicYearId);
    const terms = allTerms.filter((item) => item.academicYearId === academicYearId);
    const selectedTerm = terms.find((item) => item.id === termId);
    const value = useMemo(() => ({
        schoolId, schoolName: selectedSchool?.schoolName ?? "", schoolShortName: selectedSchool?.schoolShortName ?? "", schoolLogo: selectedSchool?.schoolLogo ?? "",
        schoolProfileStatus: selectedSchool?.schoolProfileStatus ?? (loading ? "LOADING" : "REQUIRES_REPAIR"),
        academicYearId, academicYearName: selectedYear?.name ?? "", academicYearStatus: selectedYear?.status ?? "",
        termId, termName: selectedTerm?.name ?? "", termStatus: selectedTerm?.status ?? "", academicLevel: selectedSchool?.academicLevel ?? "",
        schools, academicYears: years, terms, loading, error, contextIssue, selectSchool, selectAcademicYear, selectTerm, refresh, clearContextIssue: () => setContextIssue(""),
    }), [schoolId, selectedSchool, academicYearId, selectedYear, termId, selectedTerm, schools, years, terms, loading, error, contextIssue, refresh]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSchoolContext() { return useContext(Context); }
