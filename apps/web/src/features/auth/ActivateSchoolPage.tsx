import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../../config/supabaseClient";

export function ActivateSchoolPage(){
 const [params]=useSearchParams(); const [email,setEmail]=useState(""); const [temporaryPassword,setTemporaryPassword]=useState(""); const [inviteSession,setInviteSession]=useState(false); const [newPassword,setNewPassword]=useState(""); const [confirm,setConfirm]=useState(""); const [phone,setPhone]=useState(""); const [terms,setTerms]=useState(false); const [privacy,setPrivacy]=useState(false); const [show,setShow]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [complete,setComplete]=useState(false);
 useEffect(()=>{void supabase?.auth.getSession().then(({data})=>setInviteSession(Boolean(data.session)));},[]);
 async function submit(event:FormEvent){
  event.preventDefault();setError("");
  if(!supabase)return setError("Supabase is not configured.");
  if(newPassword!==confirm)return setError("The new passwords do not match.");
  const token=params.get("token");if(!token)return setError("This activation link is incomplete.");
  setBusy(true);
  try{
   if(!inviteSession){
    const {error:loginError}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password:temporaryPassword});
    if(loginError){setError("The invitation credentials were not accepted. Use the temporary password from the invitation, or the new password if you already tried activation.");return;}
    setInviteSession(true);
   }
   const {data,error:activationError}=await supabase.functions.invoke("activate-school-invitation",{body:{token,newPassword,phone,acceptTerms:terms,acceptPrivacy:privacy}});
   let code=String(data?.error??"");
   if(activationError&&!code){
    try{const response=(activationError as {context?:Response}).context;if(response)code=String((await response.clone().json() as {error?:string}).error??"");}catch{}
   }
   if(activationError||code){
    const messages:Record<string,string>={
     MFA_ENROLLMENT_REQUIRED:"Two-factor authentication must be enrolled before activation can finish.",
     PASSWORD_CHANGE_FAILED:"The password could not be saved. Your invitation is still available; check the password requirements and try again.",
     ACTIVATION_FAILED:"Your password has been saved, but school access did not finish activating. Your invitation is still available. Keep this page open and submit again; use the new password if asked to sign in.",
     INVITATION_EXPIRED_OR_USED:"This invitation has expired or was already used. Ask the Platform Administrator to resend it.",
     INVITATION_INVALID:"This invitation link could not be verified. Ask the Platform Administrator to resend it.",
     WEAK_PASSWORD:"Use at least 12 characters with uppercase, lowercase, a number and a symbol.",
    };
    setError(messages[code]??"Activation could not be completed. Your information is still on this page; try again or ask the Platform Administrator to resend the invitation.");
    return;
   }
   setTemporaryPassword("");setNewPassword("");setConfirm("");setComplete(true);
  }catch{
   setError("Activation could not reach the school service. Your invitation details remain on this page; try again.");
  }finally{setBusy(false);}
 }
 return <main className="login-page"><section className="login-card"><div className="login-brand"><div className="login-brand-mark"><img src="/soma-report-engine-logo.png" alt="SOMA REPORT ENGINE" /></div><div><strong>SOMA REPORT ENGINE</strong><span>Secure account activation</span></div></div><div className="login-content">{complete?<><span className="eyebrow">ACTIVATION COMPLETE</span><h1>Continue school setup</h1><p>Your activation link can no longer be reused.</p><Link className="primary-button login-button" to="/login">Continue to sign in</Link></>:<><span className="eyebrow">FIRST-TIME SCHOOL ADMIN</span><h1>Activate your account</h1><p>Confirm your invitation, create a password, and accept the current policies.</p><form className="login-form" onSubmit={submit}>{!inviteSession&&<><label>Email<input type="email" required autoComplete="username" value={email} onChange={(e)=>setEmail(e.target.value)}/></label><label>Current invitation password<div className="password-input"><input type={show?"text":"password"} required autoComplete="current-password" value={temporaryPassword} onChange={(e)=>setTemporaryPassword(e.target.value)}/><button type="button" aria-label={show?"Hide passwords":"Show passwords"} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div><small>Use the temporary password from the invitation, or the new password if activation was already attempted.</small></label></>}<label>New strong password<input type={show?"text":"password"} required minLength={12} autoComplete="new-password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)}/><small>At least 12 characters with uppercase, lowercase, number and symbol.</small></label><label>Confirm new password<input type={show?"text":"password"} required autoComplete="new-password" value={confirm} onChange={(e)=>setConfirm(e.target.value)}/></label><label>Confirm phone number<input required value={phone} onChange={(e)=>setPhone(e.target.value)}/></label><label className="checkbox-field"><input type="checkbox" required checked={terms} onChange={(e)=>setTerms(e.target.checked)}/><span>I accept the Terms of Service.</span></label><label className="checkbox-field"><input type="checkbox" required checked={privacy} onChange={(e)=>setPrivacy(e.target.checked)}/><span>I accept the Privacy Policy.</span></label>{error&&<div className="form-error" role="alert">{error}</div>}<button className="primary-button login-button" disabled={busy}>{busy?"Activating securely…":"Activate account"}</button></form></>}</div><p className="login-warning"><ShieldCheck size={16}/> Activation links are single-use and expire after 72 hours.</p></section></main>;
}
