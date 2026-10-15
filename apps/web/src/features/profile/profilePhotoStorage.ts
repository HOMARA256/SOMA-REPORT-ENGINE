import { currentUser } from "../../config/currentUser";
import { platformSupabase, supabase } from "../../config/supabaseClient";

const BUCKET = "profile-photos";
const MAX_BYTES = 2 * 1024 * 1024;
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const accountClient = () => currentUser.role === "PLATFORM_ADMIN" ? platformSupabase : supabase;

export function validateProfilePhoto(file: File) {
  if (!extensions[file.type]) return "Choose a JPEG, PNG, or WebP image.";
  if (file.size > MAX_BYTES) return "Choose an image smaller than 2 MB.";
  return "";
}

async function upload(path: string, file: File) {
  if (!supabase) throw new Error("Photo storage is not connected.");
  const validation = validateProfilePhoto(file);
  if (validation) throw new Error(validation);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

async function signedUrl(path: string) {
  if (!supabase) throw new Error("Photo storage is not connected.");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function saveMyProfilePhoto(file: File | null, previousPath?: string | null) {
  const client = accountClient();
  if (!client) throw new Error("Photo storage is not connected.");
  let path: string | null = null;
  if (file) {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error("Sign in again before changing your profile photo.");
    const extension = extensions[file.type];
    const validation = validateProfilePhoto(file);
    if (validation) throw new Error(validation);
    path = `users/${data.user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);
  }
  const { data, error } = await (client as any).rpc("set_my_profile_photo_path", { p_photo_path: path });
  if (error) {
    if (path) await client.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  if (previousPath && previousPath !== path) await client.storage.from(BUCKET).remove([previousPath]);
  const { data: signed, error: signedError } = path ? await client.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24) : { data: null, error: null };
  if (signedError) throw new Error(signedError.message);
  return { path: data as string | null, url: signed?.signedUrl ?? null };
}

export async function saveLearnerProfilePhoto(schoolId: string, learnerId: string, file: File | null, previousPath?: string | null) {
  if (!supabase) throw new Error("Photo storage is not connected.");
  let path: string | null = null;
  if (file) {
    const extension = extensions[file.type];
    path = await upload(`schools/${schoolId}/learners/${learnerId}/${crypto.randomUUID()}.${extension}`, file);
  }
  const { error } = await (supabase as any).rpc("set_school_learner_profile_photo_path", {
    p_school_id: schoolId, p_learner_id: learnerId, p_photo_path: path,
  });
  if (error) {
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  if (previousPath && previousPath !== path) await supabase.storage.from(BUCKET).remove([previousPath]);
  return { path, url: path ? await signedUrl(path) : null };
}

export async function getProfilePhotoUrl(path: string | null | undefined) {
  if (!path || !supabase) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24);
  return error ? null : data.signedUrl;
}

export function announceProfilePhotoChange(url: string | null) {
  window.dispatchEvent(new CustomEvent("soma-profile-photo-updated", { detail: { url } }));
}
