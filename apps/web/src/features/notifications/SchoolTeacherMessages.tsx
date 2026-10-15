import { ArrowLeft, Archive, Bell, MessageCircleMore, Plus, RefreshCw, Search, Send } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { currentUser } from "../../config/currentUser";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";

type Recipient = { authUserId: string; name: string };
type Conversation = { id: string; schoolId: string; schoolName: string; teacherAuthUserId: string; participantName: string; subject: string; category: string; latestPreview: string; updatedAt: string; unread: boolean };
type Thread = { conversation: { id: string; schoolId: string; subject: string; category: string; participantName: string }; messages: { id: string; senderAuthUserId: string; senderName: string; body: string; sentAt: string }[] };
const categories = ["TEACHING_ALLOCATION", "TIMETABLE", "ASSESSMENT", "LEARNER_SUPPORT", "GENERAL_ADMINISTRATION"];
const human = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
const when = (value: string) => new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function SchoolTeacherMessages() {
  const school = useSchoolContext();
  const [params, setParams] = useSearchParams();
  const requestedSchool = params.get("school") ?? "";
  const selectedId = params.get("conversation") ?? "";
  const admin = currentUser.role === "SCHOOL_ADMIN";
  const [items, setItems] = useState<Conversation[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [identity, setIdentity] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [subject, setSubject] = useState("");
  const [openingBody, setOpeningBody] = useState("");
  const [reply, setReply] = useState("");
  const createKeys = useRef<{ request: string; message: string } | null>(null);
  const replyKey = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const previousSchool = useRef("");
  const timeline = useRef<HTMLDivElement>(null);
  const client = supabase as any;
  const matchingSchool = Boolean(school.schoolId && (!requestedSchool || requestedSchool === school.schoolId));

  useEffect(() => {
    if (!requestedSchool || requestedSchool === school.schoolId || school.loading) return;
    if (school.schools.some(item => item.schoolId === requestedSchool)) school.selectSchool(requestedSchool);
  }, [requestedSchool, school.schoolId, school.loading, school.schools, school.selectSchool]);
  useEffect(() => {
    if (!school.schoolId) return;
    if (previousSchool.current && previousSchool.current !== school.schoolId) {
      setThread(null); setItems([]); setRecipients([]); setComposing(false); setReply(""); setError("");
      if (requestedSchool !== school.schoolId) setParams({ view: "school", school: school.schoolId });
    }
    previousSchool.current = school.schoolId;
  }, [school.schoolId, requestedSchool, setParams]);
  useEffect(() => {
    let active = true;
    void client?.auth.getUser().then(({ data }: any) => { if (active) setIdentity(data?.user?.id ?? ""); });
    return () => { active = false; };
  }, [client]);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!client || !matchingSchool) { setLoading(false); return; }
    setLoading(true);
    const [list, people] = await Promise.all([
      client.rpc("get_school_teacher_message_centre", { p_school_id: school.schoolId }),
      client.rpc("list_school_teacher_message_recipients", { p_school_id: school.schoolId }),
    ]);
    if (version !== requestVersion.current) return;
    if (list.error || people.error) { setError(list.error?.message ?? people.error?.message ?? "Could not load school messages."); setItems([]); setRecipients([]); }
    else { setItems(Array.isArray(list.data) ? list.data : []); setRecipients(Array.isArray(people.data) ? people.data : []); setError(""); }
    setLoading(false);
  }, [client, matchingSchool, school.schoolId]);
  useEffect(() => { void load(); }, [load]);

  const loadThread = useCallback(async (id: string) => {
    if (!client || !matchingSchool || !id) return;
    const schoolAtRequest = school.schoolId;
    const { data, error: loadError } = await client.rpc("get_school_teacher_conversation", { p_school_id: schoolAtRequest, p_conversation_id: id });
    if (schoolAtRequest !== previousSchool.current) return;
    if (loadError) { setError(loadError.message); setThread(null); return; }
    setThread(data as Thread); setError("");
    window.dispatchEvent(new Event("soma-notifications-updated"));
    void load();
  }, [client, matchingSchool, school.schoolId, load]);
  useEffect(() => { if (selectedId && matchingSchool) void loadThread(selectedId); else setThread(null); }, [selectedId, matchingSchool, loadThread]);
  useEffect(() => { if (timeline.current) timeline.current.scrollTop = timeline.current.scrollHeight; }, [thread]);

  function choose(id: string) { setComposing(false); setParams({ view: "school", school: school.schoolId, conversation: id }); }
  function back() { setComposing(false); setParams({ view: "school", school: school.schoolId }); }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !client || !matchingSchool || !subject.trim() || !openingBody.trim() || (admin && !teacherId)) return;
    setBusy(true); setError(""); setNotice("");
    createKeys.current ??= { request: crypto.randomUUID(), message: crypto.randomUUID() };
    const { data, error: saveError } = await client.rpc("create_school_teacher_conversation", {
      p_school_id: school.schoolId, p_teacher_auth_user_id: admin ? teacherId : null,
      p_category: category, p_subject: subject.trim(), p_body: openingBody.trim(),
      p_request_key: createKeys.current.request, p_message_key: createKeys.current.message,
    });
    setBusy(false);
    if (saveError) { setError(`Conversation was not confirmed saved: ${saveError.message}. Your draft is retained; retry safely.`); return; }
    createKeys.current = null; setSubject(""); setOpeningBody(""); setTeacherId(""); setComposing(false);
    setNotice("Message saved. Recipient notification is queued for delivery.");
    choose(String(data)); void load();
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy || !client || !thread || !reply.trim() || !matchingSchool) return;
    setBusy(true); setError(""); setNotice("");
    replyKey.current ??= crypto.randomUUID();
    const { error: saveError } = await client.rpc("post_school_teacher_message", {
      p_school_id: school.schoolId, p_conversation_id: thread.conversation.id,
      p_body: reply.trim(), p_message_key: replyKey.current,
    });
    setBusy(false);
    if (saveError) { setError(`Reply was not confirmed saved: ${saveError.message}. Your draft is retained; retry safely.`); return; }
    replyKey.current = null; setReply(""); setNotice("Reply saved. Recipient notification is queued for delivery.");
    void loadThread(thread.conversation.id);
  }
  async function archive() {
    if (busy || !client || !thread) return;
    setBusy(true); setError("");
    const { error: archiveError } = await client.rpc("archive_school_teacher_conversation", { p_school_id: school.schoolId, p_conversation_id: thread.conversation.id });
    setBusy(false);
    if (archiveError) { setError(archiveError.message); return; }
    back(); void load();
  }
  const visible = items.filter(item => `${item.participantName} ${item.schoolName} ${item.subject} ${item.latestPreview}`.toLowerCase().includes(query.toLowerCase()));
  const noAccess = requestedSchool && !school.loading && !school.schools.some(item => item.schoolId === requestedSchool);
  return <div className={`message-centre-page school-teacher-centre ${selectedId || composing ? "has-selected-conversation" : ""}`}>
    <header className="page-heading"><div><span className="eyebrow">{school.schoolName || "SCHOOL"} · MESSAGE CENTRE</span><h1>School staff messages</h1><p>{admin ? "Speak directly with active teachers in this school." : "Speak directly with this school’s administrators."}</p></div>
      <div className="session-row-actions">{admin && <Link className="secondary-button" to="/messages"><MessageCircleMore size={17}/>Platform Support</Link>}<Link className="secondary-button" to="/notifications"><Bell size={17}/>Notifications</Link><button className="secondary-button" type="button" onClick={() => void load()} disabled={!matchingSchool}><RefreshCw size={17}/>Refresh</button></div></header>
    {noAccess && <div className="form-error-message" role="alert">You do not have an active membership at the school linked from this notification.</div>}
    {error && <div className="form-error-message" role="alert">{error}</div>}
    {notice && <div className="form-success-message" role="status">{notice}</div>}
    {!noAccess && !matchingSchool ? <section className="panel" aria-busy="true">Switching to the conversation’s school…</section> : !noAccess && <div className="message-centre-layout">
      <section className="panel message-conversation-list" aria-label="School staff conversations">
        <div className="panel-heading"><div><h2>Conversations</h2><p>{loading ? "Loading…" : `${items.filter(item => item.unread).length} unread · ${items.length} total`}</p></div><button className="primary-button" type="button" onClick={() => { setComposing(true); setError(""); }}><Plus size={17}/>New</button></div>
        <label className="school-message-search"><Search size={17}/><span className="sr-only">Search conversations</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search messages"/></label>
        {loading && <p className="message-empty" role="status">Loading conversations…</p>}
        {!loading && visible.map(item => <button type="button" key={item.id} className={`message-conversation-card ${item.id === selectedId ? "is-selected" : ""} ${item.unread ? "is-unread" : ""}`} onClick={() => choose(item.id)} aria-current={item.id === selectedId ? "true" : undefined}>
          <span className="message-conversation-copy"><strong>{item.participantName}</strong><small>{item.schoolName} · {human(item.category)}</small><strong>{item.subject}</strong><p>{item.latestPreview || "No message preview"}</p><span className="message-conversation-meta"><time dateTime={item.updatedAt}>{when(item.updatedAt)}</time></span></span>{item.unread && <span className="message-unread-badge">Unread</span>}
        </button>)}
        {!loading && !visible.length && <div className="message-empty">{query ? "No conversations match your search." : "No staff conversations yet. Start one to reach your school team."}</div>}
      </section>
      <section className="panel message-thread" aria-label="School staff conversation">
        {composing ? <form className="school-message-new" onSubmit={event => void create(event)}><div className="message-thread-header"><button className="secondary-button message-mobile-back" type="button" onClick={back}><ArrowLeft size={17}/>Back</button><div className="message-thread-title"><h2>New conversation</h2><small>{school.schoolName}</small></div></div>
          <div className="school-message-fields">{admin && <label className="form-field"><span>Teacher</span><select required value={teacherId} onChange={event => { setTeacherId(event.target.value); createKeys.current = null; }}><option value="">Choose an active teacher</option>{recipients.map(person => <option value={person.authUserId} key={person.authUserId}>{person.name}</option>)}</select></label>}
            {!admin && <p className="form-info-message">This conversation goes to the active School Administrators for {school.schoolName}.</p>}
            <label className="form-field"><span>Subject</span><input required minLength={3} maxLength={180} value={subject} onChange={event => { setSubject(event.target.value); createKeys.current = null; }} placeholder="What is this about?"/></label>
            <label className="form-field"><span>Category</span><select value={category} onChange={event => { setCategory(event.target.value); createKeys.current = null; }}>{categories.map(value => <option value={value} key={value}>{human(value)}</option>)}</select></label>
            <label className="form-field"><span>Message</span><textarea required maxLength={5000} value={openingBody} onChange={event => { setOpeningBody(event.target.value); createKeys.current = null; }} placeholder="Write your message…"/></label>
            <div className="school-message-form-actions"><button type="button" className="secondary-button" onClick={() => setComposing(false)}>Cancel</button><button className="primary-button" type="submit" disabled={busy || !openingBody.trim() || !subject.trim() || (admin && !teacherId)}><Send size={17}/>{busy ? "Saving…" : "Send message"}</button></div><small>Cancel closes this form without sending; your draft remains until you leave this page.</small>
          </div></form> : thread ? <><div className="message-thread-header"><button className="secondary-button message-mobile-back" type="button" onClick={back}><ArrowLeft size={17}/>Back</button><div className="message-thread-title"><small>{school.schoolName} · {thread.conversation.participantName}</small><h2>{thread.conversation.subject}</h2><span>{human(thread.conversation.category)}</span></div><button className="secondary-button" type="button" onClick={() => void archive()} disabled={busy}><Archive size={17}/>Archive</button></div>
          <div className="message-thread-items" ref={timeline} aria-live="polite">{thread.messages.map(message => <div className={`message-row ${message.senderAuthUserId === identity ? "message-row-outgoing" : "message-row-incoming"}`} key={message.id}><article className={`message-bubble ${message.senderAuthUserId === identity ? "message-bubble-outgoing" : "message-bubble-incoming"}`}><strong className="message-sender">{message.senderAuthUserId === identity ? "You" : message.senderName}</strong><p>{message.body}</p><small className="message-meta"><time dateTime={message.sentAt}>{when(message.sentAt)}</time></small></article></div>)}</div>
          <form className="message-compose" onSubmit={event => void send(event)}><div className="message-compose-input"><textarea required maxLength={5000} aria-label="Write a reply" placeholder="Write a reply…" value={reply} onChange={event => { setReply(event.target.value); replyKey.current = null; }}/></div><button className="primary-button message-send-button" disabled={busy || !reply.trim()}><Send size={17}/>{busy ? "Saving…" : "Send"}</button></form>
        </> : <div className="message-empty"><MessageCircleMore size={28}/><h2>Select a conversation</h2><p>Choose a thread or start a new message.</p></div>}
      </section>
    </div>}
  </div>;
}
