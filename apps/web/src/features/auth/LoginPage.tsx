import { Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase, supabaseConfigured } from "../../config/supabaseClient";
import { sendPasswordRecovery } from "./ResetPasswordPage";
import { resolveCurrentIdentity } from "./authSession";
import { applyResolvedIdentity } from "../../config/currentUser";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setupResult = location.state as { passwordSetupComplete?: boolean; email?: string } | null;
  const [email, setEmail] = useState(setupResult?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("The Supabase connection is not configured for this deployment.");
      return;
    }
    setBusy(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signInError || !data.user) {
      setPassword("");
      setShowPassword(false);
      setError("Sign-in was not authorised. Check your email, password and account access.");
      setBusy(false);
      return;
    }

    const resolved=await resolveCurrentIdentity();
    if(!resolved.user||resolved.user.role==="PLATFORM_ADMIN"){
      await supabase.auth.signOut({ scope: "local" }); setPassword(""); setShowPassword(false);
      setError(resolved.user?.role==="PLATFORM_ADMIN"?"Use the Platform Control Centre for this account.":resolved.error);
      setBusy(false); return;
    }
    applyResolvedIdentity(resolved.user);

    setPassword(""); setShowPassword(false); setBusy(false);
    navigate("/dashboard");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div className="login-brand-mark"><img src="/soma-report-engine-logo.png" alt="SOMA REPORT ENGINE" /></div>

          <div>
            <strong>SOMA REPORT ENGINE</strong>
            <span>
              Academic Results Platform
            </span>
          </div>
        </div>

        <div className="login-content">
          <span className="eyebrow">SECURE SCHOOL ACCESS</span>

          <h1>Sign in to SOMA REPORT ENGINE</h1>

          <p>Use the school account registered with SOMA REPORT ENGINE.</p>
          {setupResult?.passwordSetupComplete && <div className="form-success-message" role="status"><ShieldCheck size={18} aria-hidden="true" />Password set successfully. Sign in to open your school dashboard.</div>}

          <form onSubmit={submit} className="login-form">
            <label>Email<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="School administrator email" /></label>
            <label>Password<div className="password-input"><input type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={()=>setShowPassword((visible)=>!visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button type="submit" className="primary-button login-button" disabled={busy || !supabaseConfigured}>
              <LogIn size={18} aria-hidden="true" />
              {busy ? "Signing in…" : "Sign In"}
            </button>
            <button type="button" className="auth-recovery-button" disabled={busy} onClick={async()=>{setPassword("");setShowPassword(false);setError("");setRecoveryMessage("");const recoveryError=await sendPasswordRecovery(email,"school");if(recoveryError)setError(recoveryError);else setRecoveryMessage("School-account recovery email sent. Check your inbox and open the newest secure link.");}}>Forgot password?</button>
            {recoveryMessage&&<div className="form-success-message" role="status">{recoveryMessage}</div>}
          </form>
        </div>

        <p className="login-warning"><ShieldCheck size={16} aria-hidden="true" /> Secured by Supabase authentication and school membership permissions.</p>
      </section>
    </main>
  );
}
