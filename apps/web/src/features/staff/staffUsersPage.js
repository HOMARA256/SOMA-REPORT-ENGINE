import { AlertTriangle, BookOpen, Building2, CheckCircle2, Copy, KeyRound, Search, Send, UserPlus, UserX, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { currentUser } from "../../config/currentUser";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
import { edgeFunctionErrorCode } from "../../utils/edgeFunctionError";
import { ProfilePhotoAvatar } from "../profile/ProfilePhotoAvatar";
import { ContactPlatformSupportButton } from "../notifications/MessageCentreLink";
import { fetchSchoolTeacherDirectory } from "./schoolTeacherDirectory";
const emptyInvite = { name: "", email: "", department: "", assignments: [] };
export function StaffUsersPage() {
    const navigate = useNavigate();
    const school = useSchoolContext();
    const canManage = currentUser.role === "SCHOOL_ADMIN" && currentUser.permissions.includes("users.manage");
    const [teachers, setTeachers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [query, setQuery] = useState("");
    const [department, setDepartment] = useState("ALL");
    const [accountStatus, setAccountStatus] = useState("ALL");
    const [showInvite, setShowInvite] = useState(false);
    const [invite, setInvite] = useState(emptyInvite);
    const [inviteBusy, setInviteBusy] = useState(false);
    const [inviteReview, setInviteReview] = useState(false);
    const [invitationSetup, setInvitationSetup] = useState({ terms: [], offerings: [], permittedFeatures: [] });
    const [setupBusy, setSetupBusy] = useState(false);
    const [invitationList, setInvitationList] = useState([]);
    const [invitationError, setInvitationError] = useState("");
    const [invitationLoading, setInvitationLoading] = useState(false);
    const [invitationsRefreshedAt, setInvitationsRefreshedAt] = useState(null);
    const [invitationTarget, setInvitationTarget] = useState(null);
    const [activationTarget, setActivationTarget] = useState(null);
    const [declineTarget, setDeclineTarget] = useState(null);
    const [declineReason, setDeclineReason] = useState("");
    const [invitationReason, setInvitationReason] = useState("");
    const [invitationActionBusy, setInvitationActionBusy] = useState(false);
    const [activationLink, setActivationLink] = useState("");
    const [linkCopied, setLinkCopied] = useState(false);
    const [target, setTarget] = useState(null);
    const [membershipAction, setMembershipAction] = useState("SUSPEND");
    const [reason, setReason] = useState("");
    const [accessBusy, setAccessBusy] = useState(false);
    const [recoveryTarget, setRecoveryTarget] = useState(null);
    const [recoveryBusy, setRecoveryBusy] = useState(false);
    const directoryRequest = useRef(0);
    const load = useCallback(async () => {
        const requestId = ++directoryRequest.current;
        if (!school.schoolId || !supabase || !canManage) {
            setTeachers([]);
            setError("");
            setLoading(false);
            return;
        }
        setLoading(true);
        setTeachers([]);
        try {
            const data = await fetchSchoolTeacherDirectory(school.schoolId);
            if (requestId !== directoryRequest.current)
                return;
            setTeachers(data);
            setError("");
        }
        catch (cause) {
            if (requestId === directoryRequest.current) {
                setError(`Staff directory could not be loaded: ${cause instanceof Error ? cause.message : "Unexpected connection failure."}`);
                setTeachers([]);
            }
        }
        finally {
            if (requestId === directoryRequest.current)
                setLoading(false);
        }
    }, [canManage, school.schoolId]);
    useEffect(() => { void load(); }, [load]);
    const loadInvitations = useCallback(async () => {
        if (!school.schoolId || !supabase || !canManage) {
            setInvitationList([]);
            return;
        }
        setInvitationLoading(true);
        setInvitationError("");
        try {
            const { data, error: listError } = await supabase.rpc("list_school_teacher_invitations", { p_school_id: school.schoolId });
            if (listError) {
                setInvitationList([]);
                const unavailable = listError.code === "PGRST202" || /could not find the function|function .* does not exist/i.test(listError.message ?? "");
                setInvitationError(unavailable
                    ? "The teacher-invitation service is not available in this database. Ask the system operator to apply pending migrations, then refresh."
                    : `Teacher invitations could not be loaded: ${listError.message || "Unexpected database error."} Please retry.`);
                return;
            }
            setInvitationList(Array.isArray(data) ? data : []);
            setInvitationsRefreshedAt(new Date());
        }
        catch (cause) {
            setInvitationError(`Teacher invitations could not be loaded: ${cause instanceof Error ? cause.message : "Connection failed."} Please retry.`);
        }
        finally {
            setInvitationLoading(false);
        }
    }, [canManage, school.schoolId]);
    useEffect(() => { void loadInvitations(); }, [loadInvitations]);
    async function openInvite() {
        setShowInvite((value) => !value);
        setInviteReview(false);
        setError("");
        if (showInvite || !school.schoolId || !supabase)
            return;
        setSetupBusy(true);
        const { data, error: setupError } = await supabase.rpc("get_school_teacher_invitation_setup", { p_school_id: school.schoolId });
        if (setupError)
            setInvitationError(`Teaching assignments and role capabilities could not be loaded: ${setupError.message || "Unexpected database error."} Please retry.`);
        else {
            setInvitationSetup(data);
            setInvitationError("");
        }
        setSetupBusy(false);
    }
    const departments = useMemo(() => [...new Set(teachers.map((item) => item.department).filter((value) => Boolean(value)))].sort(), [teachers]);
    const filtered = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return teachers.filter((item) => (!normalized || `${item.name} ${item.email} ${item.department ?? ""}`.toLowerCase().includes(normalized))
            && (department === "ALL" || item.department === department)
            && (accountStatus === "ALL" || item.accountStatus === accountStatus));
    }, [teachers, query, department, accountStatus]);
    async function inviteTeacher(event) {
        event.preventDefault();
        if (!inviteReview) {
            setInviteReview(true);
            return;
        }
        if (!school.schoolId || !supabase || !canManage)
            return;
        const normalizedInviteEmail = invite.email.trim().toLowerCase();
        const previousInvitation = invitationList.find((item) => item.email.trim().toLowerCase() === normalizedInviteEmail && item.status !== "REVOKED");
        if (previousInvitation?.status === "ACCEPTED") {
            setShowInvite(false);
            setInviteReview(false);
            if (previousInvitation.membershipStatus === "INACTIVE")
                setNotice(`${previousInvitation.name} already has a removed membership at this school. Restore the existing membership from the School staff register; do not send a duplicate invitation.`);
            else if (previousInvitation.membershipStatus === "SUSPENDED")
                setNotice(`${previousInvitation.name} already has a suspended membership at this school. Reactivate the existing membership from the School staff register; do not send a duplicate invitation.`);
            else if (previousInvitation.activated)
                setNotice(`${previousInvitation.name} already has an active Teacher membership in this school.`);
            else {
                setNotice(`${previousInvitation.name} already accepted. Continue with the existing invitation’s Activate action; a second invitation is not needed.`);
                setActivationTarget(previousInvitation);
            }
            if (previousInvitation.membershipStatus === "INACTIVE" || previousInvitation.membershipStatus === "SUSPENDED") {
                document.getElementById("school-staff-register")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            return;
        }
        if (previousInvitation && ["PENDING", "SENT", "EXPIRED", "DELIVERY_FAILED"].includes(previousInvitation.status)) {
            setError(`An invitation for ${normalizedInviteEmail} already exists. Use Resend in Teacher invitations to send the current secure invitation link; its saved teaching assignments will be retained.`);
            document.getElementById("teacher-invitations")?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        setInviteBusy(true);
        setError("");
        setNotice("");
        try {
            const { data, error: invokeError } = await supabase.functions.invoke("invite-school-teacher", { body: { schoolId: school.schoolId, ...invite } });
            if (invokeError || data?.error) {
                const codes = {
                    TEACHER_ACCOUNT_ALREADY_REGISTERED: "This email already has an account. Sign in with that account to accept the invitation.",
                    TEACHER_ACCOUNT_COLLISION: "An account with this email cannot be safely linked automatically. Ask the account owner to sign in with the email that owns the account.",
                    TEACHER_ALREADY_MEMBER: "This person already has an active membership at this school.",
                    SCHOOL_MEMBERSHIP_SUSPENDED: "This teacher already has a suspended membership at this school. Reactivate the existing membership instead of sending another invitation.",
                    SCHOOL_MEMBERSHIP_REMOVED: "This teacher already has a removed membership at this school. Restore the existing membership instead of creating another invitation.",
                    TEACHER_ACCOUNT_SETUP_FAILED: "The secure sign-in link could not be prepared. The invitation remains unaccepted; review the invitation and retry.",
                    TEACHER_INVITATION_LINK_FAILED: "A secure sign-in link could not be prepared. The invitation was not sent.",
                    INVITATION_DATABASE_NOT_READY: "The teacher-invitation database functions or schema are not available yet. Apply the pending teacher-invitation migration, then refresh.",
                    TEACHER_ROLE_NOT_CONFIGURED: "The Teacher role is missing from this school system's role setup. Ask the Platform Admin to restore the Teacher role, then retry.",
                    PLATFORM_ACCOUNT_CANNOT_BE_TEACHER: "A Platform Admin account cannot be invited as a school Teacher.",
                    INVITATION_SAVE_FAILED: "The invitation status could not be saved. Verify the invitation register before retrying.",
                    INVALID_TEACHER_ASSIGNMENT: "One of the selected teaching assignments is invalid. Review the term, class, stream and subject.",
                    TEACHER_ASSIGNMENT_OUTSIDE_SCHOOL: "A selected subject offering or term does not belong to this school.",
                    PRIMARY_TEACHER_ALREADY_ASSIGNED: "One selected offering already has a primary teacher. Choose co-teacher or review the existing allocation.",
                    SCHOOL_NOT_ACTIVE: "This school must be active before staff can be invited.",
                    TEACHER_INVITATION_NOT_RESENDABLE: "This invitation has already been accepted or revoked.",
                    VALID_TEACHER_DETAILS_REQUIRED: "Enter a valid name and email address.",
                    AUTHENTICATION_REQUIRED: "Your session expired. Sign in again before inviting staff.",
                    SCHOOL_ADMIN_REQUIRED: "Only this school's administrator can invite staff.",
                    SERVER_CONFIGURATION_ERROR: "The invitation service is missing required Supabase or application configuration.",
                    INVITATION_CREATE_FAILED: "The invitation service could not save or prepare this invitation. Refresh invitations and check whether it was created before retrying.",
                    TEACHER_INVITATION_ALREADY_OPEN: "An open invitation already exists for this email. Use Resend in Teacher invitations to refresh its secure link; saved teaching assignments are retained.",
                };
                const code = await edgeFunctionErrorCode(data, invokeError);
                const diagnosticCode = typeof data?.diagnosticCode === "string" ? ` (database code ${data.diagnosticCode})` : "";
                throw new Error(codes[code] ? `${codes[code]}${diagnosticCode}` : (code
                    ? `The invitation service returned ${code}. Refresh invitations and check whether the invitation was created before retrying.`
                    : `The invitation service did not confirm the request${diagnosticCode}. Refresh invitations and check whether the invitation was created before retrying.`));
            }
            setInvite(emptyInvite);
            setShowInvite(false);
            setInviteReview(false);
            setActivationLink(typeof data?.activationLink === "string" ? data.activationLink : "");
            setLinkCopied(false);
            setNotice(data?.invitationSent
                ? `School-branded teacher invitation sent for ${school.schoolName}. Access becomes active only after the named teacher accepts.`
                : `Invitation prepared for ${school.schoolName}, but branded email delivery is not configured. Share the one-time secure link below with the named teacher through a verified channel.`);
            await load();
            await loadInvitations();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "The invitation could not be confirmed.");
        }
        finally {
            setInviteBusy(false);
        }
    }
    async function resendInvitation(item) {
        if (!supabase || !canManage)
            return;
        setInvitationActionBusy(true);
        setError("");
        setNotice("");
        try {
            const { data, error: invokeError } = await supabase.functions.invoke("invite-school-teacher", { body: { action: "resend", invitationId: item.id } });
            if (invokeError || data?.error) {
                const code = await edgeFunctionErrorCode(data, invokeError);
                throw new Error(code === "SCHOOL_ADMIN_REQUIRED" ? "Only this school's administrator can resend invitations." : "This invitation could not be resent. Check its current status before trying again.");
            }
            setActivationLink(typeof data?.activationLink === "string" ? data.activationLink : "");
            setLinkCopied(false);
            setNotice(data?.invitationSent ? `A new school-branded invitation was sent to ${item.email}. The previous invitation links are subject to the database expiry and acceptance state.` : `The invitation link for ${item.email} is ready. Branded email is not configured; share the secure one-time link below directly with the named teacher.`);
            await loadInvitations();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "The invitation could not be resent.");
        }
        finally {
            setInvitationActionBusy(false);
        }
    }
    async function cancelInvitation() {
        if (!supabase || !invitationTarget || !invitationReason.trim())
            return;
        setInvitationActionBusy(true);
        setError("");
        setNotice("");
        const { data, error: cancelError } = await supabase.rpc("cancel_school_teacher_invitation", { p_invitation_id: invitationTarget.id, p_reason: invitationReason.trim() });
        if (cancelError || data !== invitationTarget.id)
            setError("The invitation could not be revoked. Refresh its status before retrying.");
        else
            setNotice(`Invitation to ${invitationTarget.email} was revoked. Any later acceptance attempt will be rejected.`);
        setInvitationTarget(null);
        setInvitationReason("");
        setInvitationActionBusy(false);
        await loadInvitations();
    }
    async function activateInvitation() {
        if (!supabase || !activationTarget || !canManage)
            return;
        setInvitationActionBusy(true);
        setError("");
        setNotice("");
        try {
            const { data, error: activateError } = await supabase.functions.invoke("activate-school-teacher-invitation", {
                body: { invitationId: activationTarget.id },
            });
            if (activateError || data?.error || !data?.activated) {
                const code = await edgeFunctionErrorCode(data, activateError);
                const friendly = {
                    SCHOOL_ADMIN_REQUIRED: "Only this school's administrator can activate this accepted invitation.",
                    TEACHER_ACCEPTANCE_REQUIRED: "The teacher must accept the invitation before school access can be activated.",
                    PRIMARY_TEACHER_ALREADY_ASSIGNED: "A selected offering already has a primary teacher. Review its allocation before activation.",
                    INVITED_TEACHER_ASSIGNMENT_NO_LONGER_AVAILABLE: "A selected teaching assignment is no longer available. Review the invitation assignments.",
                    TEACHER_ACCOUNT_GLOBAL_RESTRICTED: "This teacher’s SOMA account has a global security restriction. School Admins cannot unlock it; Platform Support must review the account. The school membership was not activated.",
                    SCHOOL_MEMBERSHIP_SUSPENDED: "This teacher’s membership at your school is suspended. Use the staff register’s school-specific Reactivate action after reviewing the recorded reason.",
                    SCHOOL_MEMBERSHIP_RESTORE_REQUIRED: "This membership was suspended or removed. Use the Staff register’s Reactivate or Restore action with a recorded reason; invitation activation cannot bypass that control.",
                    SCHOOL_NOT_ACTIVE: "This school is not active, so teacher access cannot be activated.",
                };
                throw new Error(friendly[code] ?? "The accepted invitation could not be activated. Refresh and review its status.");
            }
            if (data.passwordSetupRequired && !data.passwordSetupEmailSent) {
                setError(data.warning === "DELIVERY_NOT_CONFIGURED"
                    ? `Membership activated for ${activationTarget.name}, but password setup email was not sent. Configure RESEND_API_KEY and SCHOOL_INVITATION_FROM_EMAIL, then use Send password reset in the staff register.`
                    : `Membership activated for ${activationTarget.name}, but password setup email delivery failed. Use Send password reset in the staff register after refreshing.`);
            }
            else {
                setNotice(data.passwordSetupRequired
                    ? `Teacher membership activated for ${activationTarget.name}; a secure password-setup link was emailed to ${activationTarget.email}.`
                    : `Teacher membership activated for ${activationTarget.name}. This account already has a password; the teacher can sign in with the existing SOMA account.`);
            }
            setActivationTarget(null);
            await Promise.all([load(), loadInvitations()]);
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "The accepted invitation could not be activated.");
        }
        finally {
            setInvitationActionBusy(false);
        }
    }
    async function declineInvitation() {
        if (!supabase || !declineTarget || !canManage || !declineReason.trim())
            return;
        setInvitationActionBusy(true);
        setError("");
        setNotice("");
        try {
            const { data, error: declineError } = await supabase.rpc("decline_school_teacher_invitation", {
                p_invitation_id: declineTarget.id, p_reason: declineReason.trim(),
            });
            if (declineError || data !== declineTarget.id) {
                const code = await edgeFunctionErrorCode(data, declineError);
                throw new Error(code === "ACTIVE_TEACHER_MEMBERSHIP_CANNOT_BE_DECLINED"
                    ? "This teacher already has active access at your school. Suspend the school membership instead of declining the invitation."
                    : code === "SCHOOL_ADMIN_REQUIRED" ? "Only this school’s administrator can decline this invitation."
                        : "The invitation could not be declined. Refresh its status and try again.");
            }
            setNotice(`Invitation for ${declineTarget.name} was declined. The teacher’s global account and other school memberships were unchanged.`);
            setDeclineTarget(null);
            setDeclineReason("");
            await loadInvitations();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "The invitation could not be declined.");
        }
        finally {
            setInvitationActionBusy(false);
        }
    }
    async function changeAccess() {
        if (!school.schoolId || !target || !reason.trim() || !canManage)
            return;
        setAccessBusy(true);
        setError("");
        setNotice("");
        try {
            const { data, error: rpcError } = await supabase.rpc("manage_school_teacher_membership", {
                p_school_id: school.schoolId, p_teacher_id: target.id, p_action: membershipAction, p_reason: reason.trim(),
            });
            if (rpcError)
                throw new Error(rpcError.message);
            if (data !== target.id)
                throw new Error("The database did not confirm the selected teacher account.");
            const message = {
                SUSPEND: `${target.name}'s membership was suspended at this school. Other school memberships and historical records are unchanged.`,
                REACTIVATE: `${target.name}'s membership was reactivated at this school. Add current term allocations separately as needed.`,
                REMOVE: `${target.name} was removed from this school's active membership. Their SOMA account, other schools, and academic history are preserved.`,
                RESTORE: `${target.name}'s existing membership was restored at this school. Add current term allocations separately as needed.`,
            };
            setNotice(message[membershipAction]);
            setTarget(null);
            setReason("");
            await load();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "Staff access could not be changed.");
        }
        finally {
            setAccessBusy(false);
        }
    }
    async function sendTeacherRecovery() {
        if (!school.schoolId || !recoveryTarget || !canManage || !supabase)
            return;
        setRecoveryBusy(true);
        setError("");
        setNotice("");
        try {
            const { data, error: invokeError } = await supabase.functions.invoke("request-school-teacher-password-reset", {
                body: { schoolId: school.schoolId, teacherUserId: recoveryTarget.id },
            });
            const code = await edgeFunctionErrorCode(data, invokeError);
            if (invokeError || data?.error) {
                const messages = {
                    RATE_LIMITED: "A reset email was recently requested for this account. Wait before requesting another.",
                    SCHOOL_ADMIN_REQUIRED: "Only this school’s administrator can request this reset.",
                    ACTIVE_SCHOOL_TEACHER_REQUIRED: "The selected person no longer has an active Teacher membership in this school.",
                    SCHOOL_NOT_ACTIVE: "Password reset requests are unavailable while this school is suspended or archived.",
                    DELIVERY_NOT_CONFIGURED: "No reset email was sent. In Supabase Dashboard → Edge Functions → Secrets for project pxmfwancbxpyffoodyig, configure RESEND_API_KEY and SCHOOL_INVITATION_FROM_EMAIL, then retry. Never paste or share a teacher’s one-time reset link.",
                    DELIVERY_FAILED: "The reset email was not delivered and no password was changed. Check that the Resend sender address is verified and review the Edge Function logs before retrying.",
                };
                throw new Error(messages[code] ?? "The password-reset request could not be completed. No password was changed.");
            }
            if (data?.sent !== true)
                throw new Error("The email service did not confirm delivery. No reset link was shared and the request was not marked successful.");
            setRecoveryTarget(null);
            setNotice(`Success — the secure password-reset email was sent to ${maskEmail(recoveryTarget.email)}. The confirmation closed. The teacher’s global sign-in password may change; school memberships and academic records are unchanged.`);
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "The password-reset request could not be completed.");
        }
        finally {
            setRecoveryBusy(false);
        }
    }
    function eligibility(item) {
        if (!item.authLinked)
            return "No Supabase sign-in identity is linked.";
        if (item.accountStatus !== "ACTIVE")
            return `Account is ${item.accountStatus.toLowerCase()}.`;
        if (item.membershipStatus === "INACTIVE")
            return "Removed from this school; restore the existing membership to rejoin.";
        if (item.membershipStatus === "SUSPENDED")
            return "School membership is suspended; reactivate it to restore school access.";
        if (item.membershipStatus !== "ACTIVE")
            return `School membership is ${item.membershipStatus.toLowerCase()}.`;
        return item.eligible ? "Available for allocation." : "Not currently eligible for allocation.";
    }
    if (!canManage)
        return <section className="panel"><header className="page-heading"><div><span className="eyebrow">SCHOOL DIRECTORY</span><h1>Staff</h1><p>Staff records are protected. Ask the School Administrator if you need directory access.</p></div></header><div className="form-error-message" role="status">Your current role does not have permission to view the staff directory.</div></section>;
    return <>
    <header className="page-heading"><div><span className="eyebrow">SCHOOL ADMINISTRATION</span><h1>Staff</h1><p>Teacher accounts and school memberships for the selected school. Learner records are managed separately.</p></div><div className="staff-heading-actions"><button type="button" className="secondary-button" onClick={() => navigate("/id-cards?type=STAFF")}>Staff ID cards</button><button type="button" className="secondary-button" onClick={() => { void load(); void loadInvitations(); }} disabled={loading}>Refresh</button><button type="button" className="primary-button" onClick={() => void openInvite()}><UserPlus size={17}/> Invite teacher</button></div></header>
    {notice && <p className="form-success-message" role="status">{notice}</p>}
    {activationLink && <section className="panel staff-activation-link" aria-label="Teacher activation link"><label htmlFor="teacher-activation-link">One-time teacher activation link</label><p>Anyone with this link can activate the invited account. Share it only with the teacher named in the invitation.</p><div><input id="teacher-activation-link" type="url" readOnly value={activationLink} onFocus={(event) => event.currentTarget.select()}/><button type="button" className="secondary-button" onClick={() => { void navigator.clipboard.writeText(activationLink).then(() => setLinkCopied(true)).catch(() => setLinkCopied(false)); }}><Copy size={16}/>{linkCopied ? "Copied" : "Copy link"}</button><button type="button" className="secondary-button" onClick={() => setActivationLink("")}>Hide link</button></div></section>}
    {error && <div className="form-error-message" role="alert">{error}</div>}
    {school.error && <div className="form-error-message" role="alert">{school.error}</div>}
    {showInvite && <form className="panel teacher-invite-wizard" onSubmit={(event) => void inviteTeacher(event)}>
      <div className="teacher-invite-title"><div><span className="eyebrow">SCHOOL-SCOPED ACCESS</span><h2>{inviteReview ? "Review teacher invitation" : "Invite a teacher"}</h2><p>The teacher joins this school once after accepting. Term and year teaching allocations are managed separately.</p></div>{school.schoolLogo ? <img src={school.schoolLogo} alt={`${school.schoolName} badge`}/> : <span className="teacher-invite-school-mark"><Building2 size={22} aria-hidden="true"/></span>}</div>
      {setupBusy ? <p role="status">Loading this school’s current terms, subject offerings and Teacher role capabilities…</p> : inviteReview ? <>
        <div className="teacher-invite-review-grid"><section><h3>Invited teacher</h3><p><strong>{invite.name}</strong><br />{invite.email}{invite.department ? <><br />{invite.department}</> : null}</p><span className="teacher-role-chip">Teacher role</span></section><section><h3>Inviting school</h3><p><strong>{school.schoolName}</strong><br />Invited by {currentUser.name}<br />Invitation expires in 7 days</p></section></div>
        <section className="teacher-invite-review-block"><h3>Teaching assignments after acceptance</h3>{invite.assignments.length ? <ul>{invite.assignments.map((assignment) => { const offering = invitationSetup.offerings.find((item) => item.id === assignment.offeringId); const term = invitationSetup.terms.find((item) => item.id === assignment.termId); return <li key={`${assignment.termId}-${assignment.offeringId}`}><strong>{offering?.className}{offering?.streamName ? ` · ${offering.streamName}` : ""}</strong><span>{offering?.subjectCode ? `${offering.subjectCode} · ` : ""}{offering?.subjectName} · {term?.name} · {assignment.role.replaceAll("_", " ")}</span></li>; })}</ul> : <p>No initial class or subject assignments. Assign them later from Teacher Allocations.</p>}</section>
        <section className="teacher-invite-review-block"><h3>Features permitted by the existing Teacher role</h3><p>These permissions come from the school’s role configuration and are not expanded by this invitation. Marks access remains restricted to the authoritative teacher-allocation records.</p><ul className="teacher-permission-list">{invitationSetup.permittedFeatures.map((feature) => <li key={feature.code}>{feature.description} <code>{feature.code}</code></li>)}</ul></section>
        <div className="form-actions"><button type="button" className="secondary-button" disabled={inviteBusy} onClick={() => setInviteReview(false)}>Back to edit</button><button type="submit" className="primary-button" disabled={inviteBusy}>{inviteBusy ? "Preparing secure invitation…" : "Confirm and send invitation"}</button></div>
      </> : <>
        <div className="session-create-fields"><label>Full name<input required minLength={2} maxLength={200} autoComplete="name" value={invite.name} onChange={(event) => setInvite({ ...invite, name: event.target.value })}/></label><label>Invitation email<input type="email" required maxLength={255} autoComplete="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })}/></label><label>Department (optional)<input maxLength={140} value={invite.department} onChange={(event) => setInvite({ ...invite, department: event.target.value })}/></label></div>
        <section className="teacher-invite-assignment"><h3><BookOpen size={18} aria-hidden="true"/> Optional initial teaching assignments</h3><p>Only active class/stream subject offerings and terms from {school.schoolName} are available here.</p>
          {invitationSetup.offerings.length && invitationSetup.terms.length ? <AssignmentPicker terms={invitationSetup.terms} offerings={invitationSetup.offerings} assignments={invite.assignments} onChange={(assignments) => setInvite({ ...invite, assignments })}/> : <p className="teacher-invite-empty">No active class/stream subject offerings and terms are available. You can assign this teacher later.</p>}
        </section>
        <section className="teacher-invite-capabilities"><h3>Teacher role access</h3><p>Capabilities are inherited from the existing Teacher role. This screen cannot grant permissions or expose another teacher’s classes. You can review the current permissions before sending.</p><button type="button" className="text-button" onClick={() => document.getElementById("teacher-role-permissions")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Review permitted features</button><ul id="teacher-role-permissions">{invitationSetup.permittedFeatures.map((feature) => <li key={feature.code}>{feature.description}</li>)}</ul></section>
        <div className="form-actions"><button type="button" className="secondary-button" disabled={inviteBusy} onClick={() => { setShowInvite(false); setInviteReview(false); }}>Cancel</button><button type="submit" className="primary-button" disabled={inviteBusy || setupBusy}>{"Review invitation"}</button></div>
      </>}
    </form>}
    <section className="staff-summary-grid" aria-label="School staff statistics"><Summary icon={<Users size={20}/>} label="Teacher accounts" value={teachers.length} detail="Saved memberships in this school"/><Summary icon={<CheckCircle2 size={20}/>} label="Allocatable" value={teachers.filter((item) => item.eligible).length} detail="Active, linked accounts" success/><Summary icon={<UserX size={20}/>} label="No active allocation" value={teachers.filter((item) => item.allocationCount === 0).length} detail="Teacher accounts without assignments"/><Summary icon={<AlertTriangle size={20}/>} label="Inactive membership" value={teachers.filter((item) => item.membershipStatus !== "ACTIVE" || item.accountStatus !== "ACTIVE").length} detail="Requires administrator review" warning/></section>
    <section className="panel staff-management-panel" id="school-staff-register"><div className="staff-toolbar"><label className="staff-search"><Search size={17} aria-hidden="true"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, or department…" aria-label="Search staff"/></label><label className="staff-filter"><span>Department</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="ALL">All departments</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="staff-filter"><span>Account status</span><select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label></div>
      <div className="staff-results-heading"><div><h2>School staff register</h2><p>{loading ? "Loading staff memberships…" : `Showing ${filtered.length} of ${teachers.length} Teacher account(s) in the selected school.`}</p></div></div>
      {!loading && !filtered.length ? <div className="staff-empty-state"><Users size={28}/><strong>{teachers.length ? "No staff records match" : "No Teacher accounts in this school"}</strong><span>{teachers.length ? "Change the search or filters." : "Invite a Teacher account to add a school-scoped member."}</span></div> : <div className="table-wrapper"><table className="data-table responsive-table"><thead><tr><th>Staff member</th><th>Department</th><th>System role</th><th>Account / membership</th><th>Allocation count</th><th>Actions</th></tr></thead><tbody>{filtered.map((item) => {
                const canRestoreMembership = item.authLinked && item.accountStatus === "ACTIVE" && item.membershipStatus !== "ACTIVE";
                const canResetPassword = item.authLinked && item.accountStatus === "ACTIVE" && item.membershipStatus === "ACTIVE";
                return <tr key={item.id}><td data-label="Staff member"><span className="directory-person"><ProfilePhotoAvatar name={item.name} initials={item.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()} path={item.profilePhotoPath}/><span><strong>{item.name}</strong><small className="school-teacher-email">{item.email}</small></span></span></td><td data-label="Department">{item.department || "—"}</td><td data-label="System role">Teacher</td><td data-label="Account / membership"><span className={`status-badge ${item.eligible ? "status-active" : "status-inactive"}`}>{item.accountStatus} · {item.membershipStatus}</span><small className="school-teacher-email">{eligibility(item)}</small></td><td data-label="Allocation count">{item.allocationCount}</td><td data-label="Actions"><div className="session-row-actions"><button type="button" className="text-button" onClick={() => navigate(`/staff/${item.id}`)}>View profile</button>{item.eligible && <button type="button" className="text-button" onClick={() => navigate(`/id-cards?type=STAFF&person=${encodeURIComponent(item.id)}`)}>Issue ID</button>}{canResetPassword && <button type="button" className="text-button" onClick={() => { setRecoveryTarget(item); setError(""); setNotice(""); }}><KeyRound size={15}/> Send password reset</button>}{item.membershipStatus === "ACTIVE" && <button type="button" className="text-button danger-text-button" onClick={() => { setMembershipAction("SUSPEND"); setTarget(item); setReason(""); }}>Suspend access</button>}{["ACTIVE", "SUSPENDED"].includes(item.membershipStatus) && <button type="button" className="text-button danger-text-button" onClick={() => { setMembershipAction("REMOVE"); setTarget(item); setReason(""); }}>Remove from school</button>}{["SUSPENDED", "INACTIVE"].includes(item.membershipStatus) && <button type="button" className="text-button" disabled={!canRestoreMembership} title={canRestoreMembership ? (item.membershipStatus === "INACTIVE" ? "Restore this existing school membership" : "Reactivate this suspended school membership") : "A linked, active SOMA account is required."} onClick={() => { setMembershipAction(item.membershipStatus === "INACTIVE" ? "RESTORE" : "REACTIVATE"); setTarget(item); setReason(""); }}>{item.membershipStatus === "INACTIVE" ? "Restore membership" : "Reactivate"}</button>}</div></td></tr>;
            })}</tbody></table></div>}
      <p className="class-workspace-note">This directory is school-scoped. A Teacher’s classes and subjects remain governed by their active allocation records.</p>
    </section>
    <section className="panel teacher-invitation-list" id="teacher-invitations" aria-busy={invitationLoading}><div className="staff-results-heading"><div><h2>Teacher invitations</h2><p>Pending, accepted, expired and revoked invitations for {school.schoolName}.</p>{invitationsRefreshedAt && <small>Last refreshed {invitationsRefreshedAt.toLocaleTimeString()}</small>}</div><button type="button" className="secondary-button" onClick={() => void loadInvitations()} disabled={invitationActionBusy || invitationLoading}>{invitationLoading ? "Refreshing…" : "Refresh invitations"}</button></div>
      {invitationError && <div className="form-error-message" role="alert">{invitationError}</div>}
      {!invitationError && !invitationList.length && <div className="staff-empty-state"><Send size={24}/><strong>No teacher invitations</strong><span>Invitations sent by this school will appear here with their current status.</span></div>}
      {invitationList.length > 0 && <div className="table-wrapper"><table className="data-table responsive-table"><thead><tr><th>Teacher</th><th>Department</th><th>Status</th><th>Assignments</th><th>Expires</th><th>Actions</th></tr></thead><tbody>{invitationList.map((item) => { const suspended = item.status === "ACCEPTED" && item.membershipStatus === "INACTIVE"; const canActivate = item.status === "ACCEPTED" && !item.activated && !suspended && item.accountActive !== false; const label = suspended ? "SCHOOL MEMBERSHIP SUSPENDED" : item.accountActive === false ? "GLOBAL ACCOUNT RESTRICTED" : item.status === "ACCEPTED" ? item.activated ? "ACTIVE" : "ACCEPTED · AWAITING ADMIN" : item.status.replaceAll("_", " "); return <tr key={item.id}><td data-label="Teacher"><strong>{item.name}</strong><small className="school-teacher-email">{item.email}</small></td><td data-label="Department">{item.department || "—"}</td><td data-label="Status"><span className={`status-badge ${item.status === "ACCEPTED" && item.activated ? "status-active" : item.status === "REVOKED" || item.status === "EXPIRED" || item.status === "DECLINED" || suspended || item.accountActive === false ? "status-inactive" : "status-pending"}`}>{label}</span>{item.status === "DECLINED" && item.declineReason && <small className="school-teacher-email">Reason: {item.declineReason}</small>}{item.accountActive === false && <><small className="school-teacher-email">Platform review required; school access was not changed.</small><ContactPlatformSupportButton category="GENERAL_SUPPORT" label="Contact Platform Support"/></>}</td><td data-label="Assignments">{item.assignmentCount}</td><td data-label="Expires">{new Date(item.expiresAt).toLocaleString()}</td><td data-label="Actions"><div className="session-row-actions">{canActivate && <button type="button" className="text-button" disabled={invitationActionBusy} onClick={() => setActivationTarget(item)}>Activate</button>}{item.status === "ACCEPTED" && !item.activated && !suspended && <button type="button" className="text-button danger-text-button" disabled={invitationActionBusy} onClick={() => { setDeclineTarget(item); setDeclineReason(""); }}>Decline</button>}{["PENDING", "SENT", "EXPIRED", "DELIVERY_FAILED"].includes(item.status) && <button type="button" className="text-button" disabled={invitationActionBusy} onClick={() => void resendInvitation(item)}>Resend</button>}{["PENDING", "SENT", "EXPIRED", "DELIVERY_FAILED"].includes(item.status) && <button type="button" className="text-button danger-text-button" disabled={invitationActionBusy} onClick={() => { setInvitationTarget(item); setInvitationReason(""); }}>Revoke</button>}</div></td></tr>; })}</tbody></table></div>}
    </section>
    <ConfirmDialog open={Boolean(target)} title={membershipAction === "SUSPEND" ? "Suspend school access?" : membershipAction === "REACTIVATE" ? "Reactivate school membership?" : membershipAction === "REMOVE" ? "Remove teacher from this school?" : "Restore existing school membership?"} description={membershipAction === "SUSPEND" ? "This temporarily stops access to this school and ends current active allocations. The teacher’s SOMA account and other schools remain unchanged." : membershipAction === "REACTIVATE" ? "This reactivates only the suspended membership at this school. Existing allocations stay ended; assign current-term teaching separately." : membershipAction === "REMOVE" ? "This ends the teacher’s membership at this school and current allocations. Their account, other school memberships, marks, approvals, messages, and audit history are preserved." : "This restores the existing school membership using the same SOMA account. No duplicate membership is created; assign current-term teaching separately."} confirmLabel={membershipAction === "SUSPEND" ? "Suspend access" : membershipAction === "REACTIVATE" ? "Reactivate membership" : membershipAction === "REMOVE" ? "Remove from school" : "Restore membership"} destructive={membershipAction === "SUSPEND" || membershipAction === "REMOVE"} busy={accessBusy} confirmDisabled={!reason.trim()} currentState={target ? `${target.name} · ${target.membershipStatus}` : ""} nextState={membershipAction === "SUSPEND" ? "School membership suspended" : membershipAction === "REACTIVATE" || membershipAction === "RESTORE" ? "School membership active" : "Removed from this school"} impact="The change and reason are recorded in the school audit history." preserved="Other school memberships, the global account, and academic history are preserved." reversible onCancel={() => { if (!accessBusy)
        setTarget(null); }} onConfirm={() => void changeAccess()}><label className="form-field"><span>Reason for this change</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required placeholder="Record the approved staff-access change"/></label></ConfirmDialog>
    <ConfirmDialog open={Boolean(invitationTarget)} title="Revoke teacher invitation?" description="The invitation will no longer activate school membership. Other memberships and the teacher’s global sign-in account are unchanged." confirmLabel="Revoke invitation" destructive busy={invitationActionBusy} confirmDisabled={!invitationReason.trim()} currentState={invitationTarget ? `${invitationTarget.name} · ${invitationTarget.status}` : ""} nextState="Invitation revoked" impact="The action is recorded in the school audit history." preserved="The teacher’s account and any other school memberships are unchanged." reversible={false} onCancel={() => { if (!invitationActionBusy)
        setInvitationTarget(null); }} onConfirm={() => void cancelInvitation()}><label className="form-field"><span>Reason for revocation</span><textarea value={invitationReason} onChange={(event) => setInvitationReason(event.target.value)} maxLength={500} required placeholder="Record why this invitation is being revoked"/></label></ConfirmDialog>
    <ConfirmDialog open={Boolean(activationTarget)} title="Activate accepted teacher?" description="This activates only the Teacher membership at this school and applies the invitation’s school-scoped teaching assignments. The global SOMA account must already be active; School Admins cannot override platform security restrictions. New accounts receive a password-setup link; existing accounts keep their password." confirmLabel="Activate teacher" busy={invitationActionBusy} currentState={activationTarget ? `${activationTarget.name} · invitation accepted` : ""} nextState="Teacher membership active in this school" impact="Membership and assignments are recorded in the school audit history." preserved="Global sign-in status, other school memberships, and academic records are unchanged." reversible={false} onCancel={() => { if (!invitationActionBusy)
        setActivationTarget(null); }} onConfirm={() => void activateInvitation()}><></></ConfirmDialog>
    <ConfirmDialog open={Boolean(declineTarget)} title="Decline this teacher’s acceptance?" description="This closes only this school’s invitation. The teacher’s global account and memberships at other schools are unchanged." confirmLabel="Decline invitation" destructive busy={invitationActionBusy} confirmDisabled={!declineReason.trim()} currentState={declineTarget ? `${declineTarget.name} · accepted, awaiting school review` : ""} nextState="Invitation declined" impact="The decision and reason are recorded in this school’s audit history." preserved="Global account access, other school memberships, and academic records remain unchanged." reversible={false} onCancel={() => { if (!invitationActionBusy)
        setDeclineTarget(null); }} onConfirm={() => void declineInvitation()}><label className="form-field"><span>Reason for decline</span><textarea value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} maxLength={500} required placeholder="Record why the school is declining this request"/></label></ConfirmDialog>
    <ConfirmDialog open={Boolean(recoveryTarget)} title="Send teacher password-reset email?" description="The email contains a single-use recovery link. The school cannot view or choose the teacher’s password." confirmLabel="Send reset email" busy={recoveryBusy} currentState={recoveryTarget ? `${recoveryTarget.name} · ${maskEmail(recoveryTarget.email)} · ${school.schoolName}` : ""} nextState="Teacher receives a secure password-reset email" impact="This changes the password for the teacher’s one global sign-in account, including access at other schools." preserved="This school’s membership, other school memberships, allocations, and academic records are unchanged." reversible={false} onCancel={() => { if (!recoveryBusy)
        setRecoveryTarget(null); }} onConfirm={() => void sendTeacherRecovery()}><></></ConfirmDialog>
  </>;
}
function maskEmail(email) {
    const [local, domain] = email.split("@");
    if (!domain)
        return "hidden email";
    return `${local.slice(0, Math.min(2, local.length))}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}
function Summary({ icon, label, value, detail, success = false, warning = false }) {
    return <article className="staff-summary-card"><span className={`staff-summary-icon ${success ? "staff-summary-success" : warning ? "staff-summary-warning" : ""}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}
function AssignmentPicker({ terms, offerings, assignments, onChange, }) {
    const assignableTerms = terms.filter((term) => ["OPEN", "MARKS_OPEN", "REVIEW"].includes(term.status));
    const [termId, setTermId] = useState(assignableTerms[0]?.id ?? "");
    const [offeringId, setOfferingId] = useState("");
    const [role, setRole] = useState("CO_TEACHER");
    const term = assignableTerms.find((item) => item.id === termId);
    const options = offerings.filter((item) => item.academicYearId === term?.academicYearId);
    const selected = options.find((item) => item.id === offeringId);
    function add() {
        if (!term || !selected || assignments.some((item) => item.termId === term.id && item.offeringId === selected.id))
            return;
        onChange([...assignments, { termId: term.id, offeringId: selected.id, role }]);
        setOfferingId("");
    }
    return <>
    <div className="teacher-assignment-fields">
      <label>Term<select value={termId} onChange={(event) => { setTermId(event.target.value); setOfferingId(""); }}><option value="">Choose a term</option>{assignableTerms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Class, stream and subject<select value={offeringId} onChange={(event) => setOfferingId(event.target.value)} disabled={!termId}><option value="">Choose an offering</option>{options.map((item) => <option key={item.id} value={item.id}>{item.className}{item.streamName ? ` · ${item.streamName}` : ""} · {item.subjectCode ? `${item.subjectCode} · ` : ""}{item.subjectName}</option>)}</select></label>
      <label>Teaching allocation role<select value={role} onChange={(event) => setRole(event.target.value)}><option value="CO_TEACHER">Co-teacher</option><option value="PRIMARY_SUBJECT_TEACHER">Primary subject teacher</option><option value="SUBJECT_MODERATOR">Subject moderator</option></select></label>
      <button type="button" className="secondary-button" onClick={add} disabled={!termId || !offeringId}>Add assignment</button>
    </div>
    {assignments.length > 0 && <ul className="teacher-assignment-selected">{assignments.map((item) => { const option = offerings.find((entry) => entry.id === item.offeringId); const selectedTerm = terms.find((entry) => entry.id === item.termId); return <li key={`${item.termId}-${item.offeringId}`}><span><strong>{option?.className}{option?.streamName ? ` · ${option.streamName}` : ""}</strong><small>{selectedTerm?.name} · {option?.subjectName} · {item.role.replaceAll("_", " ")}</small></span><button type="button" className="text-button danger-text-button" onClick={() => onChange(assignments.filter((assignment) => assignment !== item))}>Remove</button></li>; })}</ul>}
  </>;
}
