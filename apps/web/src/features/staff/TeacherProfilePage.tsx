import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Mail,
  Pencil,
  Save,
  X,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { currentUser } from "../../config/currentUser";
import { supabase } from "../../config/supabaseClient";
import { DeleteRecordButton } from "../../components/DeleteRecordButton";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { MediaAssetEditor } from "../../components/common/MediaAssetEditor";
import { staffAcademicSummary, useAcademicWorkspace } from "../academicSetup/AcademicWorkspace";
import { useSchoolContext } from "../context/SchoolContext";
import { safeInternalReturnTo } from "../../utils/safeNavigation";
import { ProfilePhotoEditor } from "../profile/ProfilePhotoEditor";
import { announceProfilePhotoChange, getProfilePhotoUrl, saveMyProfilePhoto } from "../profile/profilePhotoStorage";

export function TeacherProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userId } = useParams();
  const workspace = useAcademicWorkspace();

  const teacher = workspace.staff.find(
    (item) => item.id === userId,
  );

  const canManage = currentUser.permissions.includes("users.manage");
  const metrics = teacher ? staffAcademicSummary(teacher, workspace) : null;
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [pendingInitialsUpdate, setPendingInitialsUpdate] = useState<{ save: () => void } | null>(null);
  const returnTo = safeInternalReturnTo(searchParams.get("returnTo"), "/people/users");

  if (!teacher) {
    return <PersistentTeacherProfile userId={userId} returnTo={returnTo} />;
  }

  return (
    <>
      <button
        type="button"
        className="profile-back-button"
        onClick={() => navigate(returnTo)}
      >
        <ArrowLeft size={17} />
        {returnTo.startsWith("/reports/") ? "Return to Report Preview" : "Staff & Users"}
      </button>

      <section className="teacher-profile-header">
        <div className="teacher-profile-identity">
          <div className="teacher-profile-avatar">{teacher.photoUrl ? <img src={teacher.photoUrl} alt={`${teacher.name} profile`} /> : teacher.initials}</div>

          <div>
            <span className="eyebrow">TEACHER PROFILE</span>

            <h1>{teacher.name}</h1>

            <p>
              {teacher.department} Department ·{" "}
              {metrics?.subjects.join(", ") || "No current term offerings"}
            </p>

            <div className="teacher-profile-tags">
              <span className={`status-badge ${teacher.accountStatus === "Active" ? "status-active" : "status-inactive"}`}>
                {teacher.accountStatus}
              </span>

              <span className="profile-role-badge">Teacher</span>
            </div>
          </div>
        </div>

        {canManage && (<div className="session-row-actions"><button
            type="button"
            className="secondary-button"
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} />
            Edit Profile
          </button><DeleteRecordButton label={teacher.name} onDelete={() => workspace.deleteStaff(teacher.id)} onDeleted={() => navigate("/people/users")} /></div>)}
      </section>

      {canManage && <div className="teacher-media-grid"><MediaAssetEditor title="Profile photo" description="Used on the staff profile; report signatories remain separately controlled." value={teacher.photoUrl} circular saveLabel="Save profile photo" onSave={(photoUrl) => workspace.updateStaff(teacher.id, { firstName: teacher.firstName, middleName: teacher.middleName, lastName: teacher.lastName, staffNumber: teacher.staffNumber, initials: teacher.initials, signatureUrl: teacher.signatureUrl, photoUrl, department: teacher.department, accountStatus: teacher.accountStatus })} onRemove={() => workspace.updateStaff(teacher.id, { firstName: teacher.firstName, middleName: teacher.middleName, lastName: teacher.lastName, staffNumber: teacher.staffNumber, initials: teacher.initials, signatureUrl: teacher.signatureUrl, photoUrl: "", department: teacher.department, accountStatus: teacher.accountStatus })} /><MediaAssetEditor title="Authorised signature" description="Stored separately from the profile photo and used only where signature policy permits." value={teacher.signatureUrl} saveLabel="Save signature" onSave={(signatureUrl) => workspace.updateStaff(teacher.id, { firstName: teacher.firstName, middleName: teacher.middleName, lastName: teacher.lastName, staffNumber: teacher.staffNumber, initials: teacher.initials, signatureUrl, photoUrl: teacher.photoUrl, department: teacher.department, accountStatus: teacher.accountStatus })} onRemove={() => workspace.updateStaff(teacher.id, { firstName: teacher.firstName, middleName: teacher.middleName, lastName: teacher.lastName, staffNumber: teacher.staffNumber, initials: teacher.initials, signatureUrl: "", photoUrl: teacher.photoUrl, department: teacher.department, accountStatus: teacher.accountStatus })} /></div>}

      {editing && <section className="panel teacher-profile-edit"><div className="panel-heading"><div><h2>Edit teacher report identity</h2><p>Confirmed initials are authoritative for subject allocations and future reports.</p></div><button type="button" className="catalogue-close" onClick={() => setEditing(false)} aria-label="Close editor"><X size={17} /></button></div>{editError && <p className="form-error-message" role="alert">{editError}</p>}<form className="form-grid" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const nextInitials = String(form.get("initials") ?? ""); const save = () => { const error = workspace.updateStaff(teacher.id, { firstName: String(form.get("firstName") ?? ""), middleName: String(form.get("middleName") ?? ""), lastName: String(form.get("lastName") ?? ""), staffNumber: String(form.get("staffNumber") ?? ""), initials: nextInitials, signatureUrl: String(form.get("signatureUrl") ?? ""), department: String(form.get("department") ?? ""), accountStatus: form.get("accountStatus") as typeof teacher.accountStatus }); if (error) { setEditError(error); return; } setEditing(false); }; if (nextInitials.trim().toUpperCase() !== teacher.initials && workspace.reportPublications.length) { setPendingInitialsUpdate({ save }); return; } save(); }}><label className="form-field"><span>First name</span><input name="firstName" defaultValue={teacher.firstName} /></label><label className="form-field"><span>Middle name</span><input name="middleName" defaultValue={teacher.middleName} /></label><label className="form-field"><span>Last name</span><input name="lastName" defaultValue={teacher.lastName} /></label><label className="form-field"><span>Staff number</span><input name="staffNumber" defaultValue={teacher.staffNumber} /></label><label className="form-field"><span>Teacher initials</span><input name="initials" defaultValue={teacher.initials} maxLength={14} /><small>Suggested from the name, then confirmed by the school.</small></label><label className="form-field"><span>Signature reference / URL</span><input name="signatureUrl" defaultValue={teacher.signatureUrl} placeholder="Optional authorised digital signature" /></label><label className="form-field"><span>Department</span><input name="department" defaultValue={teacher.department} /></label><label className="form-field"><span>Status</span><select name="accountStatus" defaultValue={teacher.accountStatus}><option>Active</option><option>Inactive</option></select></label><div className="form-actions teacher-edit-actions"><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancel</button><button type="submit" className="primary-button"><Save size={16} /> Save teacher profile</button></div></form></section>}
      <ConfirmDialog open={Boolean(pendingInitialsUpdate)} title="Change teacher initials?" confirmLabel="Save New Initials" onConfirm={() => { pendingInitialsUpdate?.save(); setPendingInitialsUpdate(null); }} onCancel={() => setPendingInitialsUpdate(null)}><p>Published historical reports retain the previous initials. The new initials will be used for future allocations and reports.</p></ConfirmDialog>

      <section className="teacher-profile-grid">
        <article className="panel teacher-information-panel">
          <div className="panel-heading">
            <div className="panel-title-group">
              <span className="panel-icon">
                <UserRound size={19} />
              </span>

              <div>
                <h2>Profile Information</h2>
                <p>Current school staff record</p>
              </div>
            </div>
          </div>

          <dl className="profile-details">
            <div>
              <dt>First name</dt>
              <dd>{teacher.firstName}</dd>
            </div>
            <div>
              <dt>Middle name</dt>
              <dd>{teacher.middleName || "Not recorded"}</dd>
            </div>
            <div>
              <dt>Last name</dt>
              <dd>{teacher.lastName}</dd>
            </div>
            <div>
              <dt>Staff number</dt>
              <dd>{teacher.staffNumber}</dd>
            </div>
            <div>
              <dt>Teacher initials</dt>
              <dd>{teacher.initials || "Missing - blocks publication"}</dd>
            </div>
            <div>
              <dt>Signature</dt>
              <dd>{teacher.signatureUrl ? "Authorised digital signature configured" : "Handwritten after printing"}</dd>
            </div>
            <div>
              <dt>Full Name</dt>
              <dd>{teacher.name}</dd>
            </div>

            <div>
              <dt>Department</dt>
              <dd>{teacher.department}</dd>
            </div>

            <div>
              <dt>Role</dt>
              <dd>{teacher.role}</dd>
            </div>

            <div>
              <dt>Account Status</dt>
              <dd>{teacher.accountStatus}</dd>
            </div>

            <div>
              <dt>Email</dt>
              <dd className="profile-muted">
                <Mail size={15} />
                {teacher.email || "Email pending"}
              </dd>
            </div>

            <div>
              <dt>School</dt>
              <dd>{currentUser.schoolName}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div className="panel-title-group">
              <span className="panel-icon">
                <BookOpen size={19} />
              </span>

              <div>
                <h2>Teaching Allocation</h2>
                <p>Current academic responsibilities</p>
              </div>
            </div>
          </div>

          <div className="allocation-summary">
            <div>
              <span className="allocation-icon">
                <BookOpen size={18} />
              </span>

              <div>
                <strong>{metrics?.subjects.length ?? 0}</strong>
                <span>
                  {metrics?.subjects.length === 1
                    ? "Subject"
                    : "Subjects"}
                </span>
              </div>
            </div>

            <div>
              <span className="allocation-icon">
                <GraduationCap size={18} />
              </span>

              <div>
                <strong>{metrics?.classes ?? 0}</strong>
                <span>Assigned Classes</span>
              </div>
            </div>
          </div>

          <div className="profile-subject-list">
            <span>Assigned Subjects</span>

            <div>
              {metrics?.subjects.map((subject) => (
                <strong key={subject}>{subject}</strong>
              ))}
            </div>
          </div>

          {canManage && <Link className="secondary-button allocation-button" to={`/setup/subjects?teacher=${encodeURIComponent(teacher.id)}&returnTo=${encodeURIComponent(`/people/users/${teacher.id}`)}`}>Manage Allocations</Link>}
        </article>
      </section>

      <section className="profile-workflow-grid">
        <article className="profile-metric-card">
          <span className="profile-metric-icon profile-metric-success">
            <CheckCircle2 size={21} />
          </span>

          <div>
            <span>Marks Submission</span>
            <strong>{metrics?.submissionRate ?? 0}%</strong>
            <small>Current Term II completion</small>
          </div>
        </article>

        <article className="profile-metric-card">
          <span
            className={`profile-metric-icon ${
              (metrics?.missingMarks ?? 0) > 0
                ? "profile-metric-warning"
                : "profile-metric-success"
            }`}
          >
            <AlertTriangle size={21} />
          </span>

          <div>
            <span>Missing Marks</span>
            <strong>{metrics?.missingMarks ?? 0}</strong>
            <small>
              {(metrics?.missingMarks ?? 0) > 0
                ? "Require academic follow-up"
                : "No unresolved marks"}
            </small>
          </div>
        </article>

        <article className="profile-metric-card">
          <span className="profile-metric-icon">
            <ShieldCheck size={21} />
          </span>

          <div>
            <span>Moderation Pending</span>
            <strong>{metrics?.moderationPending ?? 0}</strong>
            <small>Assessment submissions</small>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div className="panel-title-group">
            <span className="panel-icon">
              <ClipboardCheck size={19} />
            </span>

            <div>
              <h2>Academic Workflow</h2>

              <p>
                Operational indicators for the selected academic context
              </p>
            </div>
          </div>
        </div>

        <div className="workflow-status-list">
          <div className="workflow-status-row">
            <span className="workflow-status-icon workflow-ok">
              <CheckCircle2 size={18} />
            </span>

            <div>
              <strong>Marks submission</strong>
              <span>
                {metrics?.submissionRate ?? 0}% of configured assessment components recorded
                completed.
              </span>
            </div>
          </div>

          <div className="workflow-status-row">
            <span
              className={`workflow-status-icon ${
                (metrics?.missingMarks ?? 0) > 0
                  ? "workflow-warning"
                  : "workflow-ok"
              }`}
            >
              <AlertTriangle size={18} />
            </span>

            <div>
              <strong>Missing marks</strong>
              <span>
                {(metrics?.missingMarks ?? 0) === 0
                  ? "No unresolved missing marks."
                  : `${metrics?.missingMarks ?? 0} mark components require resolution.`}
              </span>
            </div>
          </div>

          <div className="workflow-status-row">
            <span className="workflow-status-icon">
              <ShieldCheck size={18} />
            </span>

            <div>
              <strong>Moderation</strong>
              <span>
                {(metrics?.moderationPending ?? 0) === 0
                  ? "No submissions currently awaiting moderation."
                  : `${metrics?.moderationPending ?? 0} submission(s) awaiting moderation.`}
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

type PersistedTeacher = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  accountStatus: string;
  membershipStatus: string;
  authLinked: boolean;
  eligible: boolean;
  allocationCount: number;
  profilePhotoPath?: string | null;
};

function PersistentTeacherProfile({ userId, returnTo }: { userId?: string; returnTo: string }) {
  const context = useSchoolContext();
  const [teacher, setTeacher] = useState<PersistedTeacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const canEditOwnPhoto = Boolean(userId && currentUser.id === userId);

  useEffect(() => {
    if (context.loading) return;
    let cancelled = false;
    if (!userId || !context.schoolId || !supabase) {
      setTeacher(null);
      setLoading(false);
      setError("Select an active school to view this Teacher account.");
      return;
    }
    setLoading(true);
    setError("");
    void (async () => {
      const client = supabase as unknown as { rpc: (name: string, args: { p_school_id: string }) => Promise<{ data: unknown; error: { message: string } | null }> };
      const result = await client.rpc("get_school_teacher_directory", { p_school_id: context.schoolId });
      if (cancelled) return;
      if (result.error) {
        setTeacher(null);
        setError(`Teacher account could not be loaded: ${result.error.message}`);
      } else {
        const entries = Array.isArray(result.data) ? result.data as PersistedTeacher[] : [];
        setTeacher(entries.find((entry) => entry.id === userId) ?? null);
        setError("");
      }
      setLoading(false);
    })().catch((cause: unknown) => {
      if (cancelled) return;
      setTeacher(null);
      setLoading(false);
      setError(cause instanceof Error ? cause.message : "Teacher account could not be loaded.");
    });
    return () => { cancelled = true; };
  }, [context.loading, context.schoolId, userId, refresh]);

  useEffect(() => {
    let active = true;
    void getProfilePhotoUrl(teacher?.profilePhotoPath).then((url) => { if (active) setPhotoUrl(url); });
    return () => { active = false; };
  }, [teacher?.profilePhotoPath]);

  return <section className="teacher-live-profile">
    <Link className="profile-back-button" to={returnTo}><ArrowLeft size={17} aria-hidden="true" />Back to Staff &amp; Users</Link>
    {loading ? <div className="panel" role="status">Loading the live Teacher account…</div> : error ? <div className="form-error-message" role="alert">{error}<button type="button" className="secondary-button" onClick={() => setRefresh((value) => value + 1)}>Retry</button></div> : teacher ? <>
      <header className="teacher-profile-header"><div className="teacher-profile-identity"><div className="teacher-profile-avatar" aria-hidden="true">{photoUrl ? <img src={photoUrl} alt="" /> : teacher.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div><div><span className="eyebrow">SCHOOL TEACHER ACCOUNT</span><h1>{teacher.name}</h1><p>Live account and membership details for the selected school.</p></div></div><span className={`status-badge ${teacher.eligible ? "status-active" : "status-inactive"}`}>{teacher.eligible ? "Available for allocation" : "Not allocatable"}</span></header>
      <div className="panel teacher-live-details"><div><span>Email</span><strong>{teacher.email}</strong></div><div><span>Department</span><strong>{teacher.department || "Not set"}</strong></div><div><span>Account status</span><strong>{teacher.accountStatus}</strong></div><div><span>School membership</span><strong>{teacher.membershipStatus}</strong></div><div><span>Auth identity</span><strong>{teacher.authLinked ? "Linked" : "Not linked"}</strong></div><div><span>Active allocations</span><strong>{teacher.allocationCount}</strong></div></div>
      {canEditOwnPhoto && <section className="panel"><div className="panel-heading"><div><h2>Profile photo</h2><p>Optional and private. Initials remain visible when no image is set.</p></div></div><ProfilePhotoEditor name={teacher.name} initials={teacher.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()} photoUrl={photoUrl} onSave={async (file) => {
        try {
          const saved = await saveMyProfilePhoto(file, currentUser.profilePhotoPath);
          currentUser.profilePhotoPath = saved.path;
          currentUser.profilePhotoUrl = saved.url;
          setPhotoUrl(saved.url);
          announceProfilePhotoChange(saved.url);
          setRefresh((value) => value + 1);
          return null;
        } catch (cause) { return cause instanceof Error ? cause.message : "Profile photo could not be saved."; }
      }} /></section>}
      <p className="form-info-message">This page reads the persisted school account. Session-only review profiles are separate and cannot change this Teacher’s access.</p>
      {teacher.eligible && <Link className="primary-button" to="/school/o-level/teachers">Open teacher allocations</Link>}
    </> : <div className="teacher-not-found"><UserRound size={34} aria-hidden="true" /><h1>Teacher account not found</h1><p>No Teacher membership with this ID belongs to the selected school.</p></div>}
  </section>;
}
