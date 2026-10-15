import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../config/supabaseClient";

export type HeadteacherSignature = { name: string; signaturePath: string; imageUrl: string };

export async function loadHeadteacherSignature(schoolId: string): Promise<HeadteacherSignature | null> {
  if (!supabase) throw new Error("The school database is unavailable.");
  const { data, error } = await (supabase as any).rpc("get_school_headteacher_signature", { p_school_id: schoolId });
  if (error) throw error;
  const record = data as { name?: string; signaturePath?: string } | null;
  if (!record?.name || !record.signaturePath) return null;
  const signed = await supabase.storage.from("school-authorized-signatures").createSignedUrl(record.signaturePath, 300);
  if (signed.error || !signed.data?.signedUrl) throw new Error("The Headteacher signature image could not be loaded.");
  const response = await fetch(signed.data.signedUrl);
  if (!response.ok) throw new Error("The Headteacher signature image could not be read.");
  const blob = await response.blob();
  const imageUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The Headteacher signature image could not be decoded."));
    reader.readAsDataURL(blob);
  });
  return { name: record.name, signaturePath: record.signaturePath, imageUrl };
}

export function useHeadteacherSignature(schoolId: string | null | undefined) {
  const [signature, setSignature] = useState<HeadteacherSignature | null>(null);
  const [loading, setLoading] = useState(Boolean(schoolId));
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!schoolId) { setSignature(null); setLoading(false); return; }
    setLoading(true); setError("");
    try { setSignature(await loadHeadteacherSignature(schoolId)); }
    catch (cause) { setSignature(null); setError(cause instanceof Error ? cause.message : "Could not load the Headteacher signature."); }
    finally { setLoading(false); }
  }, [schoolId]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { signature, loading, error, refresh };
}

export async function saveHeadteacherSignature(schoolId: string, name: string, file: File) {
  if (!supabase) throw new Error("The school database is unavailable.");
  if (name.trim().length < 3 || name.trim().length > 160) throw new Error("Enter the Headteacher’s full name (3–160 characters).");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG, or WebP signature image.");
  if (file.size > 1024 * 1024) throw new Error("The signature image must be 1 MB or smaller.");
  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
  const path = `schools/${schoolId}/headteacher/${crypto.randomUUID()}.${extension}`;
  const uploaded = await supabase.storage.from("school-authorized-signatures").upload(path, file, { upsert: false, contentType: file.type });
  if (uploaded.error) throw uploaded.error;
  const saved = await (supabase as any).rpc("set_school_headteacher_signature", { p_school_id: schoolId, p_name: name.trim(), p_signature_path: path });
  if (saved.error) throw saved.error;
}
