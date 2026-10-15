import { Plus, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { supabase } from "../../config/supabaseClient";
import type { PersistentClass, SetupStaff } from "./PersistentClassSetup";

type Props = {
  record: PersistentClass;
  staff: SetupStaff[];
  reload: () => Promise<{ ok: true } | { ok: false; error: string }>;
  createStream: (classId: string, name: string, capacity: number | null) => Promise<string | null>;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onRefreshError: (message: string) => void;
};

export function OLevelClassEditor({ record, staff, reload, createStream, onCancel, onSaved, onRefreshError }: Props) {
  const [name, setName] = useState(record.name);
  const [capacity, setCapacity] = useState(record.capacity?.toString() ?? "");
  const [teacherId, setTeacherId] = useState(record.classTeacherUserId ?? "");
  const [streamName, setStreamName] = useState("");
  const [streamCapacity, setStreamCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [streamError, setStreamError] = useState("");

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const className = name.trim();
    const classCapacity = capacity ? Number(capacity) : null;
    if (!className || className.length > 100) { setDetailsError("Enter a class name of 1 to 100 characters."); return; }
    if (classCapacity !== null && (!Number.isInteger(classCapacity) || classCapacity < 1)) { setDetailsError("Capacity must be a positive whole number."); return; }
    if (!supabase) { setDetailsError("Supabase is unavailable. No class changes were saved."); return; }
    setBusy(true);
    setDetailsError("");
    try {
      const result = await (supabase as any).rpc("update_o_level_class_details", {
        p_class_id: record.id,
        p_class_name: className,
        p_capacity: classCapacity,
        p_class_teacher_user_id: teacherId || null,
      });
      if (result.error) throw new Error(result.error.message);
      const saved = result.data;
      if (!saved || saved.id !== record.id || saved.name !== className
        || saved.capacity !== classCapacity || saved.classTeacherUserId !== (teacherId || null)) {
        throw new Error("The database accepted the edit, but did not confirm all class details. Review this class before saving again.");
      }
      onSaved("Class details saved. Updating the class overview…");
      const refreshed = await reload();
      if (refreshed.ok) onSaved("Class details saved and confirmed.");
      else onRefreshError(`Class details were saved, but the overview could not refresh: ${refreshed.error}. Refresh this page before editing again.`);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Class changes could not be confirmed.";
      setDetailsError(/PGRST202|schema cache|update_o_level_class_details/i.test(message)
        ? "The class editing database update has not been deployed yet. No changes were saved. Apply the pending migration and refresh this page."
        : message);
    } finally { setBusy(false); }
  }

  async function addStream(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const newName = streamName.trim();
    const newCapacity = streamCapacity ? Number(streamCapacity) : null;
    if (!newName) { setStreamError("Enter a stream name."); return; }
    if (newCapacity !== null && (!Number.isInteger(newCapacity) || newCapacity < 1)) { setStreamError("Stream capacity must be a positive whole number."); return; }
    setBusy(true);
    setStreamError("");
    const failure = await createStream(record.id, newName, newCapacity);
    setBusy(false);
    if (failure) { setStreamError(failure); return; }
    onSaved(`Stream ${newName} saved to this class.`);
  }

  return <section id="class-editor" className="panel class-section-panel class-edit-panel" aria-label="Edit class">
    <div className="panel-heading"><div><h2>Edit class</h2><p>Update the class name, capacity, or class teacher. Its academic year, level, and existing learner records stay unchanged.</p></div></div>
    <form onSubmit={saveDetails}>
      <div className="form-grid">
        <label className="form-field"><span>Class name</span><input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="form-field"><span>Capacity</span><input type="number" min="1" value={capacity} onChange={event => setCapacity(event.target.value)} placeholder="Not set" /></label>
        <label className="form-field"><span>Class teacher</span><select value={teacherId} onChange={event => setTeacherId(event.target.value)}><option value="">Not assigned</option>{staff.filter(item => ["TEACHER", "HEAD_TEACHER", "DEPUTY_HEAD_TEACHER", "DIRECTOR_OF_STUDIES", "SCHOOL_ADMIN"].includes(item.role)).map(item => <option key={item.userId} value={item.userId}>{item.name} · {item.role.replaceAll("_", " ")}</option>)}</select></label>
      </div>
      {detailsError && <p className="form-error" role="alert">{detailsError}</p>}
      <div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="primary-button" disabled={busy}><Save size={17} aria-hidden="true" />{busy ? "Saving…" : "Save class changes"}</button></div>
    </form>
    <div className="class-edit-stream-divider" />
    <h3>Add stream</h3>
    <p className="class-edit-helper">Existing streams stay in the class. Add a new one here when needed.</p>
    <form className="class-stream-form class-stream-form-simple" onSubmit={addStream}>
      <label><span>Stream name</span><input required value={streamName} onChange={event => setStreamName(event.target.value)} placeholder="e.g. B" /></label>
      <label><span>Capacity</span><input type="number" min="1" value={streamCapacity} onChange={event => setStreamCapacity(event.target.value)} placeholder="Optional" /></label>
      <button className="secondary-button" type="submit" disabled={busy}><Plus size={16} aria-hidden="true" />{busy ? "Saving…" : "Add stream"}</button>
    </form>
    {streamError && <p className="form-error" role="alert">{streamError}</p>}
  </section>;
}
