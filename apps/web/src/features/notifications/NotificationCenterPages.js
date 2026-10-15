import { ArrowLeft, Bell, CheckCheck, CircleAlert, Filter, MessageCircleMore, Paperclip, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { currentUser } from "../../config/currentUser";
import { platformSupabase, supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
import { useSystemDialogs } from "../../components/system/SystemDialogs";
const categories = ["GENERAL_SUPPORT", "SCHOOL_REGISTRATION", "SCHOOL_PROFILE_AND_SETUP", "SUBSCRIPTION_AND_BILLING", "PAYMENT_INITIATION", "PAYMENT_FAILURE", "PAYMENT_REFUND", "SUBJECT_ACTIVATION", "ACADEMIC_SETUP", "CLASS_AND_LEARNER_SETUP", "STAFF_AND_ROLE_SETUP", "IMPORT_OR_EXPORT", "ASSESSMENT_AND_MARKS", "APPROVAL_OR_REPORT", "TECHNICAL_ISSUE", "FEATURE_REQUEST", "PLATFORM_ANNOUNCEMENT"];
const label = (v) => v.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const api = (platform) => platform ? platformSupabase : supabase;
const date = (v) => new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v));
const dayKey = (v) => { const d = new Date(v); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const dayLabel = (v) => { const d = new Date(v); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1); if (dayKey(v) === dayKey(today.toISOString()))
    return "Today"; if (dayKey(v) === dayKey(yesterday.toISOString()))
    return "Yesterday"; return new Intl.DateTimeFormat("en-UG", { day: "numeric", month: "long", year: "numeric" }).format(d); };
const activity = (v) => new Intl.DateTimeFormat("en-UG", { dateStyle: "short", timeStyle: "short" }).format(new Date(v));
function NotificationCenter({ platform = false }) {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const load = useCallback(async () => { const client = api(platform); if (!client) {
        setError("Notifications are not connected.");
        setLoading(false);
        return;
    } setLoading(true); const { data, error: e } = await client.rpc("get_notification_centre", { p_limit: 100 }); if (e)
        setError(e.message);
    else {
        setItems(Array.isArray(data) ? data : []);
        setError("");
    } setLoading(false); }, [platform]);
    useEffect(() => { void load(); }, [load]);
    const mark = async (ids) => { const client = api(platform); if (!client)
        return; const { error: e } = await client.rpc("mark_notification_centre_read", { p_notification_ids: ids }); if (e)
        setError(e.message);
    else {
        window.dispatchEvent(new Event("soma-notifications-updated"));
        void load();
    } };
    const open = async (item) => { if (!item.readAt)
        await mark([item.id]); navigate(item.conversationId ? (platform ? `/platform/messages?conversation=${item.conversationId}` : `/messages?conversation=${item.conversationId}`) : item.actionUrl || (platform ? "/platform/dashboard" : "/dashboard")); };
    const visible = unreadOnly ? items.filter(i => !i.readAt) : items;
    return <div className="notification-centre-page"><header className={platform ? "platform-page-heading" : "page-heading"}><div><span className="eyebrow">{platform ? "PLATFORM OPERATIONS" : "MY ACCOUNT"}</span><h1>Notification Centre</h1><p>One authorised feed for messages, academic work, payments, setup, and system events.</p></div><div className="session-row-actions"><Link className="secondary-button" to={platform ? "/platform/messages" : "/messages"}><MessageCircleMore size={16}/>Messages &amp; Support</Link><button className="secondary-button" type="button" onClick={() => void mark(null)} disabled={!items.some(i => !i.readAt)}><CheckCheck size={16}/>Mark all read</button><button className="secondary-button" type="button" onClick={() => void load()}><RefreshCw size={16}/></button></div></header>{error && <div className="form-error-message" role="alert">Notifications could not load: {error}</div>}<section className="panel notification-controls"><label><Filter size={17}/><input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)}/> Unread only</label><strong>{items.filter(i => !i.readAt).length} unread</strong></section><section className="panel notification-list" aria-busy={loading}>{!loading && !visible.length ? <div className="notification-empty"><Bell size={25}/><h2>No notifications</h2><p>New authorised events appear here.</p></div> : visible.map(item => <button className={`notification-row ${item.readAt ? "" : "is-unread"}`} type="button" key={item.id} onClick={() => void open(item)}><span className="notification-row-icon"><Bell size={17}/></span><span><strong>{item.title}</strong><small>{item.message}</small><em>{label(item.category)} · {date(item.createdAt)}</em></span>{!item.readAt && <i aria-label="Unread"/>}</button>)}</section><section className="notification-security-note"><ShieldCheck size={17}/><p>Opening a notification never bypasses school or platform permissions.</p></section></div>;
}
export function SchoolNotificationCenterPage() { return <NotificationCenter />; }
export function PlatformNotificationCenterPage() { return <NotificationCenter platform/>; }
export function MessageCentrePage({ platform = false }) {
    const dialogs = useSystemDialogs();
    const school = useSchoolContext();
    const [params, setParams] = useSearchParams();
    const [items, setItems] = useState([]);
    const [thread, setThread] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [subject, setSubject] = useState("");
    const [category, setCategory] = useState("GENERAL_SUPPORT");
    const [priority, setPriority] = useState("NORMAL");
    const [body, setBody] = useState("");
    const [reply, setReply] = useState("");
    const [internal, setInternal] = useState(false);
    const [busy, setBusy] = useState(false);
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [categoryFilter, setCategoryFilter] = useState("ALL");
    const [priorityFilter, setPriorityFilter] = useState("ALL");
    const [myAuthUserId, setMyAuthUserId] = useState("");
    const [listWidth, setListWidth] = useState(() => { try {
        const saved = Number(window.localStorage.getItem("soma-message-list-width"));
        return saved >= 22 && saved <= 55 ? saved : 32;
    }
    catch {
        return 32;
    } });
    const timelineRef = useRef(null);
    const layoutRef = useRef(null);
    const schoolId = platform ? (params.get("school") || null) : school.schoolId;
    const selectedId = params.get("conversation");
    const client = api(platform);
    const [schools, setSchools] = useState([]);
    const [assignees, setAssignees] = useState([]);
    const [files, setFiles] = useState([]);
    const load = useCallback(async () => { if (!client || (!platform && !schoolId)) {
        setLoading(false);
        return;
    } setLoading(true); const { data, error: e } = await client.rpc("get_school_platform_message_centre", { p_school_id: schoolId }); if (e) {
        setError(e.message);
        setItems([]);
    }
    else {
        setItems(Array.isArray(data) ? data : []);
        setError("");
    } setLoading(false); }, [client, platform, schoolId]);
    const loadThread = useCallback(async (id) => { if (!client)
        return; const { data, error: e } = await client.rpc("get_school_platform_conversation", { p_conversation_id: id }); if (e)
        setError(e.message);
    else {
        setThread(data);
        const { error: readError } = await client.rpc("mark_school_platform_conversation_notifications_read", { p_conversation_id: id });
        if (readError)
            setError(readError.message);
        else {
            window.dispatchEvent(new Event("soma-notifications-updated"));
            void load();
        }
    } }, [client, load]);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => { if (selectedId)
        void loadThread(selectedId);
    else
        setThread(null); }, [selectedId, loadThread]);
    useEffect(() => { let alive = true; if (client)
        void client.auth.getUser().then(({ data }) => { if (alive)
            setMyAuthUserId(data.user?.id ?? ""); }); return () => { alive = false; }; }, [client]);
    useEffect(() => { const timeline = timelineRef.current; if (timeline)
        timeline.scrollTop = timeline.scrollHeight; }, [thread?.messages]);
    useEffect(() => { try {
        window.localStorage.setItem("soma-message-list-width", String(listWidth));
    }
    catch { /* Resizing still works for this session when storage is unavailable. */ } }, [listWidth]);
    useEffect(() => { const requested = params.get("category"); if (requested && categories.includes(requested))
        setCategory(requested); }, [params]);
    useEffect(() => { if (!platform || !client)
        return; let alive = true; void Promise.all([client.from("schools").select("id,official_name").order("official_name"), client.from("platform_admins").select("auth_user_id,full_name").eq("is_active", true)]).then(([schoolResult, assigneeResult]) => { if (!alive)
        return; if (!schoolResult.error)
        setSchools(schoolResult.data ?? []); if (!assigneeResult.error)
        setAssignees(assigneeResult.data ?? []); }); return () => { alive = false; }; }, [platform, client]);
    useEffect(() => { const requested = params.get("category"); if (requested && categories.includes(requested))
        setCategory(requested); }, [params]);
    const filtered = items.filter(i => (statusFilter === "ALL" || i.status === statusFilter) && (categoryFilter === "ALL" || i.category === categoryFilter) && (priorityFilter === "ALL" || i.priority === priorityFilter));
    const canStart = platform ? Boolean(schoolId) : Boolean(schoolId && ["SCHOOL_ADMIN", "HEAD_TEACHER", "DEPUTY_HEAD_TEACHER", "DIRECTOR_OF_STUDIES", "BURSAR_READ_ONLY"].includes(currentUser.role));
    async function create(e) { e.preventDefault(); if (!client || !schoolId)
        return; setBusy(true); const { data, error: err } = await client.rpc("create_school_platform_conversation", { p_school_id: schoolId, p_category: category, p_subject: subject, p_body: body, p_priority: priority, p_related_entity_type: params.get("relatedType"), p_related_entity_id: params.get("relatedId"), p_action_url: params.get("returnTo") }); setBusy(false); if (err) {
        setError(err.message);
        return;
    } setSubject(""); setBody(""); setParams({ conversation: String(data), ...(platform ? { school: schoolId } : {}) }); void load(); }
    async function send(e) { e.preventDefault(); if (!client || !thread || !reply.trim())
        return; setBusy(true); setError(""); const { data: messageId, error: err } = await client.rpc("post_school_platform_message", { p_conversation_id: thread.conversation.id, p_body: reply, p_internal_platform_note: platform && internal }); if (err) {
        setBusy(false);
        setError(err.message);
        return;
    } let attachmentError = ""; if (files.length) {
        const { data: auth } = await client.auth.getUser();
        const authId = auth?.user?.id;
        if (!authId)
            attachmentError = "Reply sent, but attachment upload could not identify your signed-in account.";
        for (const file of files) {
            if (attachmentError)
                break;
            if (file.size > 10 * 1024 * 1024) {
                attachmentError = `Reply sent, but ${file.name} exceeds the 10 MB limit.`;
                break;
            }
            const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
            const path = `conversations/${thread.conversation.id}/${authId}/${crypto.randomUUID()}.${extension}`;
            const uploaded = await client.storage.from("message-attachments").upload(path, file, { upsert: false, contentType: file.type });
            if (uploaded.error) {
                attachmentError = `Reply sent, but ${file.name} could not upload: ${uploaded.error.message}`;
                break;
            }
            const recorded = await client.rpc("record_school_platform_attachment", { p_message_id: messageId, p_storage_path: path, p_file_name: file.name, p_mime_type: file.type || "application/octet-stream", p_file_size: file.size });
            if (recorded.error) {
                attachmentError = `Reply sent, but ${file.name} could not be linked: ${recorded.error.message}`;
                break;
            }
        }
    } setBusy(false); setReply(""); setFiles([]); setInternal(false); if (attachmentError)
        setError(attachmentError); void loadThread(thread.conversation.id); void load(); }
    async function action(value) { if (!client || !thread)
        return; const summary = value === "RESOLVE" || value === "CLOSE" ? await dialogs.prompt({ title: value === "RESOLVE" ? "Resolve conversation" : "Close conversation", message: "Add a short resolution summary for the conversation record.", placeholder: "Resolution summary", confirmLabel: value === "RESOLVE" ? "Resolve conversation" : "Close conversation", multiline: true }) : null; if ((value === "RESOLVE" || value === "CLOSE") && summary === null)
        return; setBusy(true); const { error: err } = await client.rpc("update_school_platform_conversation", { p_conversation_id: thread.conversation.id, p_action: value, p_resolution_summary: summary }); setBusy(false); if (err)
        setError(err.message);
    else {
        void loadThread(thread.conversation.id);
        void load();
    } }
    async function assign(userId) { if (!client || !thread)
        return; setBusy(true); const { error: err } = await client.rpc("update_school_platform_conversation", { p_conversation_id: thread.conversation.id, p_action: "ASSIGN", p_assigned_platform_auth_user_id: userId || null }); setBusy(false); if (err)
        setError(err.message);
    else {
        void loadThread(thread.conversation.id);
        void load();
    } }
    async function priorityAction(value) { if (!client || !thread)
        return; setBusy(true); const { error: err } = await client.rpc("update_school_platform_conversation", { p_conversation_id: thread.conversation.id, p_action: "PRIORITY", p_priority: value }); setBusy(false); if (err)
        setError(err.message);
    else {
        void loadThread(thread.conversation.id);
        void load();
    } }
    const selectedConversation = items.find(item => item.id === thread?.conversation.id);
    const assignedName = assignees.find(person => person.auth_user_id === selectedConversation?.assignedPlatformAuthUserId)?.full_name;
    return <div className={`message-centre-page ${selectedId ? "has-selected-conversation" : ""}`}>
   <header className={platform ? "platform-page-heading" : "page-heading"}>
    <div><span className="eyebrow">{platform ? "PLATFORM CONTROL CENTRE" : "SCHOOL CONTROL CENTRE"}</span><h1>{platform ? "School Communications" : "Messages & Support"}</h1><p>{platform ? "Monitor and respond to authorised school conversations." : "Contact platform support about this school’s authorised records and setup."}</p></div>
    <div className="session-row-actions">{platform && <label className="message-school-picker"><span>School</span><select value={schoolId ?? ""} onChange={e => setParams(e.target.value ? { school: e.target.value } : {})}><option value="">All schools / choose school</option>{schools.map(s => <option key={s.id} value={s.id}>{s.official_name}</option>)}</select></label>}<Link className="secondary-button" to={platform ? "/platform/notifications" : "/notifications"}><Bell size={16}/>Notification Centre</Link><button className="secondary-button" type="button" onClick={() => void load()}><RefreshCw size={16}/>Refresh</button></div>
   </header>
   {error && <div className="form-error-message" role="alert">{error}</div>}
   {platform && <section className="message-stats">{["OPEN", "AWAITING_PLATFORM", "AWAITING_SCHOOL", "RESOLVED"].map(status => <article className="panel" key={status}><span>{label(status)}</span><strong>{items.filter(i => i.status === status).length}</strong></article>)}</section>}
   {!platform && !schoolId ? <section className="panel">Select an active school before opening Messages &amp; Support.</section> : <div className="message-centre-layout" ref={layoutRef} style={{ "--message-list-width": `${listWidth}%` }}>
    <section className="panel message-conversation-list" aria-label="Conversation list">
     <div className="panel-heading"><div><h2>Conversations</h2><p>{loading ? "Loading…" : `${filtered.length} visible conversation(s)`}</p></div></div>
     <div className="message-filters"><select aria-label="Filter status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="ALL">All statuses</option>{["OPEN", "AWAITING_PLATFORM", "AWAITING_SCHOOL", "RESOLVED", "CLOSED", "REOPENED"].map(v => <option key={v} value={v}>{label(v)}</option>)}</select><select aria-label="Filter category" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="ALL">All categories</option>{categories.map(v => <option key={v} value={v}>{label(v)}</option>)}</select><select aria-label="Filter priority" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}><option value="ALL">All priorities</option>{["LOW", "NORMAL", "HIGH", "URGENT"].map(v => <option key={v} value={v}>{v}</option>)}</select></div>
     {filtered.map(item => <button type="button" key={item.id} className={`message-conversation-card ${item.id === selectedId ? "is-selected" : ""} ${item.unread ? "is-unread" : ""}`} onClick={() => setParams({ conversation: item.id, ...(platform && item.schoolId ? { school: item.schoolId } : {}) })} aria-current={item.id === selectedId ? "true" : undefined}>
      <span className="message-conversation-copy"><strong>{item.subject}</strong><small>{platform ? item.schoolName || "School" : school.schoolName} · {label(item.category)}</small><p>{item.latestPreview || "No visible message preview"}</p><span className="message-conversation-meta"><em>{label(item.status)}</em><em className={`message-priority message-priority-${item.priority.toLowerCase()}`}>{item.priority}</em><time dateTime={item.updatedAt}>{activity(item.updatedAt)}</time></span></span>{item.unread && <span className="message-unread-badge">Unread</span>}
     </button>)}
     {!loading && !filtered.length && <p className="message-empty">No conversations match these filters.</p>}
    </section>
    <div className="message-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize conversation list and chat area" aria-valuemin={22} aria-valuemax={55} aria-valuenow={Math.round(listWidth)} aria-valuetext={`Conversation list ${Math.round(listWidth)} percent; chat area ${100 - Math.round(listWidth)} percent`} tabIndex={0} title="Drag to resize; use left and right arrow keys" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (event.buttons !== 1 || !layoutRef.current)
            return; const bounds = layoutRef.current.getBoundingClientRect(); const next = Math.min(55, Math.max(22, ((event.clientX - bounds.left) / bounds.width) * 100)); setListWidth(next); }} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            setListWidth(width => Math.min(55, Math.max(22, width + (event.key === "ArrowRight" ? 2 : -2))));
        }
        else if (event.key === "Home") {
            setListWidth(22);
        }
        else if (event.key === "End") {
            setListWidth(55);
        } }}/>
    <section className="panel message-thread" aria-label="Active conversation">
     {thread ? <>
      <div className="message-thread-header">
       <button className="secondary-button message-mobile-back" type="button" onClick={() => { setParams(platform && schoolId ? { school: schoolId } : {}); }}><ArrowLeft size={17}/>Back</button>
       <div className="message-thread-title"><small>{platform ? selectedConversation?.schoolName || "School" : school.schoolName}</small><h2>{thread.conversation.subject}</h2><div className="message-header-badges"><span>{label(thread.conversation.status)}</span><span className={`message-priority message-priority-${thread.conversation.priority.toLowerCase()}`}>{thread.conversation.priority}</span><span>{label(thread.conversation.category)}</span></div></div>
       <div className="session-row-actions">{platform && assignedName && <span className="message-assigned-officer">Assigned: {assignedName}</span>}{thread.conversation.actionUrl && <Link className="secondary-button" to={thread.conversation.actionUrl}>Open related record</Link>}{platform && <><select aria-label="Assign conversation" value={selectedConversation?.assignedPlatformAuthUserId ?? ""} onChange={e => void assign(e.target.value)} disabled={busy}><option value="">Unassigned</option>{assignees.map(a => <option key={a.auth_user_id} value={a.auth_user_id}>{a.full_name}</option>)}</select><select aria-label="Change priority" value={thread.conversation.priority} onChange={e => void priorityAction(e.target.value)} disabled={busy}>{["LOW", "NORMAL", "HIGH", "URGENT"].map(v => <option key={v} value={v}>{v}</option>)}</select></>}{thread.conversation.status !== "CLOSED" && <><button className="secondary-button" type="button" onClick={() => void action("RESOLVE")} disabled={busy}>Resolve</button><button className="secondary-button" type="button" onClick={() => void action("CLOSE")} disabled={busy}>Close</button></>}{!platform && thread.conversation.status !== "CLOSED" && <button className="secondary-button" type="button" onClick={() => void action("RESOLVE")} disabled={busy}>Mark resolved</button>}{(thread.conversation.status === "RESOLVED" || thread.conversation.status === "CLOSED") && <button className="secondary-button" type="button" onClick={() => void action("REOPEN")} disabled={busy}>Reopen</button>}</div>
      </div>
      {thread.conversation.resolutionSummary && <div className="form-info-message"><strong>Resolution:</strong> {thread.conversation.resolutionSummary}</div>}
      <div className="message-thread-items" ref={timelineRef} aria-live="polite">
       {thread.messages.map((message, index) => { const previous = thread.messages[index - 1]; const isOutgoing = message.senderAuthUserId === myAuthUserId; const sameSender = Boolean(previous && previous.senderAuthUserId === message.senderAuthUserId && new Date(message.sentAt).getTime() - new Date(previous.sentAt).getTime() < 5 * 60 * 1000); const newDay = !previous || dayKey(previous.sentAt) !== dayKey(message.sentAt); return <div className="message-timeline-entry" key={message.id}>{newDay && <div className="message-date-separator"><span>{dayLabel(message.sentAt)}</span></div>}<div className={`message-row ${isOutgoing ? "message-row-outgoing" : "message-row-incoming"}`}><article className={`message-bubble ${isOutgoing ? "message-bubble-outgoing" : "message-bubble-incoming"} ${message.isInternalPlatformNote ? "message-internal" : ""} ${sameSender ? "message-bubble-grouped" : ""}`}><strong className="message-sender">{message.isInternalPlatformNote ? "Internal platform note" : sameSender ? "" : isOutgoing ? "You" : platform ? "School team" : "Platform support"}</strong><p>{message.body}</p>{message.attachments.map(attachment => <button key={attachment.id} type="button" className="message-attachment-link" onClick={async () => { const { data, error: e } = await client.storage.from("message-attachments").createSignedUrl(attachment.storagePath, 300); if (e)
                setError(e.message);
            else if (data?.signedUrl)
                window.open(data.signedUrl, "_blank", "noopener,noreferrer"); }}>{attachment.fileName} · {(attachment.fileSize / 1024).toFixed(0)} KB</button>)}<small className="message-meta"><time dateTime={message.sentAt}>{new Intl.DateTimeFormat("en-UG", { hour: "numeric", minute: "2-digit" }).format(new Date(message.sentAt))}</time></small></article></div></div>; })}
      </div>
      {thread.conversation.status !== "CLOSED" ? <form className="message-compose" onSubmit={e => void send(e)}>
       <label className="message-attach-button" htmlFor="message-attachments" title="Attach files"><Paperclip size={19}/></label><input id="message-attachments" className="message-file-input" aria-label="Attach files" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e => setFiles(Array.from(e.target.files ?? []))}/>
       <div className="message-compose-input"><textarea required value={reply} onChange={e => setReply(e.target.value)} onInput={e => { e.currentTarget.style.height = "auto"; e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 128)}px`; }} maxLength={5000} placeholder="Write a reply…" aria-label="Write a reply"/><div className="message-compose-details">{files.length > 0 && <span>{files.map(file => file.name).join(" · ")}</span>}{platform && <label><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)}/> Internal platform note</label>}</div></div>
       <button className="primary-button message-send-button" disabled={busy || !reply.trim()} title={busy ? "Sending reply" : "Send reply"}><Send size={17}/><span>{busy ? "Sending…" : "Send"}</span></button>
       <small className="message-attachment-guidance">Up to 10 MB each · PDF, image, DOCX or text</small>
      </form> : <div className="message-closed-note">This conversation is closed. Reopen it to send another message.</div>}
     </> : canStart ? <form className="message-new-form" onSubmit={e => void create(e)}><div className="panel-heading"><div><h2>{platform ? "New platform message" : "New support request"}</h2><p>Context from the current school and page is retained with this conversation.</p></div></div><label className="form-field"><span>Subject</span><input required minLength={3} maxLength={180} value={subject} onChange={e => setSubject(e.target.value)} placeholder="What do you need help with?"/></label><div className="form-grid"><label className="form-field"><span>Category</span><select value={category} onChange={e => setCategory(e.target.value)}>{categories.filter(v => platform || v !== "PLATFORM_ANNOUNCEMENT").map(v => <option key={v} value={v}>{label(v)}</option>)}</select></label><label className="form-field"><span>Priority</span><select value={priority} onChange={e => setPriority(e.target.value)}>{["LOW", "NORMAL", "HIGH", "URGENT"].map(v => <option key={v} value={v}>{v}</option>)}</select></label></div><label className="form-field"><span>Message</span><textarea required minLength={1} maxLength={5000} value={body} onChange={e => setBody(e.target.value)} placeholder="Describe the issue, including any error reference."/></label><button className="primary-button" disabled={busy || !subject.trim() || !body.trim()}><Send size={16}/>{busy ? "Opening…" : platform ? "Send to School" : "Send to Platform Support"}</button></form> : <div className="message-empty"><CircleAlert size={28}/><h2>Select a conversation</h2><p>Your current role cannot start a new School–Platform request.</p></div>}
    </section>
   </div>}
  </div>;
}
