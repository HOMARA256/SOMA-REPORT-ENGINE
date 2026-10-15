import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { platformSupabase, supabase } from "../../config/supabaseClient";
import { PLATFORM_ADMIN_EMAIL } from "../platform/PlatformWorkspace";
export async function sendPasswordRecovery(email, portal) {
    const client = portal === "platform" ? platformSupabase : supabase;
    if (!client)
        return "The Supabase connection is not configured.";
    if (!email.trim())
        return "Enter your account email first.";
    const normalizedEmail = email.trim().toLowerCase();
    const cooldownKey = `ourschool:recovery:${portal}:${normalizedEmail}`;
    const lastRequest = Number(window.localStorage.getItem(cooldownKey) ?? 0);
    if (Date.now() - lastRequest < 60_000)
        return "A recovery request was already submitted. Use the newest email or wait one minute before trying again.";
    try {
        const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, {
            redirectTo: `${window.location.origin}/reset-password/${portal}`,
        });
        if (!error) {
            window.localStorage.setItem(cooldownKey, String(Date.now()));
            return null;
        }
        if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.message.toLowerCase().includes("rate limit"))
            return "Supabase has temporarily limited recovery email delivery. Use the newest recovery email already sent, then wait before requesting another.";
        return "Password recovery could not be started. Confirm the email service configuration and try again.";
    }
    catch (cause) {
        const message = cause instanceof Error ? cause.message.toLowerCase() : "";
        return message.includes("rate limit") ? "Supabase has temporarily limited recovery email delivery. Use the newest recovery email already sent, then wait before requesting another." : "Password recovery could not be started. Please try again later.";
    }
}
export function ResetPasswordPage() {
    const { portal } = useParams();
    const [searchParams] = useSearchParams();
    const recoveryRequestId = portal === "school" ? searchParams.get("recoveryRequest") : null;
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [error, setError] = useState("");
    const [completionWarning, setCompletionWarning] = useState("");
    const [complete, setComplete] = useState(false);
    const [busy, setBusy] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [recoveryContext, setRecoveryContext] = useState(null);
    const [recoveryContextState, setRecoveryContextState] = useState(recoveryRequestId ? "checking" : "ready");
    const validPortal = portal === "school" || portal === "platform";
    useEffect(() => {
        if (!recoveryRequestId || !supabase)
            return;
        const authClient = supabase;
        let active = true;
        let checking = false;
        let pendingSessionTimer = 0;
        const validateRecovery = async () => {
            if (checking)
                return;
            checking = true;
            const { data: identity } = await authClient.auth.getUser();
            if (!identity.user) {
                checking = false;
                return;
            }
            const { data, error: contextError } = await supabase.rpc("get_my_teacher_password_recovery_context", { p_request_id: recoveryRequestId });
            if (!active)
                return;
            if (contextError || !data?.schoolName) {
                setRecoveryContextState("unavailable");
                setError("This school-requested reset link is invalid, expired, already used, or belongs to a different teacher account. Ask the school to send a new link.");
            }
            else {
                setRecoveryContext({ schoolName: data.schoolName });
                setRecoveryContextState("ready");
            }
            checking = false;
        };
        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
                window.clearTimeout(pendingSessionTimer);
                queueMicrotask(() => void validateRecovery());
            }
        });
        void supabase.auth.getSession().then(({ data }) => {
            if (data.session)
                void validateRecovery();
            else
                pendingSessionTimer = window.setTimeout(() => {
                    if (!active)
                        return;
                    setRecoveryContextState("unavailable");
                    setError("This recovery link could not establish a valid sign-in session. Ask the School Administrator to send a new link.");
                }, 1800);
        });
        return () => { active = false; window.clearTimeout(pendingSessionTimer); listener.subscription.unsubscribe(); };
    }, [recoveryRequestId]);
    async function submit(event) {
        event.preventDefault();
        setError("");
        if (!validPortal)
            return setError("This recovery link is ambiguous. Return to the correct sign-in page and request a new password-reset email.");
        const client = portal === "platform" ? platformSupabase : supabase;
        if (!client)
            return setError("The Supabase connection is not configured.");
        const { data: identity, error: identityError } = await client.auth.getUser();
        if (identityError || !identity.user?.email)
            return setError("This recovery session is missing or expired. Request a new recovery email.");
        const isPlatformIdentity = identity.user.email.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL.toLowerCase();
        if (portal === "platform" && !isPlatformIdentity)
            return setError("This link belongs to a school account and cannot change the Platform Administrator password.");
        if (portal === "school" && isPlatformIdentity)
            return setError("This link belongs to the Platform Administrator and cannot be used on the school recovery page.");
        if (recoveryRequestId && (!recoveryContext || recoveryContextState !== "ready"))
            return setError("Validate the school-requested recovery email before setting a password.");
        if (password.length < 12)
            return setError("Use at least 12 characters.");
        if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))
            return setError("Use at least one uppercase letter, lowercase letter, number, and symbol.");
        if (password !== confirmation)
            return setError("The passwords do not match.");
        setBusy(true);
        const { error: updateError } = await client.auth.updateUser({ password });
        setBusy(false);
        if (updateError)
            return setError("The password could not be updated. Request a new recovery link and try again.");
        if (recoveryRequestId && portal === "school") {
            const { error: completionError } = await client.rpc("complete_my_teacher_password_recovery", { p_request_id: recoveryRequestId });
            const { error: signOutError } = await client.auth.signOut({ scope: "global" });
            if (completionError || signOutError)
                setCompletionWarning("Your password was changed, but the system could not confirm that all other sessions ended or that the reset was recorded. Sign in again and contact the School Administrator if this warning persists.");
        }
        else
            await client.auth.signOut({ scope: "local" });
        setPassword("");
        setConfirmation("");
        setShowPassword(false);
        setShowConfirmation(false);
        setComplete(true);
    }
    const destination = portal === "platform" ? "/platform/login" : "/login";
    const portalLabel = portal === "platform" ? "Platform Administrator" : "School account";
    return <main className="login-page"><section className="login-card"><div className="login-brand"><div className="login-brand-mark"><img src="/soma-report-engine-logo.png" alt="SOMA REPORT ENGINE"/></div><div><strong>SOMA REPORT ENGINE</strong><span>Secure account recovery</span></div></div><div className="login-content"><span className="eyebrow">{validPortal ? `${portalLabel.toUpperCase()} RECOVERY` : "INVALID RECOVERY ROUTE"}</span><h1>{complete ? "Password updated" : "Set a new password"}</h1>{complete ? <><p>Your new password is ready for the {portalLabel} sign-in.</p>{completionWarning && <div className="form-error" role="alert">{completionWarning}</div>}<div className="recovery-destinations"><Link className="primary-button" to={destination}>Return to sign in</Link></div></> : <><p>{recoveryContext ? `Password reset requested by ${recoveryContext.schoolName}. This updates your global sign-in password only; your school memberships and records remain unchanged.` : validPortal ? `This protected page accepts only a ${portalLabel.toLowerCase()} recovery identity.` : "Request a new link from the correct sign-in page. This old generic route cannot modify any account."}</p>{recoveryRequestId && recoveryContextState === "checking" && <p role="status">Verifying your secure school recovery link…</p>}<form className="login-form" onSubmit={submit}><label>New password<div className="password-input"><input type={showPassword ? "text" : "password"} minLength={12} required disabled={!validPortal || Boolean(recoveryRequestId && recoveryContextState !== "ready")} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)}/><button type="button" disabled={!validPortal} onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide new password" : "Show new password"}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label><label>Confirm password<div className="password-input"><input type={showConfirmation ? "text" : "password"} minLength={12} required disabled={!validPortal || Boolean(recoveryRequestId && recoveryContextState !== "ready")} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)}/><button type="button" disabled={!validPortal} onClick={() => setShowConfirmation((visible) => !visible)} aria-label={showConfirmation ? "Hide password confirmation" : "Show password confirmation"}>{showConfirmation ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button login-button" type="submit" disabled={busy || !validPortal || Boolean(recoveryRequestId && recoveryContextState !== "ready")}><KeyRound size={18}/>{busy ? "Updating…" : "Set Password"}</button></form>{!validPortal && <Link className="secondary-button" to="/login">Return to school sign in</Link>}</>}</div><p className="login-warning"><ShieldCheck size={16}/> Recovery sessions are portal-bound. SOMA REPORT ENGINE never displays or stores your password.</p></section></main>;
}
