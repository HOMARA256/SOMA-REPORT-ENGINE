import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

type DialogOptions = { title: string; message: string; confirmLabel?: string; cancelLabel?: string; placeholder?: string; initialValue?: string; multiline?: boolean };
type DialogRequest = { kind: "alert" | "confirm" | "prompt"; options: DialogOptions; resolve: (value: boolean | string | null) => void; restoreFocus?: HTMLElement | null };
type DialogApi = { alert: (options: DialogOptions) => Promise<void>; confirm: (options: DialogOptions) => Promise<boolean>; prompt: (options: DialogOptions) => Promise<string | null> };
const DialogContext = createContext<DialogApi | null>(null);

export function useSystemDialogs() {
  const value = useContext(DialogContext);
  if (!value) throw new Error("useSystemDialogs must be used inside SystemDialogsProvider.");
  return value;
}

export function SystemDialogsProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<DialogRequest | null>(null);
  const [input, setInput] = useState("");
  const queue = useRef<DialogRequest[]>([]);
  const activeRef = useRef<DialogRequest | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const enqueue = useCallback((kind: DialogRequest["kind"], options: DialogOptions) => new Promise<boolean | string | null>((resolve) => {
    const request: DialogRequest = { kind, options, resolve, restoreFocus: activeRef.current?.restoreFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null) };
    if (activeRef.current) queue.current.push(request);
    else { activeRef.current = request; setInput(options.initialValue ?? ""); setActive(request); }
  }), []);
  const alert = useCallback(async (options: DialogOptions) => { await enqueue("alert", options); }, [enqueue]);
  const confirm = useCallback(async (options: DialogOptions) => (await enqueue("confirm", options)) === true, [enqueue]);
  const prompt = useCallback(async (options: DialogOptions) => { const result = await enqueue("prompt", options); return typeof result === "string" ? result : null; }, [enqueue]);

  const finish = useCallback((result: boolean | string | null) => {
    const current = activeRef.current;
    if (!current) return;
    current.resolve(result);
    const next = queue.current.shift() ?? null;
    activeRef.current = next;
    if (next) setInput(next.options.initialValue ?? "");
    setActive(next);
    requestAnimationFrame(() => (next?.kind === "prompt" ? inputRef.current : primaryRef.current)?.focus());
    if (!next) requestAnimationFrame(() => current.restoreFocus?.focus());
  }, []);

  useEffect(() => {
    if (!active) return;
    (active.kind === "prompt" ? inputRef.current : primaryRef.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); finish(active.kind === "confirm" ? false : null); }
      if (event.key !== "Tab") return;
      const root = document.querySelector<HTMLElement>(".system-dialog");
      const focusable = Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)') ?? []);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, finish]);

  const submit = (event: FormEvent) => { event.preventDefault(); if (active?.kind === "prompt") finish(input); else finish(true); };
  const api: DialogApi = { alert, confirm, prompt };
  return <DialogContext.Provider value={api}>
    {children}
    {active && <div className="system-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(active.kind === "confirm" ? false : null); }}>
      <section className="system-dialog" role={active.kind === "prompt" ? "dialog" : "alertdialog"} aria-modal="true" aria-labelledby="system-dialog-title" aria-describedby="system-dialog-message">
        <form onSubmit={submit}>
          <div className="system-dialog__heading"><span className="eyebrow">SOMA REPORT ENGINE</span><h2 id="system-dialog-title">{active.options.title}</h2></div>
          <p id="system-dialog-message">{active.options.message}</p>
          {active.kind === "prompt" && (active.options.multiline
            ? <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} value={input} onChange={(event) => setInput(event.target.value)} placeholder={active.options.placeholder} rows={4} />
            : <input ref={inputRef as React.RefObject<HTMLInputElement>} value={input} onChange={(event) => setInput(event.target.value)} placeholder={active.options.placeholder} />)}
          <div className="system-dialog__actions">
            {active.kind !== "alert" && <button type="button" className="button button--secondary" onClick={() => finish(active.kind === "confirm" ? false : null)}>{active.options.cancelLabel ?? "Cancel"}</button>}
            <button ref={primaryRef} type="submit" className="button button--primary">{active.options.confirmLabel ?? (active.kind === "alert" ? "OK" : "Continue")}</button>
          </div>
        </form>
      </section>
    </div>}
  </DialogContext.Provider>;
}
