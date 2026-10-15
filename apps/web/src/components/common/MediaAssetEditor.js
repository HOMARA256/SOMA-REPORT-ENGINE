import { ImagePlus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
export function MediaAssetEditor({ title, description, value, circular = false, saveLabel = "Save image", onSave, onRemove }) {
    const inputRef = useRef(null);
    const [preview, setPreview] = useState(value ?? "");
    const [fileName, setFileName] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    useEffect(() => { if (!fileName)
        setPreview(value ?? ""); }, [value, fileName]);
    function chooseFile(file) {
        setError("");
        setNotice("");
        if (!file)
            return;
        if (!file.type.startsWith("image/")) {
            setError("Choose a PNG, JPEG, WebP or SVG image.");
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setError("The image is larger than 2 MB. Choose a smaller image.");
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => setError("The image could not be read. Choose another file.");
        reader.onload = () => { setPreview(String(reader.result)); setFileName(file.name); };
        reader.readAsDataURL(file);
    }
    async function save() {
        if (!preview || preview === value) {
            setError("Choose a new image before saving.");
            return;
        }
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const result = await onSave(preview);
            if (result) {
                setError(result);
                return;
            }
            setFileName("");
            setNotice(`${title} updated successfully.`);
        }
        catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : `${title} could not be saved. The selected image is still available to retry.`);
        }
        finally {
            setBusy(false);
        }
    }
    async function remove() {
        if (busy)
            return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const result = await onRemove();
            if (result) {
                setError(result);
                return;
            }
            setPreview("");
            setFileName("");
            setConfirmRemove(false);
            setNotice(`${title} removed successfully.`);
        }
        catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : `${title} could not be removed. No success was recorded.`);
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="panel media-asset-editor">
    <div className="panel-heading"><div><h2>{title}</h2><p>{description}</p></div></div>
    <div className="media-asset-body">
      <div className={`media-asset-preview ${circular ? "is-circular" : ""}`}>{preview ? <img src={preview} alt={`${title} preview`}/> : <ImagePlus size={31} aria-hidden="true"/>}</div>
      <div className="media-asset-actions"><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => chooseFile(event.target.files?.[0])}/><button type="button" className="secondary-button" disabled={busy} onClick={() => inputRef.current?.click()}><Upload size={16}/> {value ? "Replace image" : "Choose image"}</button>{preview && preview !== value && <button type="button" className="primary-button" disabled={busy} onClick={save}>{busy ? "Uploading…" : saveLabel}</button>}{value && <button type="button" className="danger-button" disabled={busy} onClick={() => setConfirmRemove(true)}><Trash2 size={16}/> Remove</button>}<small>{fileName || "PNG, JPEG, WebP or SVG · maximum 2 MB"}</small></div>
    </div>
    {notice && <p className="form-success-message" role="status">✓ {notice}</p>}{error && <p className="form-error-message" role="alert">{error}</p>}
    <ConfirmDialog open={confirmRemove} title={`Remove ${title.toLowerCase()}?`} confirmLabel={`Remove ${title}`} destructive busy={busy} error={error} onCancel={() => setConfirmRemove(false)} onConfirm={remove}><p>The record will remain. Only the current image will be removed. Published historical report snapshots will not change.</p></ConfirmDialog>
  </section>;
}
