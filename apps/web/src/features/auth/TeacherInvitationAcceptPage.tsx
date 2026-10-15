import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Building2, CheckCircle2, Eye, EyeOff, KeyRound, LogIn, MessageCircleMore, ShieldCheck } from "lucide-react";
import { supabase } from "../../config/supabaseClient";
import { applyResolvedIdentity } from "../../config/currentUser";
import { resolveCurrentIdentity } from "./authSession";
import { sendPasswordRecovery } from "./ResetPasswordPage";

type InvitationContext = {
  invitationId: string; status: string; schoolId: string; schoolName: string; schoolLogo?: string | null;
  teacherName: string; teacherEmail: string; department?: string | null; role: string; expiresAt: string;
  needsPasswordSetup: boolean;
  activated?: boolean;
  accountStatus?: string;
  accountActive?: boolean;
  globalSecurityRestricted?: boolean;
  membershipStatus?: string;
  acceptanceAllowed?: boolean;
  blockedReason?: string | null;
  schoolEmail?: string | null;
  schoolTelephone?: string | null;
  platformReview?: { requestStatus: string; submittedAt?: string; updatedAt?: string };
  assignments: Array<{ termId: string; termName: string; offeringId: string; className: string; streamName?: string | null; subjectName: string; role: string }>;
};

export function TeacherInvitationAcceptPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invitationId = params.get("invitation") ?? "";
  const [context, setContext] = useState<InvitationContext | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<"setup" | "sign-in">("setup");
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [acceptedPendingActivation, setAcceptedPendingActivation] = useState(false);
  const [sessionRefreshPending, setSessionRefreshPending] = useState(false);
  const contextLoadVersion = useRef(0);

  const loadContext = useCallback(async (silent = false) => {
    const requestVersion = ++contextLoadVersion.current;
    if (!supabase || !invitationId) { setChecking(false); return; }
    if (!silent) { setChecking(true); setError(""); }
    const { data: identity } = await supabase.auth.getUser();
    if (requestVersion !== contextLoadVersion.current) return;
    setHasSession(Boolean(identity.user));
    if (!identity.user) { setContext(null); setChecking(false); return; }
    const { data, error: contextError } = await (supabase as any).rpc("get_my_school_teacher_invitation", { p_invitation_id: invitationId });
    if (requestVersion !== contextLoadVersion.current) return;
    if (contextError || !data) {
      if (!silent) {
        setContext(null);
        setError("This invitation could not be verified for the signed-in email. Sign in with the invited address or ask the school to resend it.");
      }
    } else {
      const invitation = data as InvitationContext;
      const { data: reviewData, error: reviewError } = await (supabase as any).rpc("get_my_teacher_account_review_status", { p_invitation_id: invitationId });
      if (requestVersion !== contextLoadVersion.current) return;
      if (!reviewError && reviewData) invitation.platformReview = reviewData;
      setContext(invitation);
      if (invitation.activated) setAcceptedPendingActivation(false);
      // The RPC only returns this context after matching the authenticated
      // Auth email to the invitation; never trust an email from the URL.
      setEmail(invitation.teacherEmail);
    }
    if (!silent) setChecking(false);
  }, [invitationId]);

  useEffect(() => {
    if (!supabase) { void loadContext(); return; }
    // Subscribe before loading context so an Auth invite callback cannot race
    // the initial getUser() check and leave the page in its signed-out state.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
      if (session) {
        setChecking(true);
        queueMicrotask(() => void loadContext());
      } else {
        contextLoadVersion.current += 1;
        setContext(null);
        setEmail("");
        setChecking(false);
      }
    });
    void loadContext();
    return () => {
      contextLoadVersion.current += 1;
      data.subscription.unsubscribe();
    };
  }, [loadContext]);

  useEffect(() => {
    if (!hasSession || context?.status !== "ACCEPTED" || context.activated) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void loadContext(true);
    };
    const interval = window.setInterval(refresh, 12000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [context?.activated, context?.status, hasSession, loadContext]);

  async function continueToSignIn(passwordSetupComplete = false) {
    if (!supabase) return;
    setBusy(true); setError("");
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) {
      setError("Your password is ready, but this browser could not end the invitation session. Refresh the page before signing in again.");
      setBusy(false);
      return;
    }
    navigate("/login", { replace: true, state: { passwordSetupComplete, email: context?.teacherEmail ?? "" } });
  }

  async function refreshAcceptedSchoolSession(): Promise<boolean> {
    if (!supabase || !context?.schoolId) return false;
    const { error: preferenceError } = await (supabase as any).rpc("set_my_school_context", { p_school_id: context.schoolId });
    if (preferenceError) return false;
    window.localStorage.setItem("ourschool.context.school", context.schoolId);
    const resolved = await resolveCurrentIdentity();
    if (resolved.error || !resolved.user || resolved.user.schoolId !== context.schoolId) return false;
    applyResolvedIdentity(resolved.user);
    return true;
  }

  async function retrySchoolSessionRefresh() {
    setBusy(true);
    setError("");
    try {
      if (await refreshAcceptedSchoolSession()) setSessionRefreshPending(false);
      else setError("The school membership is accepted and active, but the refreshed sign-in context is not verified yet. Retry in a moment or continue to sign in again.");
    } catch {
      setError("The school membership is accepted and active, but the refreshed sign-in context is not verified yet. Retry in a moment or continue to sign in again.");
    } finally { setBusy(false); }
  }

  async function setTeacherPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!supabase || !context?.activated || !context.needsPasswordSetup) return;
    if (newPassword.length < 12 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setError("Use at least 12 characters, including uppercase and lowercase letters, a number, and a symbol."); return;
    }
    if (newPassword !== confirmPassword) { setError("The passwords do not match."); return; }
    setBusy(true);
    const { data: identity, error: identityError } = await supabase.auth.getUser();
    if (identityError || identity.user?.email?.toLowerCase() !== context.teacherEmail.toLowerCase()) {
      setError("Your verified invitation session has expired. Reopen the secure link from your email or ask the school for a password-reset link."); setBusy(false); return;
    }
    const { data: latest, error: contextError } = await (supabase as any).rpc("get_my_school_teacher_invitation", { p_invitation_id: invitationId });
    if (contextError || !latest?.activated || latest.schoolId !== context.schoolId) {
      setError("School activation could not be confirmed. Refresh this page and try again."); setBusy(false); return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setNewPassword(""); setConfirmPassword(""); setShowSetupPassword(false);
    if (updateError) {
      setError("The password could not be saved. Try again, or ask the school to send a secure password-reset link."); setBusy(false); return;
    }
    await continueToSignIn(true);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    if (!supabase) { setError("Sign-in is not available right now."); setBusy(false); return; }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setPassword(""); setShowPassword(false);
    if (signInError) { setError("Sign-in was not authorised. Check the invited email, password, and account status."); setBusy(false); return; }
    await loadContext(); setBusy(false);
  }

  async function requestSetupLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setRecoveryNotice("");
    const recoveryError = await sendPasswordRecovery(email, "school");
    setBusy(false);
    if (recoveryError) { setError(recoveryError); return; }
    setRecoveryNotice("If this email belongs to an eligible SOMA account, a secure password link will arrive. Check your inbox and spam folder. If nothing arrives, ask the School Administrator to send a password-reset email from Staff; email delivery must be configured.");
  }

  async function acceptInvitation() {
    setError("");
    if (!supabase || !context || context.acceptanceAllowed === false) return;
    setBusy(true);
    try {
      const { data, error: acceptError } = await (supabase as any).rpc("accept_school_teacher_invitation", { p_invitation_id: invitationId });
      if (acceptError || !data?.schoolId) {
        const message = String(acceptError?.message ?? "");
        const code = String(acceptError?.code ?? "");
        const safeMessage = message.includes("EXPIRED_OR_REVOKED") || message.includes("TEACHER_INVITATION_EXPIRED") ? "This invitation expired or was revoked. Ask the school administrator to resend it."
          : message.includes("PRIMARY_TEACHER_ALREADY_ASSIGNED") ? "A selected class/subject now has a different primary teacher. Ask the school administrator to update the invitation assignments."
          : message.includes("SCHOOL_MEMBERSHIP_EXISTS_WITH_DIFFERENT_ROLE") ? "Your existing school role cannot be changed by this invitation. Contact the school administrator to review your membership."
          : message.includes("ACCOUNT_COLLISION") || message.includes("TEACHER_ACCOUNT_COLLISION") ? "This email is linked to a separate staff profile that could not be safely connected to this sign-in. Ask the school administrator to review the account link; no records were merged."
          : message.includes("TEACHER_ACCOUNT_INACTIVE") || message.includes("TEACHER_ACCOUNT_GLOBAL_RESTRICTED") ? "Your SOMA sign-in is not active yet. Ask the School Administrator to request a linked Platform account review. After a Platform Administrator restores sign-in access, refresh this invitation and tap Accept school invitation. Keep the existing invitation."
          : message.includes("SCHOOL_MEMBERSHIP_SUSPENDED") ? `Your membership at ${context.schoolName} is suspended. Contact that school’s administrator to review it.`
          : message.includes("TEACHER_ALREADY_MEMBER") ? "This account already has a membership at this school. Ask the school administrator to refresh the invitation list and activate or review the existing membership."
          : message.includes("PLATFORM_ACCOUNT_CANNOT_BE_TEACHER") ? "A platform administrator account cannot accept a school Teacher invitation. Contact the platform administrator."
          : message.includes("VERIFIED_INVITATION_EMAIL_REQUIRED") ? "Verify this email address, then reopen the invitation link while signed in with the invited account."
          : message.includes("TEACHER_INVITATION_UNAVAILABLE") ? "This invitation is not available to the signed-in account. Ask the school administrator to confirm the invitation email and resend it if needed."
          : code === "PGRST202" ? "The database does not have the current teacher-acceptance function. Apply the latest teacher-invitation migration, then refresh the page."
          : code === "42501" ? "The database denied permission to record acceptance. Confirm that the current teacher-invitation migration and RPC grants are applied."
          : `Your acceptance could not be recorded${code ? ` (database code ${code})` : ""}. Ask the school administrator to review the invitation and share this code with support.`;
        setError(safeMessage); return;
      }
      if (data.activated) {
        const sessionRefreshed = await refreshAcceptedSchoolSession();
        setSessionRefreshPending(!sessionRefreshed);
        setContext({ ...context, status: "ACCEPTED", activated: true });
        setComplete(true);
      } else {
        setContext({ ...context, status: "ACCEPTED", activated: false });
        setAcceptedPendingActivation(true);
      }
    } catch {
      setError("The invitation service could not be reached. Your school access was not confirmed; keep this invitation open and retry.");
    } finally { setBusy(false); }
  }

  const accepted = context?.status === "ACCEPTED";
  const activated = Boolean(context?.activated);
  const unavailable = context && ["EXPIRED", "REVOKED", "DELIVERY_FAILED", "DECLINED"].includes(context.status);
  const blockedMessage = context?.blockedReason === "GLOBAL_ACCOUNT_RESTRICTED" ? `This SOMA account has a platform-wide security lock or suspension. The invitation and membership for ${context.schoolName} are school-scoped, but a platform-wide lock must be reviewed by SOMA Platform Support.`
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
      {context ? <div className="teacher-invitation-brand">{context.schoolLogo ? <img src={context.schoolLogo} alt={`${context.schoolName} badge`} /> : <span><Building2 size={28} aria-hidden="true" /></span>}<div><small>SCHOOL STAFF ACCESS</small><h1>{context.schoolName}</h1><p>{context.teacherEmail}</p></div></div> : <div className="teacher-invitation-brand"><span><Building2 size={28} aria-hidden="true" /></span><div><small>SECURE TEACHER INVITATION</small><h1>{checking ? "Verifying invitation…" : "Accept a school invitation"}</h1><p>School details appear after the invited email is verified.</p></div></div>}

      {checking ? <p className="teacher-invitation-status" role="status">Verifying the secure invitation…</p>
        : context?.blockedReason === "GLOBAL_ACCOUNT_RESTRICTED" ? <section className="teacher-invitation-message teacher-invitation-message--review" role="alert" aria-labelledby="platform-review-title">
          <header className="teacher-review-heading"><span className="teacher-review-icon"><MessageCircleMore size={21} aria-hidden="true" /></span><div><h2 id="platform-review-title">Platform-wide account restriction</h2><p>This security restriction applies to your SOMA sign-in, not just your membership at {context.schoolName}.</p></div></header>
          <div className="teacher-review-status" aria-live="polite">
            <span className={`teacher-review-status__dot teacher-review-status__dot--${context.platformReview?.requestStatus === "NONE" ? "none" : context.platformReview?.requestStatus === "RESOLVED" || context.platformReview?.requestStatus === "CLOSED" ? "done" : "pending"}`} aria-hidden="true" />
            <div><strong>{context.platformReview?.requestStatus === "AWAITING_PLATFORM" ? "Awaiting Platform review" : context.platformReview?.requestStatus === "AWAITING_SCHOOL" ? "Awaiting School response" : context.platformReview?.requestStatus === "RESOLVED" ? "Review resolved" : context.platformReview?.requestStatus === "CLOSED" ? "Review closed" : context.platformReview?.requestStatus === "OPEN" || context.platformReview?.requestStatus === "REOPENED" ? "Review in progress" : context.platformReview?.requestStatus === "NONE" ? "No review request yet" : "Review status unavailable"}</strong>
              <p>{context.platformReview?.requestStatus === "AWAITING_PLATFORM" || context.platformReview?.requestStatus === "OPEN" || context.platformReview?.requestStatus === "REOPENED" ? "Your School Administrator sent a linked request and Platform Administrators were notified. Refresh this page after the review. This does not accept or activate your school membership."
                : context.platformReview?.requestStatus === "AWAITING_SCHOOL" ? "Platform Support has reviewed the request and is waiting for the School Administrator. Contact the school for the next step."
                : context.platformReview?.requestStatus === "RESOLVED" || context.platformReview?.requestStatus === "CLOSED" ? "The restriction is still detected. Ask the School Administrator to follow up or reopen the linked request; do not create another invitation."
                : context.platformReview?.requestStatus === "NONE" ? <>Ask the School Administrator to open <strong>Staff → Teacher invitations</strong> and select <strong>Request Platform account review</strong>. Keep this invitation; no new invitation is needed.</>
                : "We could not load the linked request status. Refresh this page or ask the School Administrator to confirm the request."}</p>
            </div>
          </div>
          <footer className="teacher-review-actions"><button type="button" className="secondary-button" onClick={() => void loadContext()} disabled={checking}><ShieldCheck size={17} aria-hidden="true" />{checking ? "Refreshing…" : "Refresh status"}</button><span>After the account review, the School Administrator still activates your membership at this school.</span></footer>
          {(context.schoolEmail || context.schoolTelephone) ? <div className="teacher-review-contact">Contact the school: {context.schoolEmail ? <a href={`mailto:${context.schoolEmail}`}>{context.schoolEmail}</a> : null}{context.schoolEmail && context.schoolTelephone ? <span aria-hidden="true"> · </span> : null}{context.schoolTelephone ? <a href={`tel:${context.schoolTelephone}`}>{context.schoolTelephone}</a> : null}</div> : null}
        </section>
        : complete || (accepted && activated) ? <div className="teacher-invitation-complete"><CheckCircle2 size={30} aria-hidden="true" /><div><h2>School membership active</h2>{sessionRefreshPending && <div className="teacher-invitation-message teacher-invitation-message--pending" role="status"><p>Your membership was accepted, but this school session could not be refreshed yet. Your active membership is saved; refresh the school session before continuing.</p><button type="button" className="secondary-button" disabled={busy} onClick={() => void retrySchoolSessionRefresh()}>{busy ? "Refreshing…" : "Refresh school session"}</button></div>}{context?.needsPasswordSetup ? <><p>Your Teacher membership for <strong>{context.schoolName}</strong> is active. Create your SOMA sign-in password, then continue to the login page. This password is for your account across all schools; it is never shown to the School Administrator.</p><form className="teacher-password-setup" onSubmit={(event) => void setTeacherPassword(event)}><label>New password<div className="password-input"><input type={showSetupPassword ? "text" : "password"} required minLength={12} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><button type="button" aria-label={showSetupPassword ? "Hide password" : "Show password"} aria-pressed={showSetupPassword} onClick={() => setShowSetupPassword((visible) => !visible)}>{showSetupPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><label>Confirm password<input type={showSetupPassword ? "text" : "password"} required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label><small>Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol.</small>{error && <div className="form-error" role="alert">{error}</div>}<button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving password…" : "Set password and continue to sign in"}</button></form></> : <><p>Your Teacher membership for <strong>{context?.schoolName}</strong> is active. Use your existing SOMA password to sign in.</p>{error && <div className="form-error" role="alert">{error}</div>}<button type="button" className="primary-button" disabled={busy} onClick={() => void continueToSignIn()}>{busy ? "Opening sign in…" : "Continue to sign in"}</button></>}</div></div>
        : accepted && context?.membershipStatus === "INACTIVE" ? <div className="teacher-invitation-message" role="status"><h2>School membership suspended</h2><p>Your SOMA account remains separate from your Teacher membership at <strong>{context.schoolName}</strong>. Contact this school’s administrator to review or reactivate the school-specific membership.{context.schoolEmail ? <> <a href={`mailto:${context.schoolEmail}`}>Contact {context.schoolName}</a></> : null}{context.schoolTelephone ? <> · <a href={`tel:${context.schoolTelephone}`}>{context.schoolTelephone}</a></> : null}</p></div>
        : accepted || acceptedPendingActivation ? <div className="teacher-invitation-message teacher-invitation-message--pending" role="status"><h2>Acceptance sent to the School Administrator</h2><p>Your acceptance for <strong>{context?.schoolName}</strong> is recorded and awaiting school approval. This page checks for activation automatically. Once approved, you can set a password here while your verified session remains open. If you lose that session, request a secure setup link at this invitation page; an existing teacher can sign in with their password.{context?.schoolEmail ? <> Contact the school at <a href={`mailto:${context.schoolEmail}`}>{context.schoolEmail}</a>.</> : null}{context?.schoolTelephone ? <> Telephone: <a href={`tel:${context.schoolTelephone}`}>{context.schoolTelephone}</a>.</> : null}</p><button type="button" className="secondary-button" onClick={() => void loadContext()} disabled={checking}>{checking ? "Checking…" : "Check activation now"}</button></div>
        : unavailable ? <div className="teacher-invitation-message" role="status"><h2>{context.status === "DECLINED" ? "Invitation declined" : `Invitation ${context.status.toLowerCase()}`}</h2><p>This invitation can no longer activate access to {context.schoolName}. Contact the school to request a new invitation.{context.schoolEmail ? <> Email: <a href={`mailto:${context.schoolEmail}`}>{context.schoolEmail}</a>.</> : null}{context.schoolTelephone ? <> Telephone: <a href={`tel:${context.schoolTelephone}`}>{context.schoolTelephone}</a>.</> : null}</p></div>
        : context ? <>
          <div className="teacher-invitation-summary"><span className="teacher-role-chip">Teacher</span><p><strong>{context.teacherName}</strong> has been invited by <strong>{context.schoolName}</strong>{context.department ? ` · ${context.department}` : ""}.</p>{context.assignments.length ? <><h2>Initial teaching assignments</h2><ul>{context.assignments.map((item) => <li key={`${item.termId}-${item.offeringId}`}>{item.className}{item.streamName ? ` · ${item.streamName}` : ""} · {item.subjectName} · {item.termName} · {item.role.replaceAll("_", " ")}</li>)}</ul></> : <p>The school may assign classes and subjects after acceptance.</p>}<small>Invitation expires {new Date(context.expiresAt).toLocaleString()}.</small></div>
          {!context.acceptanceAllowed ? <div className="teacher-invitation-message" role={context.blockedReason === "GLOBAL_ACCOUNT_RESTRICTED" ? "alert" : "status"}><h2>{context.blockedReason === "GLOBAL_ACCOUNT_RESTRICTED" ? "SOMA account review required" : context.blockedReason === "SCHOOL_MEMBERSHIP_SUSPENDED" ? "School membership needs review" : "Invitation cannot be accepted"}</h2><p>{blockedMessage}{context.schoolEmail ? <> <a href={`mailto:${context.schoolEmail}`}>Contact {context.schoolName}</a>.</> : null}{context.blockedReason === "GLOBAL_ACCOUNT_RESTRICTED" ? " School contact details remain available for invitation questions; only Platform Support can review a global account restriction." : null}</p>{error && <p role="alert">{error}</p>}</div>
          : <div className="teacher-invitation-form"><div className="teacher-existing-account"><ShieldCheck size={20} aria-hidden="true" /><div><h2>{context.needsPasswordSetup ? "Review and accept invitation" : "Invited email verified"}</h2><p>{context.needsPasswordSetup ? "Accepting records your consent only. The School Administrator activates access; you can then set a password in this verified session. Email delivery is needed if you later request a setup link." : "You are signed in as the invited email address. Acceptance records consent; the School Administrator activates only this school membership."}</p></div></div>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button" type="button" disabled={busy} onClick={() => void acceptInvitation()}>{busy ? "Recording acceptance…" : "Accept school invitation"}</button></div>}
        </> : !hasSession ? <form className="teacher-invitation-form" onSubmit={(event) => void (authMode === "setup" ? requestSetupLink(event) : signIn(event))}>
          <h2>{authMode === "setup" ? "Set up your teacher sign-in" : "Sign in with your password"}</h2>
          <p>{authMode === "setup" ? "Have not set a password yet? Request a secure link at the email address that received your invitation. School details stay hidden until you verify that email." : "Use the email address that received the school invitation. School details stay hidden until your account is verified."}</p>
          <label>Email<input type="email" required autoComplete="username" value={email} onChange={(event) => { setEmail(event.target.value); setRecoveryNotice(""); }} /></label>
          {authMode === "sign-in" ? <label>Password<div className="password-input"><input type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label> : null}
          {error && <div className="form-error" role="alert">{error}</div>}
          {recoveryNotice && <div className="teacher-invitation-recovery-notice" role="status">{recoveryNotice}</div>}
          <button className="primary-button" disabled={busy}>{authMode === "setup" ? <KeyRound size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}{busy ? "Please wait…" : authMode === "setup" ? "Email me a password-setup link" : "Sign in securely"}</button>
          <button type="button" className="teacher-invitation-mode-switch" disabled={busy} onClick={() => { setAuthMode((mode) => mode === "setup" ? "sign-in" : "setup"); setError(""); setRecoveryNotice(""); setPassword(""); }}>{authMode === "setup" ? "I already have a password" : "I need to set or reset my password"}</button>
        </form> : <div className="teacher-invitation-message" role="alert">{error || "This invitation could not be verified. Check the invitation link and signed-in email."}</div>}
      <footer className="teacher-invitation-footer"><ShieldCheck size={16} aria-hidden="true" /> One-time sign-in link · invitation expires after 7 days · school access is verified by the database</footer>
    </section>
  </main>;
}
