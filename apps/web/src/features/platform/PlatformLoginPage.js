import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { PLATFORM_ADMIN_EMAIL, usePlatformWorkspace } from "./PlatformWorkspace";
import { sendPasswordRecovery } from "../auth/ResetPasswordPage";
export function PlatformLoginPage() {
    const workspace = usePlatformWorkspace();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [recoveryMessage, setRecoveryMessage] = useState("");
    if (workspace.authenticated)
        return <Navigate to="/platform/dashboard" replace/>;
    async function submit(event) { event.preventDefault(); setBusy(true); setError(""); const accepted = await workspace.signIn(email, password); setPassword(""); setShowPassword(false); setBusy(false); if (accepted)
        navigate("/platform/dashboard");
    else
        setError("Sign-in was not authorised. Check the credentials, MFA, and platform authentication service."); }
    return <main className="platform-login-page"><section className="platform-login-card"><div className="platform-login-mark"><img src="/soma-report-engine-logo.png" alt="SOMA REPORT ENGINE"/></div><span className="eyebrow">SOMA REPORT ENGINE PLATFORM</span><h1>Platform Control Centre</h1><p>Secure access for the single authorised Platform Administrator. School selection changes the tenant target only; it never changes your identity.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder={PLATFORM_ADMIN_EMAIL}/></label><label>Password<div className="password-input"><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"/><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>{error && <div className="form-error">{error}</div>}<button className="primary-button" type="submit" disabled={busy}><LockKeyhole size={18}/> {busy ? "Signing in…" : "Sign In"}</button><button type="button" className="auth-recovery-button" disabled={busy} onClick={async () => { setError(""); setRecoveryMessage(""); const recoveryError = await sendPasswordRecovery(email, "platform"); if (recoveryError)
        setError(recoveryError);
    else
        setRecoveryMessage("Platform Administrator recovery email sent. Check your inbox and open the newest secure link."); }}>Forgot password?</button>{recoveryMessage && <div className="form-success-message" role="status">{recoveryMessage}</div>}</form><div className="platform-login-security"><ShieldCheck size={18}/><span>The authenticated identity is verified against the active platform_admins record. No platform password is stored in this frontend.</span></div></section></main>;
}
