import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = "Cancel", destructive = false, busy = false, confirmDisabled = false, error, description = "Review this action before continuing.", currentState, nextState, impact, preserved, reversible, destination, secondaryLabel, onSecondary, onConfirm, onCancel }) {
    const cancelRef = useRef(null);
    const dialogRef = useRef(null);
    const previouslyFocused = useRef(null);
    const busyRef = useRef(busy);
    useEffect(() => {
        busyRef.current = busy;
    }, [busy]);
    useEffect(() => {
        if (!open)
            return;
        previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());
        const closeOnEscape = (event) => {
            if (event.key === "Escape" && !busyRef.current)
                onCancel();
        };
        const keepFocusInDialog = (event) => {
            if (event.key !== "Tab" || !dialogRef.current)
                return;
            const focusable = Array.from(dialogRef.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
            if (!focusable.length)
                return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
            if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener("keydown", closeOnEscape);
        window.addEventListener("keydown", keepFocusInDialog);
        return () => { window.cancelAnimationFrame(frame); window.removeEventListener("keydown", closeOnEscape); window.removeEventListener("keydown", keepFocusInDialog); previouslyFocused.current?.focus(); };
    }, [onCancel, open]);
    if (!open)
        return null;
    return <div className="action-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy)
        onCancel(); }}>
    <section ref={dialogRef} className="action-dialog" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title">
      <header><span className={destructive ? "action-dialog-icon destructive" : "action-dialog-icon"}><AlertTriangle size={20} aria-hidden="true"/></span><div><h2 id="action-dialog-title">{title}</h2><p>{description}</p></div><button type="button" className="icon-button" aria-label="Close confirmation" disabled={busy} onClick={onCancel}><X size={18}/></button></header>
      <div className="action-dialog-content">{(currentState || nextState || impact || preserved || reversible !== undefined || destination) && <dl className="action-impact-summary">{currentState && <div><dt>Current state</dt><dd>{currentState}</dd></div>}{nextState && <div><dt>After completion</dt><dd>{nextState}</dd></div>}{impact && <div><dt>Expected change</dt><dd>{impact}</dd></div>}{preserved && <div><dt>Data preserved</dt><dd>{preserved}</dd></div>}{reversible !== undefined && <div><dt>Can be undone</dt><dd>{reversible ? "Yes, while the record remains eligible" : "No"}</dd></div>}{destination && <div><dt>Next destination</dt><dd>{destination}</dd></div>}</dl>}{children}{error && <p className="form-error-message" role="alert">{error}</p>}</div>
      <footer><button ref={cancelRef} type="button" className="secondary-button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>{secondaryLabel && onSecondary && <button type="button" className="secondary-button" disabled={busy} onClick={onSecondary}>{secondaryLabel}</button>}<button type="button" className={destructive ? "danger-button" : "primary-button"} disabled={busy || confirmDisabled} onClick={onConfirm}>{busy ? "Processing…" : confirmLabel}</button></footer>
    </section>
  </div>;
}
