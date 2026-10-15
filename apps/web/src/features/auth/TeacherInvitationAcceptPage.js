import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Building2, CheckCircle2, Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import { supabase } from "../../config/supabaseClient";
import { applyResolvedIdentity } from "../../config/currentUser";
import { resolveCurrentIdentity } from "./authSession";
export function TeacherInvitationAcceptPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const invitationId = params.get("invitation") ?? "";
    const [context, setContext] = useState(null);
    const [hasSession, setHasSession] = useState(false);
    const [checking, setChecking] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [complete, setComplete] = useState(false);
    const [acceptedPendingActivation, setAcceptedPendingActivation] = useState(false);
    const loadContext = useCallback(async () => {
        if (!supabase || !invitationId) {
            setChecking(false);
            return;
        }
        setChecking(true);
        setError("");
        const { data: identity } = await supabase.auth.getUser();
        setHasSession(Boolean(identity.user));
        if (!identity.user) {
            setContext(null);
            setChecking(false);
            return;
        }
        const { data, error: contextError } = await supabase.rpc("get_my_school_teacher_invitation", { p_invitation_id: invitationId });
        if (contextError || !data) {
            setContext(null);
            setError("This invitation could not be verified for the signed-in email. Sign in with the invited address or ask the school to resend it.");
        }
        else {
            const invitation = data;
            setContext(invitation);
            // The RPC only returns this context after matching the authenticated
            // Auth email to the invitation; never trust an email from the URL.
            setEmail(invitation.teacherEmail);
        }
        setChecking(false);
    }, [invitationId]);
    useEffect(() => {
        if (!supabase) {
            void loadContext();
            return;
        }
        // Subscribe before loading context so an Auth invite callback cannot race
        // the initial getUser() check and leave the page in its signed-out state.
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            setHasSession(Boolean(session));
            if (session)
                queueMicrotask(() => void loadContext());
            else {
                setContext(null);
                setEmail("");
            }
        });
        void loadContext();
        return () => data.subscription.unsubscribe();
    }, [loadContext]);
    async function signIn(event) {
        event.preventDefault();
        setBusy(true);
        setError("");
        if (!supabase) {
            setError("Sign-in is not available right now.");
            setBusy(false);
            return;
        }
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        setPassword("");
        setShowPassword(false);
        if (signInError) {
            setError("Sign-in was not authorised. Check the invited email, password, and account status.");
            setBusy(false);
            return;
        }
        await loadContext();
        setBusy(false);
    }
    async function acceptInvitation() {
        setError("");
        if (!supabase || !context || context.acceptanceAllowed === false)
            return;
        setBusy(true);
        try {
            const { data, error: acceptError } = await supabase.rpc("accept_school_teacher_invitation", { p_invitation_id: invitationId });
            if (acceptError || !data?.schoolId) {
                const message = String(acceptError?.message ?? "");
                const code = String(acceptError?.code ?? "");
                const safeMessage = message.includes("EXPIRED_OR_REVOKED") || message.includes("TEACHER_INVITATION_EXPIRED") ? "This invitation expired or was revoked. Ask the school administrator to resend it."
                    : message.includes("PRIMARY_TEACHER_ALREADY_ASSIGNED") ? "A selected class/subject now has a different primary teacher. Ask the school administrator to update the invitation assignments."
                        : message.includes("SCHOOL_MEMBERSHIP_EXISTS_WITH_DIFFERENT_ROLE") ? "Your existing school role cannot be changed by this invitation. Contact the school administrator to review your membership."
                            : message.includes("ACCOUNT_COLLISION") || message.includes("TEACHER_ACCOUNT_COLLISION") ? "This email is linked to a separate staff profile that could not be safely connected to this sign-in. Ask the school administrator to review the account link; no records were merged."
                                : message.includes("TEACHER_ACCOUNT_INACTIVE") || message.includes("TEACHER_ACCOUNT_GLOBAL_RESTRICTED") ? "This SOMA sign-in account has a global security restriction. The School Administrator cannot unlock it; contact SOMA Platform Support for account review."
                                    : message.includes("SCHOOL_MEMBERSHIP_SUSPENDED") ? `Your membership at ${context.schoolName} is suspended. Contact that school’s administrator to review it.`
                                        : message.includes("TEACHER_ALREADY_MEMBER") ? "This account already has a membership at this school. Ask the school administrator to refresh the invitation list and activate or review the existing membership."
                                            : message.includes("PLATFORM_ACCOUNT_CANNOT_BE_TEACHER") ? "A platform administrator account cannot accept a school Teacher invitation. Contact the platform administrator."
                                                : message.includes("VERIFIED_INVITATION_EMAIL_REQUIRED") ? "Verify this email address, then reopen the invitation link while signed in with the invited account."
                                                    : message.includes("TEACHER_INVITATION_UNAVAILABLE") ? "This invitation is not available to the signed-in account. Ask the school administrator to confirm the invitation email and resend it if needed."
                                                        : code === "PGRST202" ? "The database does not have the current teacher-acceptance function. Apply the latest teacher-invitation migration, then refresh the page."
                                                            : code === "42501" ? "The database denied permission to record acceptance. Confirm that the current teacher-invitation migration and RPC grants are applied."
                                                                : `Your acceptance could not be recorded${code ? ` (database code ${code})` : ""}. Ask the school administrator to review the invitation and share this code with support.`;
                setError(safeMessage);
                return;
            }
            if (data.activated) {
                const { error: preferenceError } = await supabase.rpc("set_my_school_context", { p_school_id: data.schoolId });
                if (!preferenceError) {
                    window.localStorage.setItem("ourschool.context.school", data.schoolId);
                    const resolved = await resolveCurrentIdentity();
                    if (!resolved.error && resolved.user && resolved.user.schoolId === data.schoolId)
                        applyResolvedIdentity(resolved.user);
                }
                setComplete(true);
            }
            else {
                setContext({ ...context, status: "ACCEPTED", activated: false });
                setAcceptedPendingActivation(true);
            }
        }
        catch {
            setError("The invitation service could not be reached. Your school access was not confirmed; keep this invitation open and retry.");
        }
        finally {
            setBusy(false);
        }
    }
    const accepted = context?.status === "ACCEPTED";
    const activated = Boolean(context?.activated);
    const unavailable = context && ["EXPIRED", "REVOKED", "DELIVERY_FAILED", "DECLINED"].includes(context.status);
    const blockedMessage = context?.blockedReason === "GLOBAL_ACCOUNT_RESTRICTED" ? "This SOMA account has a global security restriction. The School Administrator cannot unlock the account. Contact SOMA Platform Support for account review; your school invitation will remain separate."
        : context?.blockedReason === "SCHOOL_MEMBERSHIP_SUSPENDED" ? `Your membership at ${context.schoolName} is suspended. Contact the School Administrator for this school to review or reactivate that membership.`
            : context?.blockedReason === "MEMBERSHIP_ALREADY_ACTIVE" ? `Your Teacher membership at ${context.schoolName} is already active. Sign in to continue; no new acceptance is needed.`
                : context?.blockedReason === "ACCOUNT_COLLISION" ? "This email is linked to an unconnected SOMA profile. The school must review the account link; no duplicate account was created."
                    : context?.blockedReason === "EMAIL_NOT_VERIFIED" ? "Verify the invited email address before accepting this invitation."
                        : context?.blockedReason === "INVITATION_DECLINED" ? "This invitation was declined. Contact the inviting school if you still need access."
                            : context?.blockedReason === "INVITATION_NOT_ACTIONABLE" ? "This invitation is no longer active. Contact the school to request a new invitation."
                                : "This invitation cannot be accepted in its current state. Contact the inviting school for help.";
    return <main className="teacher-invitation-page">
    <section className="teacher-invitation-card">
      <div className="teacher-invitation-platform">Powered by <strong>SOMA REPORT ENGINE</strong></div>
      {context ? <div className="teacher-invitation-brand">{context.schoolLogo ? <img src={context.schoolLogo} alt={`${context.schoolName} badge`}/> : <span><Building2 size={28} aria-hidden="true"/></span>}<div><small>SCHOOL STAFF ACCESS</small><h1>{context.schoolName}</h1><p>{context.teacherEmail}</p></div></div> : <div className="teacher-invitation-brand"><span><Building2 size={28} aria-hidden="true"/></span><div><small>SECURE TEACHER INVITATION</small><h1>{checking ? "Verifying invitation…" : "Accept a school invitation"}</h1><p>School details appear after the invited email is verified.</p></div></div>}

      {checking ? <p className="teacher-invitation-status" role="status">Verifying the secure invitation…</p>
            : context?.blockedReason === "GLOBAL_ACCOUNT_RESTRICTED" ? <div className="teacher-invitation-message" role="alert"><h2>SOMA account review required</h2><p>Your invited email is verified and matched to <strong>{context.schoolName}</strong>, but the global SOMA sign-in account has a security restriction. The School Administrator can manage only this school’s membership and cannot unlock a global account. Ask the inviting school’s administrator to open Messages &amp; Support and contact Platform Support, providing your invited email and the school name.{context.schoolEmail ? <> <a href={`mailto:${context.schoolEmail}`}> Email {context.schoolName}</a></> : null}{context.schoolTelephone ? <> · <a href={`tel:${context.schoolTelephone}`}>{context.schoolTelephone}</a></> : null}</p></div>
                : complete || (accepted && activated) ? <div className="teacher-invitation-complete"><CheckCircle2 size={30} aria-hidden="true"/><div><h2>School membership active</h2><p>Your Teacher membership for <strong>{context?.schoolName}</strong> is active. Sign in with your account password to continue.</p><button type="button" className="primary-button" onClick={async () => { await supabase?.auth.signOut({ scope: "local" }); navigate("/login", { replace: true }); }}>Continue to sign in</button></div></div>
                    : accepted && context?.membershipStatus === "INACTIVE" ? <div className="teacher-invitation-message" role="status"><h2>School membership suspended</h2><p>Your SOMA account remains separate from your Teacher membership at <strong>{context.schoolName}</strong>. Contact this school’s administrator to review or reactivate the school-specific membership.{context.schoolEmail ? <> <a href={`mailto:${context.schoolEmail}`}>Contact {context.schoolName}</a></> : null}{context.schoolTelephone ? <> · <a href={`tel:${context.schoolTelephone}`}>{context.schoolTelephone}</a></> : null}</p></div>
                        : accepted || acceptedPendingActivation ? <div className="teacher-invitation-message" role="status"><h2>Acceptance sent to the School Administrator</h2><p>Your acceptance for <strong>{context?.schoolName}</strong> is recorded and awaiting school approval. School access will start only after the administrator activates your membership. If you need a new password, a secure setup link will be sent after activation.{context?.schoolEmail ? <> Contact the school at <a href={`mailto:${context.schoolEmail}`}>{context.schoolEmail}</a>.</> : null}{context?.schoolTelephone ? <> Telephone: <a href={`tel:${context.schoolTelephone}`}>{context.schoolTelephone}</a>.</> : null}</p></div>
                            : unavailable ? <div className="teacher-invitation-message" role="status"><h2>{context.status === "DECLINED" ? "Invitation declined" : `Invitation ${context.status.toLowerCase()}`}</h2><p>This invitation can no longer activate access to {context.schoolName}. Contact the school to request a new invitation.{context.schoolEmail ? <> Email: <a href={`mailto:${context.schoolEmail}`}>{context.schoolEmail}</a>.</> : null}{context.schoolTelephone ? <> Telephone: <a href={`tel:${context.schoolTelephone}`}>{context.schoolTelephone}</a>.</> : null}</p></div>
                                : context ? <>
          <div className="teacher-invitation-summary"><span className="teacher-role-chip">Teacher</span><p><strong>{context.teacherName}</strong> has been invited by <strong>{context.schoolName}</strong>{context.department ? ` · ${context.department}` : ""}.</p>{context.assignments.length ? <><h2>Initial teaching assignments</h2><ul>{context.assignments.map((item) => <li key={`${item.termId}-${item.offeringId}`}>{item.className}{item.streamName ? ` · ${item.streamName}` : ""} · {item.subjectName} · {item.termName} · {item.role.replaceAll("_", " ")}</li>)}</ul></> : <p>The school may assign classes and subjects after acceptance.</p>}<small>Invitation expires {new Date(context.expiresAt).toLocaleString()}.</small></div>
          {!context.acceptanceAllowed ? <div className="teacher-invitation-message" role={context.blockedReason === "GLOBAL_ACCOUNT_RESTRICTED" ? "alert" : "status"}><h2>{context.blockedReason === "GLOBAL_ACCOUNT_RESTRICTED" ? "SOMA account review required" : context.blockedReason === "SCHOOL_MEMBERSHIP_SUSPENDED" ? "School membership needs review" : "Invitation cannot be accepted"}</h2><p>{blockedMessage}{context.schoolEmail ? <> <a href={`mailto:${context.schoolEmail}`}>Contact {context.schoolName}</a>.</> : null}{context.blockedReason === "GLOBAL_ACCOUNT_RESTRICTED" ? " School contact details remain available for invitation questions; only Platform Support can review a global account restriction." : null}</p>{error && <p role="alert">{error}</p>}</div>
                                        : <div className="teacher-invitation-form"><div className="teacher-existing-account"><ShieldCheck size={20} aria-hidden="true"/><div><h2>{context.needsPasswordSetup ? "Review and accept invitation" : "Invited email verified"}</h2><p>{context.needsPasswordSetup ? "Accepting records your consent only. The School Administrator will activate access and send a secure password-setup link." : "You are signed in as the invited email address. Acceptance records consent; the School Administrator activates only this school membership."}</p></div></div>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button" type="button" disabled={busy} onClick={() => void acceptInvitation()}>{busy ? "Recording acceptance…" : "Accept school invitation"}</button></div>}
        </> : !hasSession ? <form className="teacher-invitation-form" onSubmit={(event) => void signIn(event)}><h2>Sign in to accept</h2><p>Use the email address that received the school invitation. The school name remains hidden until the account is verified.</p><label>Email<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)}/></label><label>Password<div className="password-input"><input type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)}/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button" disabled={busy}><LogIn size={17} aria-hidden="true"/>{busy ? "Signing in…" : "Sign in securely"}</button></form> : <div className="teacher-invitation-message" role="alert">{error || "This invitation could not be verified. Check the invitation link and signed-in email."}</div>}
      <footer className="teacher-invitation-footer"><ShieldCheck size={16} aria-hidden="true"/> One-time sign-in link · invitation expires after 7 days · school access is verified by the database</footer>
    </section>
  </main>;
}
