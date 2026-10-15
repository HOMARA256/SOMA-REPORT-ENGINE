import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "./common/ConfirmDialog";
export function DeleteRecordButton({ label, onDelete, onDeleted }) {
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    async function confirmDelete() {
        if (busy)
            return;
        setBusy(true);
        setError("");
        try {
            const result = await onDelete();
            if (typeof result === "string" && result) {
                setError(result);
                return;
            }
            setConfirming(false);
            await onDeleted?.();
        }
        catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "The record could not be deleted. No success was recorded.");
        }
        finally {
            setBusy(false);
        }
    }
    return <div className="delete-record-control">
    <button type="button" className="delete-record-trigger" aria-label={`Delete ${label}`} onClick={() => { setConfirming(true); setError(""); }}><Trash2 size={16} aria-hidden="true"/> Delete</button>
    {error && <span className="delete-record-error" role="alert">{error}</span>}
    <ConfirmDialog open={confirming} title={`Delete ${label}?`} description="Only eligible records without protected history can be permanently removed." confirmLabel={`Delete ${label}`} destructive busy={busy} error={error} onConfirm={() => void confirmDelete()} onCancel={() => { if (!busy) {
        setConfirming(false);
        setError("");
    } }}><p><strong>{label}</strong> will be removed only if the backend confirms that it has no protected academic or billing history. Otherwise the record must be archived or deactivated.</p></ConfirmDialog>
  </div>;
}
