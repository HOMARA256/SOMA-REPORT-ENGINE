import { useState, type FormEvent } from "react";
import { FileUp } from "lucide-react";
import { supabase } from "../../config/supabaseClient";

const accepted = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

export function SchoolAdmissionDocuments({ schoolId, applicationId, requirements, documents, onSaved }: {
  schoolId: string; applicationId: string;
  requirements: Array<{ type: string; required: boolean }>;
  documents: Array<{ id: string; type: string; fileName: string; path: string; status: string }>;
  onSaved: () => Promise<void>;
}) {
  const [type, setType] = useState(requirements[0]?.type ?? "OTHER");
  const [customType, setCustomType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !file || !schoolId || !applicationId) return;
    const documentType = (type === "OTHER" ? customType : type).trim();
    if (!documentType || documentType.length > 80) { setError("Enter a document name of at most 80 characters."); return; }
    if (!accepted.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) { setError("Use PDF, PNG, JPEG, WebP, text, or DOCX, at most 10 MB."); return; }
    setBusy(true); setError(""); setNotice("");
    const path = `schools/${schoolId}/admissions/${applicationId}/documents/${crypto.randomUUID()}`;
    let recorded = false;
    try {
      const { error: uploadError } = await supabase.storage.from("school-admission-documents").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error: recordError } = await (supabase as any).rpc("record_school_admission_document", {
        p_school_id: schoolId, p_application_id: applicationId, p_document_type: documentType,
        p_storage_path: path, p_file_name: file.name, p_mime_type: file.type, p_file_size: file.size,
      });
      if (recordError) throw recordError;
      recorded = true; setFile(null); setCustomType("");
      setNotice("Document uploaded securely. Review and verify it before completing admission.");
      await onSaved();
    } catch (cause) {
      if (!recorded) void supabase.storage.from("school-admission-documents").remove([path]);
      setError(cause instanceof Error ? cause.message : "The document could not be saved.");
    } finally { setBusy(false); }
  }

  async function verify(documentId: string, status: "VERIFIED" | "REJECTED") {
    if (!supabase) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: rpcError } = await (supabase as any).rpc("verify_school_admission_document", {
        p_school_id: schoolId, p_document_id: documentId, p_status: status,
      });
      if (rpcError) throw rpcError;
      await onSaved();
      setNotice(`Document ${status.toLowerCase()}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The review could not be saved."); }
    finally { setBusy(false); }
  }

  async function view(path: string) {
    if (!supabase) return;
    const { data, error: signedError } = await supabase.storage.from("school-admission-documents").createSignedUrl(path, 90);
    if (signedError || !data?.signedUrl) { setError(signedError?.message ?? "The protected document could not be opened."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return <form className="school-admission-documents" onSubmit={(event) => void upload(event)}>
    <h3>Add a received document</h3>
    <p>Missing optional documents do not block admission. Required documents must be uploaded and verified before placement.</p>
    {error && <p className="admissions-alert" role="alert">{error}</p>}
    {notice && <p className="admissions-notice" role="status">{notice}</p>}
    <div className="admissions-grid">
      <label>Document type<select value={type} onChange={(event) => setType(event.target.value)}>{requirements.map((item) => <option key={item.type} value={item.type}>{item.type}{item.required ? " · required" : " · optional"}</option>)}<option value="OTHER">Other supporting document</option></select></label>
      {type === "OTHER" && <label>Document name<input required maxLength={80} value={customType} onChange={(event) => setCustomType(event.target.value)} /></label>}
      <label>File<input key={file?.name ?? "empty"} required type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
    </div>
    <button type="submit" className="button button--secondary" disabled={busy || !file}><FileUp size={16} /> {busy ? "Uploading…" : "Upload to this application"}</button>
    <div className="school-admission-document-list">{documents.map((item) => <div key={item.id}><span><strong>{item.type}</strong> · {item.fileName} · {item.status}</span><div className="admissions-actions"><button type="button" className="button button--secondary" onClick={() => void view(item.path)}>Secure view</button><button type="button" className="button button--secondary" disabled={busy || item.status === "VERIFIED"} onClick={() => void verify(item.id, "VERIFIED")}>Verify</button><button type="button" className="button button--secondary" disabled={busy || item.status === "REJECTED"} onClick={() => void verify(item.id, "REJECTED")}>Reject</button></div></div>)}</div>
  </form>;
}
