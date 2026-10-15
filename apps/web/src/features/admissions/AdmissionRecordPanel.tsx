import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Printer, RefreshCw } from "lucide-react";
import { supabase } from "../../config/supabaseClient";
import { makeAdmissionRecordPdf } from "./admissionRecordPdf";

type Application = {
  id: string; reference: string; academicYearId: string; convertedLearnerId?: string;
  learner: Record<string, string>; guardian: Record<string, string>;
  documents: Array<{ type: string; status: string }>;
};
type Version = { id: string; version: number; documentId: string; storagePath: string; fileName: string; createdAt: string; createdBy: string };
const explain = (cause: unknown) => cause instanceof Error ? cause.message : "The record could not be processed.";

async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error("The school database is unavailable.");
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw error;
  return data;
}

export function AdmissionRecordPanel({ schoolId, schoolName, schoolLogo, application }: {
  schoolId: string; schoolName: string; schoolLogo?: string; application: Application;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [pendingDocumentId, setPendingDocumentId] = useState("");
  const load = useCallback(async () => {
    const records = await rpc("get_school_admission_records", { p_school_id: schoolId, p_application_id: application.id });
    setVersions(Array.isArray(records) ? records : []);
  }, [schoolId, application.id]);
  useEffect(() => { setVersions([]); setError(""); setNotice(""); setPendingDocumentId(""); void load().catch((cause) => setError(explain(cause))); }, [load]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function generate() {
    if (!application.convertedLearnerId || !supabase) return;
    setBusy(true); setError(""); setNotice("");
    let uploadedPath = "";
    let documentId = "";
    try {
      const [register, schoolResult, enrolmentResult, learnerResult] = await Promise.all([
        rpc("get_school_id_card_register", { p_school_id: schoolId }),
        supabase.from("schools").select("official_name,email,telephone,address,logo_url").eq("id", schoolId).single(),
        supabase.from("learner_class_enrolments").select("effective_from").eq("school_id", schoolId).eq("learner_id", application.convertedLearnerId).eq("academic_year_id", application.academicYearId).eq("status", "ACTIVE").is("effective_to", null).maybeSingle(),
        (supabase as any).from("learners").select("date_of_birth,gender,guardian_name,guardian_phone").eq("school_id", schoolId).eq("id", application.convertedLearnerId).single(),
      ]);
      if (schoolResult.error) throw schoolResult.error;
      if (enrolmentResult.error) throw enrolmentResult.error;
      if (learnerResult.error) throw learnerResult.error;
      if (!enrolmentResult.data) throw new Error("This admission has no active enrolment for its academic year.");
      const person = register?.learners?.find((item: any) => item.id === application.convertedLearnerId);
      if (!person?.admissionNumber) throw new Error("The confirmed learner record was not found in this school.");
      let photoUrl = "";
      if (person.photoPath) {
        const { data } = await supabase.storage.from("profile-photos").createSignedUrl(person.photoPath, 120);
        photoUrl = data?.signedUrl ?? "";
      }
      const version = (versions[0]?.version ?? 0) + 1;
      const bytes = await makeAdmissionRecordPdf({
        schoolName: schoolResult.data.official_name || schoolName,
        schoolLogo: schoolResult.data.logo_url || schoolLogo,
        schoolAddress: schoolResult.data.address ?? "", schoolPhone: schoolResult.data.telephone ?? "", schoolEmail: schoolResult.data.email ?? "",
        reference: application.reference, admissionNumber: person.admissionNumber, version, generatedAt: new Date(),
        learnerName: person.fullName, dateOfBirth: learnerResult.data.date_of_birth ?? application.learner.dateOfBirth,
        gender: learnerResult.data.gender ?? application.learner.gender,
        nationality: application.learner.nationality, photoUrl,
        admissionType: application.learner.admissionType, admissionDate: enrolmentResult.data.effective_from,
        previousSchool: application.learner.previousSchool, academicYear: person.academicYear,
        className: person.className, streamName: person.streamName,
        guardianName: learnerResult.data.guardian_name ?? application.guardian.fullName, guardianRelationship: application.guardian.relationship,
        guardianPhone: learnerResult.data.guardian_phone ?? application.guardian.phone, guardianAlternatePhone: application.guardian.alternatePhone,
        guardianEmail: application.guardian.email, guardianAddress: application.guardian.address,
        notes: application.learner.notes, documents: application.documents,
      });
      const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
      const fileName = `admission-${application.reference}-v${version}.pdf`;
      uploadedPath = `schools/${schoolId}/documents/learners/${person.id}/documents/${crypto.randomUUID()}`;
      const upload = await supabase.storage.from("school-document-library").upload(uploadedPath, blob, { contentType: "application/pdf", upsert: false });
      if (upload.error) throw upload.error;
      documentId = await rpc("save_school_document_library_item", {
        p_school_id: schoolId, p_document_id: versions[0]?.documentId ?? null,
        p_category: "LEARNER_ADMISSION", p_title: `School Admission Record · ${application.reference}`,
        p_description: `Confirmed admission record, version ${version}`, p_linked_entity_type: "LEARNER",
        p_linked_entity_id: person.id, p_visibility: "SCHOOL_ADMIN_ONLY",
        p_storage_path: uploadedPath, p_file_name: fileName, p_mime_type: "application/pdf", p_file_size: blob.size,
      });
      await rpc("register_school_admission_record", { p_school_id: schoolId, p_application_id: application.id, p_document_id: documentId });
      setPendingDocumentId("");
      setPreviewUrl(URL.createObjectURL(blob));
      setNotice(`Version ${version} saved in private school storage. Review the preview before downloading or printing.`);
      await load();
    } catch (cause) {
      if (uploadedPath && !documentId) void supabase.storage.from("school-document-library").remove([uploadedPath]);
      if (documentId) setPendingDocumentId(documentId);
      setError(`The PDF step failed: ${explain(cause)}${documentId ? " The protected file was saved; retry record registration below." : " The confirmed admission remains intact."}`);
    } finally { setBusy(false); }
  }
  async function retryRegistration() {
    if (!pendingDocumentId) return;
    setBusy(true); setError("");
    try { await rpc("register_school_admission_record", { p_school_id: schoolId, p_application_id: application.id, p_document_id: pendingDocumentId }); setPendingDocumentId(""); setNotice("The saved PDF is now registered."); await load(); }
    catch (cause) { setError(explain(cause)); }
    finally { setBusy(false); }
  }
  async function signedBlob(record: Version) {
    if (!supabase) throw new Error("The school database is unavailable.");
    const { data, error: signedError } = await supabase.storage.from("school-document-library").createSignedUrl(record.storagePath, 90);
    if (signedError || !data?.signedUrl) throw signedError ?? new Error("Secure document link could not be created.");
    const response = await fetch(data.signedUrl);
    if (!response.ok) throw new Error("The protected PDF could not be downloaded.");
    return response.blob();
  }
  async function preview(record: Version) {
    setBusy(true); setError("");
    try { setPreviewUrl(URL.createObjectURL(await signedBlob(record))); }
    catch (cause) { setError(explain(cause)); }
    finally { setBusy(false); }
  }
  async function download(record: Version) {
    setBusy(true); setError("");
    try {
      const blob = await signedBlob(record);
      await rpc("record_school_admission_record_download", { p_school_id: schoolId, p_record_id: record.id });
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = record.fileName; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (cause) { setError(explain(cause)); }
    finally { setBusy(false); }
  }
  function print() { if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer"); }

  return <section className="admissions-card admission-record-panel" aria-labelledby="admission-record-title">
    <div className="admissions-card__head"><div><span className="eyebrow">CONFIRMED ADMISSION</span><h2 id="admission-record-title">Printable school admission record</h2><p>Private A4 school-file PDF. Previous versions remain available for audit.</p></div><FileText size={24} aria-hidden="true" /></div>
    {error && <p className="admissions-alert" role="alert">{error}</p>}{notice && <p className="admissions-notice" role="status">{notice}</p>}
    <div className="admissions-actions"><button type="button" className="button button--primary" disabled={busy} onClick={() => void generate()}><RefreshCw size={16}/>{busy ? "Working…" : versions.length ? "Regenerate after correction" : "Generate admission record"}</button>{pendingDocumentId && <button type="button" className="button" disabled={busy} onClick={() => void retryRegistration()}>Retry registration</button>}{previewUrl && <button type="button" className="button" onClick={print}><Printer size={16}/> Print preview</button>}</div>
    {versions.length > 0 && <div className="admission-record-versions">{versions.map((record) => <div key={record.id}><span><strong>Version {record.version}</strong><small>{new Date(record.createdAt).toLocaleString()} · {record.createdBy}</small></span><div className="admissions-actions"><button type="button" className="button" disabled={busy} onClick={() => void preview(record)}>Preview</button><button type="button" className="button" disabled={busy} onClick={() => void download(record)}><Download size={16}/> Download PDF</button></div></div>)}</div>}
    {previewUrl && <iframe className="admission-record-preview" src={previewUrl} title={`Admission record preview for ${application.reference}`} />}
  </section>;
}
