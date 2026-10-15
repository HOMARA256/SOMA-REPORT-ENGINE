import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { platformSupabase as supabase } from "../../config/supabaseClient";
import { resolveCurrentIdentity } from "../auth/authSession";
import { edgeFunctionErrorCode } from "../../utils/edgeFunctionError";

export const PLATFORM_ADMIN_EMAIL = "omarawilliam83@gmail.com";
export const ANNUAL_PLAN = { id: "ourschool-annual", code: "OURSCHOOL_ANNUAL", name: "SOMA REPORT ENGINE Annual Subscription", currency: "UGX" as const, amount: 800_000, unitPrice: 8_000, minimumLearners: 100, billingPeriod: "ACADEMIC_YEAR" as const };
export const TERMLY_PLAN = { id: "ourschool-termly-v2", code: "OURSCHOOL_TERMLY_V2", name: "SOMA REPORT ENGINE Termly Subscription", currency: "UGX" as const, amount: 300_000, unitPrice: 3_000, minimumLearners: 100, billingPeriod: "ACADEMIC_TERM" as const };
export function subscriptionAmount(activeLearners: number, cadence: "ANNUAL" | "TERMLY") { const plan=cadence==="ANNUAL"?ANNUAL_PLAN:TERMLY_PLAN; return Math.max(plan.amount,Math.max(0,Math.floor(activeLearners))*plan.unitPrice); }
export function onboardingFee(activeLearners:number){return activeLearners<=300?500_000:activeLearners<=1_000?1_500_000:activeLearners<=2_000?3_000_000:6_150_000;}
export type PlatformSchoolStatus = "PENDING" | "TRIAL" | "ACTIVE" | "PAYMENT_DUE" | "GRACE_PERIOD" | "SUSPENDED" | "CANCELLED" | "ARCHIVED";
export type HealthState = "HEALTHY" | "WARNING" | "DEGRADED" | "FAILED";
export type InvitationStatus = "PENDING" | "SENT" | "DELIVERED" | "ACCEPTED" | "EXPIRED" | "REVOKED" | "FAILED";
export type OnboardingStatus = "REGISTERED" | "ADMIN_INVITED" | "ADMIN_ACTIVATED" | "SETUP_IN_PROGRESS" | "READY" | "ACTIVE";
export type AcademicTerm = "Term I" | "Term II" | "Term III";
export type PlatformPayment = { id: string; reference: string; date: string; amount: number; currency: "UGX"; method: string; transactionReference: string; status: "PENDING" | "CONFIRMED" | "REVERSED" | "FAILED"; academicYear: number; term: AcademicTerm };
export type BillingPeriod = { id: string; academicYear: number; term: AcademicTerm; planCode: string; amount: number; currency: "UGX"; billingPeriod: "ACADEMIC_TERM"; startDate: string; dueDate: string; endDate: string; status: "DUE" | "PART_PAID" | "PAID" | "GRACE_PERIOD" | "SUSPENDED" | "CANCELLED"; amountPaid: number; paymentDate?: string; transactionReference?: string };
export type PlatformAuditEvent = { id: string; schoolId: string; action: string; detail: string; timestamp: string };
export type PlatformFeature = { label: string; plan: boolean; override: "DEFAULT" | "ENABLED" | "DISABLED"; globalEnabled?: boolean; overridePermitted?: boolean };
export type SchoolCoordinationYear = { id: string; name: string; status: string; classes: number; activeClasses: number; learners: number; subjectOfferings: number; classSubjectLinks: number; learnerSubjectSelections: number; oLevelCombinations: number; aLevelCombinations: number; aLevelAssignments: number; teacherAllocations: number; assessments: number; markRecords: number; aLevelPaperMarks: number; markSubmissions: number; lockedOrApprovedClasses: number; reportSnapshots: number; reportJobs: number };
export type SchoolCoordination = { schoolId: string; schoolName: string; schoolCode: string; checkedAt: string; database: "CONNECTED"; activeMemberships: number; activeStaffMemberships: number; integrity: Record<string, number>; academicYears: SchoolCoordinationYear[] };
export type TenantReadiness = {
  schoolId: string; schoolName: string; schoolCode: string; lifecycleStatus: string;
  onboardingStatus: string | null; invitationStatus: string | null; adminMembershipStatus: string | null;
  academicYearName: string | null; academicYearStatus: string | null; selectedTermName: string | null;
  selectedTermStatus: string | null; hasSubscription: boolean; requiredOLevelExpected: number;
  requiredOLevelLinked: number; readyForSchoolWork: boolean; setupIssues: string[];
};
export type PlatformSchool = {
  id: string; name: string; code: string; location: string; contact: string; phone: string; email: string; programmes: string[]; registeredAt: string; activationDate: string;
  accountStatus: PlatformSchoolStatus; plan: string; subscriptionStatus: "TRIAL" | "ACTIVE" | "PAYMENT_DUE" | "GRACE_PERIOD" | "SUSPENDED" | "CANCELLED" | "EXPIRED"; subscriptionStart: string; subscriptionExpiry: string; gracePeriodDays: number; onboardingStatus: OnboardingStatus; currentAcademicYear: number; currentTerm: AcademicTerm;
  admin: { name: string; email: string; telephone: string; status: "INVITED" | "ACTIVE" | "LOCKED" | "DISABLED"; invitation: InvitationStatus; invitationSentAt?: string; acceptedAt?: string; lastLogin: string; mfa: boolean };
  lastActivity: string; storageUsedGb: number; storageLimitGb: number; health: HealthState; usage: { users: number; learners: number; staff: number; classes: number; reports: number; imports: number; exports: number; supportRequests?: number };
  features: Record<string, PlatformFeature>; featureConnectionAvailable?: boolean; payments: PlatformPayment[]; billingPeriods: BillingPeriod[];
};

const initialSchools: PlatformSchool[] = [];

async function loadPlatformSchools(): Promise<PlatformSchool[]> {
  if (!supabase) return [];
  const { data, error } = await (supabase as unknown as RegistrationRpcClient).rpc("get_platform_school_directory", {});
  if (error) throw new Error(error.message);
  // Older deployments may still return the historical display label. Keep
  // the stable plan code untouched, but never surface that label in the UI.
  const schools = Array.isArray(data) ? (data as PlatformSchool[]).map((school) => ({
    ...school,
    plan: school.plan?.startsWith("OURSCHOOL ")
      ? school.plan.replace(/^OURSCHOOL /, "SOMA REPORT ENGINE ") as PlatformSchool["plan"]
      : school.plan,
  })) : [];
  if (!schools.length) return schools;
  const featureResult = await (supabase as unknown as RegistrationRpcClient).rpc("get_platform_feature_directory", {});
  if (featureResult.error || !Array.isArray(featureResult.data)) {
    return schools.map((school) => ({ ...school, features: {}, featureConnectionAvailable: false }));
  }
  const featureMap = new Map((featureResult.data as Array<{ schoolId: string; features: Record<string, PlatformFeature> }>).map((row) => [row.schoolId, row.features]));
  return schools.map((school) => ({ ...school, features: featureMap.get(school.id) ?? {}, featureConnectionAvailable: featureMap.has(school.id) }));
}

async function loadPlatformActivity(): Promise<PlatformAuditEvent[]> {
  if (!supabase) return [];
  const { data, error } = await (supabase as unknown as RegistrationRpcClient).rpc("get_platform_recent_activity", { p_limit: 20 });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as PlatformAuditEvent[]) : [];
}

export type UgandaLocation = { id: string; name: string; code: string; level: string };
export type NewSchoolInput = {
  draftId: string; name: string; shortName: string; code: string; schoolLevel: "UCE_ONLY"|"UACE_ONLY"|"BOTH"; schoolType: string;
  email: string; phone: string; website: string; emisNumber: string; countryId: string; regionId: string; subRegionId: string;
  districtCityId: string; countyDivisionId: string; localGovernmentId: string; parishWardId: string; villageZoneId: string;
  district: string; address: string; plotRoad: string; landmark: string; postalAddress: string; latitude: string; longitude: string;
  academicYear: number; currentTerm: "TERM_I"|"TERM_II"|"TERM_III"; curriculumStartYear: string;
  planCode: "OURSCHOOL_ANNUAL"|"OURSCHOOL_TERMLY_V2"; billingCadence: "ANNUAL"|"TERMLY"; subscriptionStart: string;
  trialStart: string; trialEnd: string; activeLearners: number; supportApproval: string; paymentStatus: "PENDING"|"PAID"|"WAIVED"|"TRIAL";
  notes: string; requiresMfa: boolean; adminName: string; adminEmail: string; adminPhone: string; adminJobTitle: string;
};

type RegistrationRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};
type PlatformControlRpcClient = RegistrationRpcClient;

export async function loadSchoolCoordination(schoolId: string): Promise<SchoolCoordination> {
  if (!supabase) throw new Error("Supabase is not configured for this deployment.");
  const { data, error } = await (supabase as unknown as RegistrationRpcClient).rpc("get_platform_school_coordination", { p_school_id: schoolId });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("The platform coordination report returned no data.");
  return data as SchoolCoordination;
}

export async function loadAllSchoolCoordination(): Promise<SchoolCoordination[]> {
  if (!supabase) throw new Error("Supabase is not configured for this deployment.");
  const { data, error } = await (supabase as unknown as RegistrationRpcClient).rpc("get_platform_school_coordination", { p_school_id: null });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error("The platform coordination overview returned no school list.");
  return data as SchoolCoordination[];
}

export async function loadAllTenantReadiness(): Promise<TenantReadiness[]> {
  if (!supabase) throw new Error("Supabase is not configured for this deployment.");
  const { data, error } = await (supabase as unknown as RegistrationRpcClient).rpc("get_platform_tenant_readiness", { p_school_id: null });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error("The tenant readiness report returned no school list.");
  return (data as Array<Record<string, unknown>>).map((row) => ({
    schoolId: String(row.school_id ?? ""), schoolName: String(row.school_name ?? ""), schoolCode: String(row.school_code ?? ""),
    lifecycleStatus: String(row.lifecycle_status ?? "UNKNOWN"), onboardingStatus: row.onboarding_status == null ? null : String(row.onboarding_status),
    invitationStatus: row.latest_invitation_status == null ? null : String(row.latest_invitation_status),
    adminMembershipStatus: row.school_admin_membership_status == null ? null : String(row.school_admin_membership_status),
    academicYearName: row.academic_year_name == null ? null : String(row.academic_year_name),
    academicYearStatus: row.academic_year_status == null ? null : String(row.academic_year_status),
    selectedTermName: row.selected_term_name == null ? null : String(row.selected_term_name),
    selectedTermStatus: row.selected_term_status == null ? null : String(row.selected_term_status),
    hasSubscription: row.has_subscription === true, requiredOLevelExpected: Number(row.required_o_level_expected ?? 0),
    requiredOLevelLinked: Number(row.required_o_level_linked ?? 0), readyForSchoolWork: row.ready_for_school_work === true,
    setupIssues: Array.isArray(row.setup_issues) ? row.setup_issues.map(String) : [],
  }));
}

export async function loadUgandaLocationChildren(parentId: string | null): Promise<UgandaLocation[]> {
  if (!supabase) return [];
  const { data, error } = await (supabase as unknown as RegistrationRpcClient).rpc("list_uganda_location_children", { p_parent_id: parentId });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data as UgandaLocation[] : [];
}

export async function saveSchoolRegistrationDraft(draftId: string, currentStep: number, payload: NewSchoolInput): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured for this deployment.");
  const { data, error } = await (supabase as unknown as RegistrationRpcClient).rpc("save_school_registration_draft", {
    p_draft_id: draftId || null, p_current_step: currentStep, p_payload: payload,
  });
  if (error || typeof data !== "string") throw new Error(error?.message ?? "The registration draft could not be saved.");
  return data;
}
type PlatformWorkspaceValue = { authenticated: boolean; schools: PlatformSchool[]; schoolsLoading: boolean; schoolsError: string; reloadSchools: () => Promise<void>; audit: PlatformAuditEvent[]; notice: string; signIn: (email: string, password: string) => Promise<boolean>; signOut: () => void; clearNotice: () => void; schoolById: (id: string) => PlatformSchool | undefined; registerSchool: (input: NewSchoolInput) => Promise<string>; changeStatus: (schoolId: string, status: PlatformSchoolStatus, reason: string) => Promise<void>; setGracePeriod: (schoolId: string, days: number, reason: string) => Promise<void>; setFeatureOverride: (schoolId: string, key: string, state: PlatformFeature["override"], reason: string) => Promise<boolean>; adminAction: (schoolId: string, action: "RESEND_INVITATION" | "REVOKE_INVITATION" | "UNLOCK" | "DISABLE" | "RESTORE" | "PASSWORD_RESET", reason?: string) => Promise<void>; previewSchoolRepair: (schoolId: string) => Promise<string[]>; repairSchool: (schoolId: string) => Promise<void>; createDemoSchool: () => Promise<void>; resetDemoSchool: (schoolId: string) => Promise<void> };
const PlatformWorkspaceContext = createContext<PlatformWorkspaceValue | null>(null);

export function PlatformWorkspaceProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false); const [schools, setSchools] = useState(initialSchools); const [notice, setNotice] = useState("");
  const [schoolsLoading, setSchoolsLoading] = useState(false); const [schoolsError, setSchoolsError] = useState("");
  const [audit, setAudit] = useState<PlatformAuditEvent[]>([]);
  function record(schoolId: string, action: string, detail: string) { setAudit((items) => [{ id: `audit-${Date.now()}`, schoolId, action, detail, timestamp: new Date().toLocaleString("en-GB") }, ...items]); setNotice(detail); }
  useEffect(() => {
    let active = true;
    async function verify() {
      if (!supabase) return active && setAuthenticated(false);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return active && setAuthenticated(false);
      const { data: administrator } = await supabase.from("platform_admins").select("id").eq("auth_user_id", userData.user.id).eq("is_active", true).maybeSingle();
      if (active) setAuthenticated(Boolean(administrator));
    }
    void verify();
    const { data } = supabase?.auth.onAuthStateChange(() => void verify()) ?? { data: { subscription: null } };
    return () => { active = false; data.subscription?.unsubscribe(); };
  }, []);
  const reloadSchools = useCallback(async () => {
    if (!authenticated) return;
    setSchoolsLoading(true); setSchoolsError("");
    try {
      const [directory, activity] = await Promise.all([loadPlatformSchools(), loadPlatformActivity().catch(() => null)]);
      setSchools(directory);
      if (activity) setAudit(activity);
    }
    catch (reason) { setSchoolsError(reason instanceof Error ? reason.message : "The live school directory could not be loaded."); }
    finally { setSchoolsLoading(false); }
  }, [authenticated]);
  useEffect(() => { void reloadSchools(); }, [reloadSchools]);
  const value = useMemo<PlatformWorkspaceValue>(() => ({
    authenticated, schools, schoolsLoading, schoolsError, reloadSchools, audit, notice,
    async signIn(email, password) {
      if (!email.trim() || !password.trim() || !supabase) return false;
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error || !data.user) return false;
        const resolved=await resolveCurrentIdentity(supabase);
        if (!resolved.user || resolved.user.role!=="PLATFORM_ADMIN") {
          await supabase.auth.signOut({ scope: "local" });
          return false;
        }
        setAuthenticated(true); return true;
      } catch { return false; }
    },
    signOut() { void supabase?.auth.signOut({scope:"local"}); setAuthenticated(false); setSchools([]); setAudit([]); setNotice(""); }, clearNotice() { setNotice(""); }, schoolById: (id) => schools.find((school) => school.id === id),
    async registerSchool(input) {
      if (!supabase) throw new Error("Supabase is not configured for this deployment.");
      const { data, error } = await supabase.functions.invoke("register-school", { body: {
        draftId: input.draftId || undefined, schoolName: input.name, shortName: input.shortName, schoolCode: input.code,
        schoolLevel: input.schoolLevel, schoolType: input.schoolType, website: input.website, location: {
          countryId: input.countryId, regionId: input.regionId, subRegionId: input.subRegionId, districtCityId: input.districtCityId,
          countyDivisionId: input.countyDivisionId, localGovernmentId: input.localGovernmentId, parishWardId: input.parishWardId,
          villageZoneId: input.villageZoneId, plotRoad: input.plotRoad, landmark: input.landmark, postalAddress: input.postalAddress,
          latitude: input.latitude || null, longitude: input.longitude || null,
        }, district: input.district, emisNumber: input.emisNumber, address: input.address, schoolEmail: input.email,
        schoolPhone: input.phone, adminName: input.adminName, adminEmail: input.adminEmail, adminPhone: input.adminPhone,
        adminJobTitle: input.adminJobTitle, academicYear: input.academicYear, currentTerm: input.currentTerm,
        curriculumStartYear: input.curriculumStartYear || null, activeLearners: input.activeLearners, paymentStatus: input.paymentStatus,
        trialStart: input.trialStart || null, trialEnd: input.trialEnd || null, supportApproval: input.supportApproval,
        planCode: input.planCode, billingCadence: input.billingCadence, subscriptionStart: input.subscriptionStart,
        trialDays: input.trialStart && input.trialEnd ? Math.max(0,Math.ceil((new Date(input.trialEnd).getTime()-new Date(input.trialStart).getTime())/86400000)) : 0,
        notes: input.notes, requiresMfa: input.requiresMfa,
      }});
      if (error || !data?.schoolId) {
        const code=String(data?.error??"");
        const messages:Record<string,string>={VALID_UGANDA_LOCATION_REQUIRED:"Select Uganda, a region, a verified district and a subcounty.",REQUIRED_FIELDS_MISSING:"Complete every required registration field before submitting.",SCHOOL_CODE_EXISTS:"That school code is already registered. Choose another code.",ADMIN_USERNAME_EXISTS:"That administrator username already exists.",ACTIVE_PLAN_NOT_FOUND:"The selected subscription plan is unavailable.",SCHOOL_ADMIN_ROLE_NOT_FOUND:"The School Administrator role is not configured.",RATE_LIMITED:"Too many registration attempts. Wait 15 minutes and try again.",ADMIN_IDENTITY_CREATION_FAILED:"The administrator identity could not be created. Confirm the email address and try again.",ADMIN_EMAIL_RESERVED_FOR_PLATFORM:"That email belongs to a Platform Administrator and cannot be used as a School Administrator."};
        throw new Error(messages[code]??"Secure school registration could not be completed. The server has recorded the failure for review.");
      }
      record(data.schoolId,"SCHOOL_REGISTERED",`${input.name} was registered. Invitation status: ${data.invitationStatus}.`);
      setSchools(await loadPlatformSchools());
      return data.schoolId as string;
    },
    async changeStatus(schoolId, status, reason) { if (!supabase) throw new Error("Supabase is not configured."); const action = status === "ACTIVE" ? "ACTIVATE" : status === "ARCHIVED" ? "ARCHIVE" : "SUSPEND"; const { error } = await (supabase as unknown as PlatformControlRpcClient).rpc("apply_platform_school_control", { p_action: action, p_grace_days: null, p_reason: reason, p_school_id: schoolId }); if (error) throw new Error(error.message); setSchools(await loadPlatformSchools()); },
    async setGracePeriod(schoolId, days, reason) { if (!supabase) throw new Error("Supabase is not configured."); const { error } = await (supabase as unknown as PlatformControlRpcClient).rpc("apply_platform_school_control", { p_action: "SET_GRACE_PERIOD", p_grace_days: days, p_reason: reason, p_school_id: schoolId }); if (error) throw new Error(error.message); setSchools(await loadPlatformSchools()); },
    async setFeatureOverride(schoolId, key, state, reason) {
      if (!supabase) throw new Error("Supabase is not configured.");
      if (!reason.trim()) throw new Error("Enter a reason for changing the school entitlement.");
      const { data, error } = await (supabase as unknown as PlatformControlRpcClient).rpc("set_platform_school_feature_override", {
        p_school_id: schoolId, p_feature_key: key, p_override_state: state, p_reason: reason.trim(),
      });
      if (error) throw new Error(error.message);
      const unchanged = Boolean((data as { changed?: boolean } | null)?.changed === false);
      const confirmation = unchanged ? "The feature override was already set to that value." : "The feature override was saved and audited.";
      try {
        const refreshed = await loadPlatformSchools();
        setSchools(refreshed);
        const verified = refreshed.find((school) => school.id === schoolId);
        if (verified?.featureConnectionAvailable && verified.features[key]?.override === state) {
          setNotice(confirmation);
          return true;
        }
        setNotice(`${confirmation} The latest feature state could not be verified; reload the page to check it.`);
        return false;
      } catch {
        setNotice(`${confirmation} The directory could not refresh; reload the page to see the current state.`);
        return false;
      }
    },
    async adminAction(schoolId, action, reason) {
      if (!supabase) throw new Error("Supabase is not configured.");
      let successNotice = "";
      if (action === "RESEND_INVITATION") {
        const { data, error } = await supabase.functions.invoke("resend-school-invitation", { body: { schoolId } });
        if (error || data?.error) {
          const code = await edgeFunctionErrorCode(data, error);
          const messages: Record<string, string> = {
            AUTHENTICATION_REQUIRED: "Your platform session expired. Sign in again.",
            PLATFORM_ADMIN_REQUIRED: "Only the authorised Platform Administrator can resend an invitation.",
            INVITATION_NOT_FOUND: "No administrator invitation was found for this school.",
            INVITATION_EMAIL_FAILED: "Supabase Auth could not send the invitation email. Check email settings and rate limits.",
            SERVER_CONFIGURATION_ERROR: "The invitation service is not configured.",
          };
          throw new Error(messages[code] ?? "Invitation email could not be sent. Check Supabase Auth email and redirect URL settings.");
        }
        successNotice = "A new single-use invitation link was requested.";
      } else {
        if (!reason?.trim()) throw new Error("Select an action reason before continuing.");
        const { data, error } = await supabase.functions.invoke("manage-school-admin-access", { body: { schoolId, action, reason: reason.trim() } });
        if (error || data?.error) {
          const code = await edgeFunctionErrorCode(data, error);
          const messages: Record<string, string> = {
            AUTHENTICATION_REQUIRED: "Your platform session expired. Sign in again.",
            PLATFORM_ADMIN_REQUIRED: "This action requires the authorised Platform Administrator account.",
            SCHOOL_ADMIN_NOT_FOUND: "No administrator invitation record was found for this school.",
            INVITATION_NOT_OPEN: "This invitation is no longer open and cannot be revoked.",
            ADMIN_IDENTITY_NOT_LINKED: "The School Administrator does not have a linked account yet.",
            AUTH_ACCOUNT_UPDATE_FAILED: "Supabase Auth could not update the administrator account.",
            SERVER_CONFIGURATION_ERROR: "The application URL is not configured for password-reset links.",
            PASSWORD_RESET_EMAIL_FAILED: "Supabase Auth could not send the password reset email. Check Auth email settings and rate limits.",
          };
          throw new Error(messages[code] ?? "The administrator action could not be completed. Check the platform audit log and try again.");
        }
        successNotice = action === "PASSWORD_RESET"
          ? "Password reset email requested through Supabase Auth."
          : "School Administrator access action was accepted. Check the audit history for confirmation.";
      }
      try {
        setSchools(await loadPlatformSchools());
        setNotice(successNotice);
      } catch {
        setNotice(`${successNotice} The school directory could not refresh; reload the page to see the current record.`);
      }
    },
    async previewSchoolRepair(schoolId) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await (supabase as unknown as RegistrationRpcClient).rpc("preview_school_configuration_repair", { p_school_id: schoolId });
      if (error) throw new Error(error.message);
      const preview = (data ?? {}) as Record<string, boolean>;
      return Object.entries(preview).filter(([, missing]) => missing).map(([key]) => key.replaceAll("_", " "));
    },
    async repairSchool(schoolId) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error } = await (supabase as unknown as RegistrationRpcClient).rpc("repair_school_configuration", { p_school_id: schoolId });
      if (error) throw new Error(error.message);
      record(schoolId, "SCHOOL_CONFIGURATION_REPAIRED", "Missing school configuration records were created without replacing valid data.");
      setSchools(await loadPlatformSchools());
    },
    async createDemoSchool() {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await (supabase as unknown as RegistrationRpcClient).rpc("create_demo_o_level_school_data", {});
      if (error) throw new Error(error.message);
      const result = data as { school_id?: string } | null;
      record(result?.school_id ?? "demo", "DEMO_SCHOOL_SEEDED", "Demo O-Level School data is ready. No external messages or payment requests were sent.");
      setSchools(await loadPlatformSchools());
    },
    async resetDemoSchool(schoolId) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error } = await (supabase as unknown as RegistrationRpcClient).rpc("reset_demo_school_data", { p_school_id: schoolId });
      if (error) throw new Error(error.message);
      record(schoolId, "DEMO_SCHOOL_RESET", "Only records explicitly marked as Demo Data were removed.");
      setSchools(await loadPlatformSchools());
    },
  }), [authenticated, schools, schoolsLoading, schoolsError, reloadSchools, audit, notice]);
  return <PlatformWorkspaceContext.Provider value={value}>{children}</PlatformWorkspaceContext.Provider>;
}
export function usePlatformWorkspace() { const value = useContext(PlatformWorkspaceContext); if (!value) throw new Error("usePlatformWorkspace must be used within PlatformWorkspaceProvider"); return value; }
export function effectiveFeature(feature: PlatformSchool["features"][string]) { return feature.globalEnabled !== false && (feature.override === "ENABLED" || (feature.override === "DEFAULT" && feature.plan)); }
