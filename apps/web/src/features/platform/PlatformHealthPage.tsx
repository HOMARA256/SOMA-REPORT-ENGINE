import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowUpRight, CheckCircle2, CircleHelp, Database, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { platformSupabase } from "../../config/supabaseClient";
import { loadAllSchoolCoordination, loadAllTenantReadiness, type SchoolCoordination, type TenantReadiness } from "./PlatformWorkspace";
import { PlatformOperationalStatusPanel } from "./PlatformOperationalStatus";

type Probe = { label: string; state: "CHECKING" | "HEALTHY" | "DEGRADED" | "UNKNOWN"; detail: string; icon: typeof Database };

function StateIcon({ state }: { state: Probe["state"] }) {
  if (state === "HEALTHY") return <CheckCircle2 aria-hidden="true" />;
  if (state === "DEGRADED") return <XCircle aria-hidden="true" />;
  return <CircleHelp aria-hidden="true" />;
}

export function PlatformHealthPage() {
  const [probes, setProbes] = useState<Probe[]>([]);
  const [checkedAt, setCheckedAt] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const [schools, setSchools] = useState<SchoolCoordination[]>([]);
  const [coordinationError, setCoordinationError] = useState("");
  const [tenantReadiness, setTenantReadiness] = useState<TenantReadiness[]>([]);
  const [readinessError, setReadinessError] = useState("");

  const runChecks = useCallback(async () => {
    setChecking(true);
    const next: Probe[] = [];
    setCoordinationError("");
    setReadinessError("");
    if (!platformSupabase) {
      next.push({ label: "Supabase configuration", state: "DEGRADED", detail: "The browser deployment is missing its Supabase URL or publishable key.", icon: Database });
      next.push({ label: "Database connection", state: "UNKNOWN", detail: "Not checked because Supabase is not configured.", icon: Database });
      next.push({ label: "Platform identity", state: "UNKNOWN", detail: "Not checked because Supabase is not configured.", icon: ShieldCheck });
      setSchools([]);
      setTenantReadiness([]);
    } else {
      try {
        const [{ data: sessionData, error: sessionError }, databaseResult] = await Promise.all([
          platformSupabase.auth.getSession(),
          platformSupabase.from("platform_admins").select("id").limit(1),
        ]);
        const session = sessionData?.session;
        next.push({
          label: "Platform identity",
          state: !sessionError && session ? "HEALTHY" : sessionError ? "DEGRADED" : "UNKNOWN",
          detail: sessionError ? "The authentication service did not return a session." : session ? "A platform-authenticated session is available in this browser." : "No platform session is active in this browser.",
          icon: ShieldCheck,
        });
        next.push({
          label: "Platform database access",
          state: databaseResult.error ? "DEGRADED" : "HEALTHY",
          detail: databaseResult.error ? "The platform database probe failed. Check the signed-in role and Supabase policies." : "A read-only query to the platform administrator registry succeeded.",
          icon: Database,
        });
        const [coordinationResult, readinessResult] = await Promise.allSettled([loadAllSchoolCoordination(), loadAllTenantReadiness()]);
        if (coordinationResult.status === "fulfilled") setSchools(coordinationResult.value);
        else { setSchools([]); setCoordinationError(coordinationResult.reason instanceof Error ? coordinationResult.reason.message : "The tenant coordination RPC could not be reached."); }
        if (readinessResult.status === "fulfilled") setTenantReadiness(readinessResult.value);
        else { setTenantReadiness([]); setReadinessError(readinessResult.reason instanceof Error ? readinessResult.reason.message : "The tenant readiness RPC could not be reached."); }
      } catch {
        next.push({ label: "Platform identity", state: "DEGRADED", detail: "The authentication probe could not complete.", icon: ShieldCheck });
        next.push({ label: "Platform database access", state: "DEGRADED", detail: "The read-only database probe could not complete.", icon: Database });
        setSchools([]);
        setTenantReadiness([]);
        setCoordinationError("The platform database probe could not complete.");
        setReadinessError("The platform database probe could not complete.");
      }
    }
    next.push({ label: "Background workers", state: "UNKNOWN", detail: "Worker heartbeat reporting is not connected to this page; no operational status is being assumed.", icon: Activity });
    setProbes(next);
    setCheckedAt(new Date().toLocaleString());
    setChecking(false);
  }, []);

  useEffect(() => { void runChecks(); }, [runChecks]);

  return <>
    <section className="platform-page-heading"><div><span className="eyebrow">GLOBAL PLATFORM MODE</span><h1>System Health</h1><p>Live, read-only checks from this browser session. Unknown services are explicitly marked instead of shown as healthy without evidence.</p></div><button className="secondary-button" type="button" onClick={() => void runChecks()} disabled={checking}><RefreshCw size={17} className={checking ? "platform-health-spin" : ""} />{checking ? "Checking…" : "Run checks"}</button></section>
    <section className="panel platform-health-list" aria-live="polite">
      {probes.map((probe) => { const Icon = probe.icon; return <article className="platform-health-row" key={probe.label}>
        <span className="platform-health-icon"><Icon size={19} aria-hidden="true" /></span>
        <div className="platform-health-copy"><strong>{probe.label}</strong><p>{probe.detail}</p></div>
        <span className={`platform-health-state platform-health-state-${probe.state.toLowerCase()}`}><StateIcon state={probe.state} />{probe.state.replaceAll("_", " ")}</span>
      </article>; })}
      {!probes.length && <p className="platform-health-loading">Checking connected services…</p>}
    </section>
    <PlatformOperationalStatusPanel />
    <section className="panel platform-coordination-overview">
      <div className="panel-heading"><div><h2>School database coordination</h2><p>Live tenant/year counts and school-link integrity; no learner names, marks, or report contents.</p></div></div>
      {coordinationError && <p role="alert" className="form-error">Could not check school coordination: {coordinationError}</p>}
      {!coordinationError && !schools.length && <p className="platform-health-loading">{checking ? "Checking registered school databases…" : "No school coordination data is available."}</p>}
      {schools.length > 0 && <div className="table-wrapper"><table className="data-table"><thead><tr><th>School</th><th>School code</th><th>Academic years</th><th>Active classes</th><th>Enrolled learners</th><th>Active subjects</th><th>Class links</th><th>Relationships</th><th>Last checked</th><th/></tr></thead><tbody>{schools.map((school)=>{
        const year=school.academicYears.find((item)=>item.status==="ACTIVE")??school.academicYears[0];
        const issues=Object.values(school.integrity).reduce((total,count)=>total+Number(count||0),0);
        return <tr key={school.schoolId}><td>{school.schoolName}</td><td>{school.schoolCode}</td><td>{school.academicYears.length}</td><td>{year?.activeClasses??0}</td><td>{year?.learners??0}</td><td>{year?.subjectOfferings??0}</td><td>{year?.classSubjectLinks??0}</td><td><span className={`platform-health-state platform-health-state-${issues===0?"healthy":"degraded"}`}>{issues===0?"CONSISTENT":`${issues} ISSUE(S)`}</span></td><td>{new Date(school.checkedAt).toLocaleString()}</td><td><Link className="secondary-button platform-open-school-button" to={`/platform/schools/${school.schoolId}/health`}><span>Open school</span><ArrowUpRight size={16} aria-hidden="true" /></Link></td></tr>;
      })}</tbody></table></div>}
    </section>
    <section className="panel platform-coordination-overview">
      <div className="panel-heading"><div><h2>New-school onboarding readiness</h2><p>Tenant-scoped checks for admin access, academic year and term, subscription, and compulsory O-Level offerings. No invitee contact details are shown.</p></div></div>
      {readinessError && <p role="alert" className="form-error">Could not check tenant readiness: {readinessError}</p>}
      {!readinessError && !tenantReadiness.length && <p className="platform-health-loading">{checking ? "Checking tenant onboarding readiness…" : "No tenant readiness data is available."}</p>}
      {tenantReadiness.length > 0 && <div className="table-wrapper"><table className="data-table"><thead><tr><th>School</th><th>Lifecycle</th><th>Onboarding</th><th>Latest invitation</th><th>School admin</th><th>Academic year</th><th>Selected term</th><th>Subscription</th><th>Required O-Level</th><th>Readiness</th><th>Issues</th></tr></thead><tbody>{tenantReadiness.map((tenant) => <tr key={tenant.schoolId}>
        <td>{tenant.schoolName}<small className="platform-health-subtext">{tenant.schoolCode}</small></td>
        <td>{tenant.lifecycleStatus.replaceAll("_", " ")}</td>
        <td>{tenant.onboardingStatus?.replaceAll("_", " ") ?? "Missing"}</td>
        <td>{tenant.invitationStatus ?? "None"}</td>
        <td>{tenant.adminMembershipStatus ?? "Missing"}</td>
        <td>{tenant.academicYearName ?? "Missing"}<small className="platform-health-subtext">{tenant.academicYearStatus ?? "Not linked"}</small></td>
        <td>{tenant.selectedTermName ?? "Missing"}<small className="platform-health-subtext">{tenant.selectedTermStatus ?? "Not linked"}</small></td>
        <td>{tenant.hasSubscription ? "Present" : "Missing"}</td>
        <td>{tenant.requiredOLevelLinked}/{tenant.requiredOLevelExpected}</td>
        <td><span className={`platform-health-state platform-health-state-${tenant.readyForSchoolWork ? "healthy" : "degraded"}`}>{tenant.readyForSchoolWork ? "READY" : "SETUP NEEDED"}</span></td>
        <td>{tenant.setupIssues.length ? tenant.setupIssues.map((issue) => issue.replaceAll("_", " ")).join(", ") : "None"}</td>
      </tr>)}</tbody></table></div>}
    </section>
    {checkedAt && <p className="platform-health-timestamp">Database coordination last checked {checkedAt}. Delivery records and worker heartbeats are separate evidence above; MTN, inbox delivery, backups, and job execution are not verified here.</p>}
  </>;
}
