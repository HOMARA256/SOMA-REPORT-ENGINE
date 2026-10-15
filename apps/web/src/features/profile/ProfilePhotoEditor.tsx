import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

type Props = { name: string; initials: string; photoUrl?: string | null; onSave: (file: File | null) => Promise<string | null> };

export function ProfilePhotoEditor({ name, initials, photoUrl, onSave }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function choose(next: File | null) {
    setError(""); setNotice(""); setFile(next);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  async function save(next: File | null) {
    setBusy(true); setError(""); setNotice("");
    try {
      const message = await onSave(next);
      if (message) throw new Error(message);
      choose(null);
      setNotice(next ? "Profile photo saved." : "Profile photo removed. Initials will be shown instead.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Profile photo could not be saved."); }
    finally { setBusy(false); }
  }

  return <section className="profile-photo-editor" aria-label={`${name} profile photo`}>
    <div className="profile-photo-preview" aria-hidden="true">{preview || photoUrl ? <img src={preview || photoUrl || ""} alt="" /> : <span>{initials}</span>}</div>
    <div className="profile-photo-controls">
      <div className="session-row-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={16} />Choose photo</button>
        {file && <button type="button" className="primary-button" disabled={busy} onClick={() => void save(file)}>{busy ? "Saving…" : "Save photo"}</button>}
        {file && <button type="button" className="secondary-button" disabled={busy} onClick={() => choose(null)}>Cancel selection</button>}
        {!file && photoUrl && <button type="button" className="secondary-button" disabled={busy} onClick={() => void save(null)}><Trash2 size={16} />Remove photo</button>}
      </div>
      <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
      <small>Optional · JPEG, PNG, or WebP · maximum 2 MB. Without a photo, initials are shown.</small>
      {error && <p className="form-error-message" role="alert">{error}</p>}
      {notice && <p className="form-success-message" role="status">{notice}</p>}
    </div>
  </section>;
}
