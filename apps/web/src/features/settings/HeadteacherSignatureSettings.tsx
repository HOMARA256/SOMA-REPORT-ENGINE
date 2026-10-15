import { useEffect, useState } from "react";
import { PenLine, ShieldCheck } from "lucide-react";
import { currentUser } from "../../config/currentUser";
import { useSchoolContext } from "../context/SchoolContext";
import { saveHeadteacherSignature, useHeadteacherSignature } from "./headteacherSignature";

export function HeadteacherSignatureSettings() {
  const school = useSchoolContext();
  const { signature, loading, error, refresh } = useHeadteacherSignature(school.schoolId);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { setName(signature?.name ?? ""); }, [signature?.name]);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function save() {
    if (!school.schoolId || !file || !authorized || busy) return;
    setBusy(true); setNotice("");
    try {
      await saveHeadteacherSignature(school.schoolId, name, file);
      setFile(null); setAuthorized(false); await refresh();
      setNotice("Headteacher signature saved. New ID cards and new report previews use it; existing print snapshots remain unchanged.");
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "The signature could not be saved."); }
    finally { setBusy(false); }
  }
  return <section className="panel headteacher-signature-settings" aria-labelledby="headteacher-signature-heading">
    <div className="panel-heading"><div><h2 id="headteacher-signature-heading"><ShieldCheck size={20} aria-hidden="true" /> Headteacher’s authorized signature</h2><p>This school-controlled signature appears on the back of newly issued IDs and on new report-card previews. It is separate from each teacher’s holder signature on the ID front.</p></div></div>
    {error && <p className="form-error-message" role="alert">{error}</p>}
    {notice && <p className="form-success-message" role="status">{notice}</p>}
    {loading ? <p>Loading authorized signature…</p> : <div className="headteacher-signature-settings__body">
      <div className="headteacher-signature-settings__preview">{preview || signature?.imageUrl ? <img src={preview || signature?.imageUrl} alt={`Signature of ${name || signature?.name || "the Headteacher"}`} /> : <span><PenLine size={23} aria-hidden="true" /> No authorized signature uploaded</span>}<small>{signature ? `Current authorized signatory: ${signature.name}` : "Upload the Headteacher’s signature to authorize future documents."}</small></div>
      {currentUser.role === "SCHOOL_ADMIN" ? <div className="headteacher-signature-settings__form">
        <label className="form-field"><span>Headteacher’s full name</span><input value={name} maxLength={160} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
        <label className="form-field"><span>Signature image (PNG, JPEG or WebP, up to 1 MB)</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <label className="headteacher-signature-settings__consent"><input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} /><span>I confirm this is the Headteacher’s authorized signature and I have permission to use it on school IDs and report cards.</span></label>
        <button className="primary-button" type="button" disabled={!school.schoolId || !file || !authorized || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save authorized signature"}</button>
      </div> : <p>Only an active School Administrator can upload or replace this signature.</p>}
    </div>}
  </section>;
}
