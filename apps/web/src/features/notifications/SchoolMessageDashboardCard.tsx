import { ArrowRight, MessageCircleMore } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";

type Recent = { id: string; participantName: string; subject: string; latestPreview: string; updatedAt: string; unread: boolean };

export function SchoolMessageDashboardCard() {
  const school = useSchoolContext();
  const [items, setItems] = useState<Recent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!supabase || !school.schoolId) { setItems([]); setLoading(false); return; }
    const { data, error: readError } = await (supabase as any).rpc("get_school_teacher_message_centre", { p_school_id: school.schoolId });
    if (version !== requestVersion.current) return;
    if (readError) { setError(readError.message); setItems([]); }
    else { setError(""); setItems(Array.isArray(data) ? data : []); }
    setLoading(false);
  }, [school.schoolId]);
  useEffect(() => {
    setLoading(true); setItems([]); void refresh();
    const onUpdated = () => void refresh();
    const timer = window.setInterval(onUpdated, 30_000);
    window.addEventListener("focus", onUpdated);
    window.addEventListener("soma-notifications-updated", onUpdated);
    return () => { requestVersion.current++; window.clearInterval(timer); window.removeEventListener("focus", onUpdated); window.removeEventListener("soma-notifications-updated", onUpdated); };
  }, [refresh]);
  const unread = items.filter(item => item.unread).length;
  return <section className="panel school-message-dashboard-card" aria-label="School staff messages">
    <div className="panel-heading"><div><h2>School staff messages</h2><p>{loading ? "Loading conversations…" : `${unread} unread conversation${unread === 1 ? "" : "s"} in ${school.schoolName}`}</p></div><Link className="secondary-button" to="/messages?view=school">Open messages <ArrowRight size={17}/></Link></div>
    {error ? <p className="form-error-message" role="alert">Messages could not load. <button className="text-button" type="button" onClick={() => void refresh()}>Retry</button></p>
      : !loading && !items.length ? <p className="school-message-dashboard-empty"><MessageCircleMore size={20}/>No staff conversations yet.</p>
      : <div className="school-message-dashboard-list">{items.slice(0, 3).map(item => <Link key={item.id} to={`/messages?view=school&school=${encodeURIComponent(school.schoolId)}&conversation=${encodeURIComponent(item.id)}`} className={item.unread ? "is-unread" : ""}><strong>{item.participantName} · {item.subject}</strong><span>{item.latestPreview}</span></Link>)}</div>}
  </section>;
}
