import { BookOpen, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
import type { PersistentClass } from "./PersistentClassSetup";
import { useNcdcCurriculum } from "./NcdcCurriculum";

export function NcdcClassCurriculumSection({ record, reload, editing = false, onCancel, onSaved }: { record: PersistentClass; reload: () => Promise<unknown>; editing?: boolean; onCancel?: () => void; onSaved?: (message: string) => void }) {
  const context = useSchoolContext();
  const availableTerms = context.terms.filter(item => item.academicYearId === record.academicYearId);
  const termId = availableTerms.some(item => item.id === context.termId)
    ? context.termId
    : availableTerms.find(item => item.status === "OPEN")?.id ?? availableTerms[0]?.id ?? "";
  const curriculum = useNcdcCurriculum(record.academicYearId, record.level, termId);
  const [electiveIds, setElectiveIds] = useState<string[]>([]);
  const [savedElectiveIds, setSavedElectiveIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [menuUnavailable, setMenuUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmActivate, setConfirmActivate] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const actionAttempted = useRef(false);
  const client = supabase as any;
  const subjects = curriculum.data?.subjects ?? [];
  const required = subjects.filter(item => item.requirement === "CORE" || item.requirement === "RELIGION_OPTION");
  const electives = subjects.filter(item => item.requirement === "ELECTIVE" && item.available && item.offeringId);
  const missingRequired = required.some(item => item.requirement === "CORE" && !item.available)
    || (record.level <= 2 && !required.some(item => item.requirement === "RELIGION_OPTION" && item.available));
  const migrationUnavailable = menuUnavailable || /not been deployed yet|schema cache|PGRST202/i.test(curriculum.error);
  const canActivate = !migrationUnavailable && !missingRequired && electiveIds.length > 0 && record.streams.length > 0;

  useEffect(() => {
    let cancelled = false;
    if (!client) {
      setError("Supabase is not configured. The elective menu cannot be loaded.");
      setMenuLoaded(true);
      return () => { cancelled = true; };
    }
    void client.rpc("get_o_level_class_elective_menu", { p_class_id: record.id }).then((result: { data: string[] | null; error: { message: string } | null }) => {
      if (cancelled) return;
      if (result.error) {
        const missingRpc = /get_o_level_class_elective_menu|schema cache|PGRST202/i.test(result.error.message);
        setMenuUnavailable(missingRpc);
        setError(missingRpc
          ? "The linked Supabase database is missing the O-Level curriculum migration. No class changes were saved. Apply the pending NCDC curriculum migration, then refresh this page."
          : result.error.message);
      }
      else { setElectiveIds(result.data ?? []); setSavedElectiveIds(result.data ?? []); }
      setMenuLoaded(true);
    }).catch((loadError: unknown) => {
      if (cancelled) return;
      setError(loadError instanceof Error ? `Elective menu could not be loaded: ${loadError.message}` : "Elective menu could not be loaded. Check the connection and retry.");
      setMenuLoaded(true);
    });
    return () => { cancelled = true; };
  }, [record.id]);

  useEffect(() => {
    if (actionAttempted.current && (error || notice)) feedbackRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [error, notice]);

  async function run(action: "sync" | "electives" | "activate") {
    if (busy) return;
    actionAttempted.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = action === "sync"
        ? await client.rpc("sync_o_level_class_curriculum", { p_class_id: record.id })
        : action === "electives"
          ? await client.rpc("set_o_level_class_electives", { p_class_id: record.id, p_offering_ids: electiveIds })
          : await client.rpc("finalize_o_level_class", { p_class_id: record.id });
      if (result.error) throw new Error(result.error.message);
      if (action === "activate") setConfirmActivate(false);
      if (action === "electives") {
        const savedMenu = await client.rpc("get_o_level_class_elective_menu", { p_class_id: record.id });
        if (savedMenu.error || !Array.isArray(savedMenu.data)) {
          throw new Error(`Supabase accepted the elective menu, but its saved state could not be read back. Do not submit again; refresh and inspect the class. ${savedMenu.error?.message ?? ""}`);
        }
        const expected = [...electiveIds].sort();
        const actual = [...savedMenu.data].sort();
        if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
          throw new Error("Supabase accepted the elective menu, but the saved selection differs from this form. Refresh and inspect the class before trying again.");
        }
        setSavedElectiveIds(savedMenu.data);
      }
      const refreshed = await reload();
      const refreshConfirmed = refreshed === true || (typeof refreshed === "object" && refreshed !== null && "ok" in refreshed && refreshed.ok === true);
      if (!refreshConfirmed) {
        setError(`Supabase accepted the ${action === "sync" ? "required-subject sync" : action === "electives" ? "elective menu" : "class activation"}, but the class view could not refresh. Do not submit again; refresh and inspect the saved class.`);
      } else {
        const message = action === "sync" ? "Required NCDC subjects are connected to this class."
          : action === "electives" ? "Class elective menu saved and confirmed."
            : "Curriculum checks passed and the class is active.";
        if (onSaved) onSaved(message); else setNotice(message);
      }
    } catch (actionError) {
      if (action === "activate") setConfirmActivate(false);
      setError(actionError instanceof Error ? actionError.message : "The class action was not confirmed. Check the connection and retry.");
    } finally { setBusy(false); }
  }

  return <section id="class-subject-offerings" className="panel class-section-panel"><div className="panel-heading"><div><h2>NCDC Lower Secondary curriculum</h2><p>Required subjects and learner choices follow the class level.</p></div><span className={`class-status class-status-${record.status.toLowerCase()}`}>{record.status}</span></div>
    <div ref={feedbackRef}>{error && <p className="form-error-message" role="alert">{error}</p>}{notice && <p className="form-success-message" role="status"><CheckCircle2 size={18} aria-hidden="true" />{notice}</p>}</div>
    {!migrationUnavailable && curriculum.error && <p className="ncdc-curriculum-warning">{curriculum.error}</p>}
    {!migrationUnavailable && <div className="ncdc-subject-list">{required.map(item => <article key={item.systemSubjectId} className={item.available ? "" : "ncdc-subject-missing"}><BookOpen size={18}/><div><strong>{item.code} · {item.name}</strong><small>{item.requirement === "CORE" ? "Compulsory curriculum" : "CRE or IRE religious education"}</small></div><span>{item.requirement === "CORE" ? "Required" : "Required choice"}</span><span>{item.available ? "Offering active" : "Needs activation"}{item.requirement === "CORE" && ` · ${item.teacherAssigned ? "Teacher assigned" : "No teacher allocated"}`}</span>{!item.available ? <Link to={`/school/o-level/subjects?search=${encodeURIComponent(item.code)}`}>Activate</Link> : <span aria-hidden="true">—</span>}</article>)}</div>}
    {!migrationUnavailable && record.level <= 2 && !required.some(item => item.requirement === "RELIGION_OPTION" && item.available) && <p className="ncdc-curriculum-warning">Activate CRE or IRE to meet the Senior 1–2 religious education requirement.</p>}
    {!migrationUnavailable && (editing ? <div className="ncdc-elective-grid class-ncdc-elective-grid">{electives.map(item => <label key={item.offeringId}><input type="checkbox" checked={electiveIds.includes(item.offeringId!)} onChange={() => setElectiveIds(current => current.includes(item.offeringId!) ? current.filter(id => id !== item.offeringId) : [...current, item.offeringId!])} /><span><strong>{item.code} · {item.name}</strong><small>{item.category?.replaceAll("_", " ") ?? "Elective"}</small></span></label>)}{!electives.length && <p>No active electives are available. Activate them in <Link to="/school/o-level/subjects">Subjects &amp; Offerings</Link>.</p>}</div> : <div className="ncdc-elective-grid class-ncdc-elective-grid">{!menuLoaded ? <p>Loading class elective offerings…</p> : record.subjects.filter(item => savedElectiveIds.includes(item.id)).length ? record.subjects.filter(item => savedElectiveIds.includes(item.id)).map(item => <article key={item.id} className="class-offering-readonly"><strong>{item.code} · {item.name}</strong><small>Offered to this class</small></article>) : <p>No electives are offered to this class yet. Choose Edit Subject Offerings to add them.</p>}</div>)}
    {editing && <div className="form-actions class-ncdc-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => { setElectiveIds(savedElectiveIds); setError(""); onCancel?.(); }}>Cancel</button><button type="button" className="secondary-button" disabled={busy || curriculum.loading || Boolean(curriculum.error) || !curriculum.data || migrationUnavailable} onClick={() => void run("sync")}>{busy ? "Saving…" : "Sync required subjects"}</button><button type="button" className="primary-button" disabled={busy || !menuLoaded || !electiveIds.length || migrationUnavailable} onClick={() => void run("electives")}>{busy ? "Saving…" : `Save subject offerings (${electiveIds.length})`}</button>{record.status!=="ACTIVE"&&<button type="button" className="secondary-button" disabled={busy || curriculum.loading || !curriculum.data || !canActivate || Boolean(curriculum.error) || migrationUnavailable} onClick={() => setConfirmActivate(true)}>Validate and activate class</button>}</div>}
    <ConfirmDialog open={confirmActivate} title={`Activate ${record.name}?`} description="Only proceed after checking the required subjects and elective menu." confirmLabel="Validate and activate" busy={busy} error={error} impact="The class will become active for learner enrolment and connected academic workflows." preserved="Existing class records, enrolments, and academic history are preserved." onCancel={() => { if (!busy) setConfirmActivate(false); }} onConfirm={() => void run("activate")}><p>Supabase will validate the curriculum rules and activate this class only if the required subjects and school setup are complete.</p></ConfirmDialog>
  </section>;
}
