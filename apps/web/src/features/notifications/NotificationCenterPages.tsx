import { ArrowLeft, Bell, CheckCheck, CircleAlert, Filter, MessageCircleMore, Paperclip, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { type CSSProperties, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { currentUser } from "../../config/currentUser";
import { platformSupabase, supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
import { useSystemDialogs } from "../../components/system/SystemDialogs";
import { SchoolTeacherMessages } from "./SchoolTeacherMessages";

type Notice={id:string;category:string;title:string;message:string;readAt:string|null;createdAt:string;conversationId:string|null;actionUrl:string|null};
type Conversation={id:string;schoolId:string;schoolName?:string;subject:string;category:string;status:string;priority:string;assignedPlatformAuthUserId:string|null;latestPreview:string;updatedAt:string;unread:boolean};
type Thread={conversation:{id:string;subject:string;category:string;status:string;priority:string;resolutionSummary:string|null;actionUrl:string|null;relatedEntityType?:string|null;relatedEntityId?:string|null};messages:{id:string;senderAuthUserId:string;body:string;sentAt:string;isInternalPlatformNote:boolean;attachments:{id:string;fileName:string;storagePath:string;fileSize:number}[]}[]};
type SchoolOption={id:string;official_name:string};
type PlatformAssignee={auth_user_id:string;full_name:string};
const categories=["GENERAL_SUPPORT","SCHOOL_REGISTRATION","SCHOOL_PROFILE_AND_SETUP","SUBSCRIPTION_AND_BILLING","PAYMENT_INITIATION","PAYMENT_FAILURE","PAYMENT_REFUND","SUBJECT_ACTIVATION","ACADEMIC_SETUP","CLASS_AND_LEARNER_SETUP","STAFF_AND_ROLE_SETUP","IMPORT_OR_EXPORT","ASSESSMENT_AND_MARKS","APPROVAL_OR_REPORT","TECHNICAL_ISSUE","FEATURE_REQUEST","PLATFORM_ANNOUNCEMENT","TEACHER_ACCOUNT_ACCESS"];
const teacherAccountReviewDraft="The invited teacher cannot accept this school invitation because the linked SOMA account is reported as platform-restricted. Please review the global account restriction and, if appropriate, clear it so the teacher can continue. Do not accept the invitation or activate/change the school membership; those actions remain under School Administrator control.";
async function teacherAccountReviewError(error:unknown){const value=error as {message?:string;context?:{json?:()=>Promise<unknown>;clone?:()=>{json?:()=>Promise<unknown>}}}|null;let code="";try{const response=value?.context?.clone?.()??value?.context;const payload=await response?.json?.() as {error?:unknown}|undefined;if(typeof payload?.error==="string")code=payload.error}catch{/* The function response may already have been consumed. */}if(!code&&typeof value?.message==="string"){const match=value.message.match(/\b[A-Z][A-Z0-9_]{3,}\b/);if(match)code=match[0]}const errors:Record<string,string>={AUTHENTICATION_REQUIRED:"Your Platform Admin session has expired. Sign in again, reopen this request, and retry.",PLATFORM_ADMIN_REQUIRED:"This action is restricted to an active Platform Administrator account.",REVIEW_FIELDS_REQUIRED:"The review reason or teacher details were missing. Reopen the action and enter the exact invited email and a reason of at least 8 characters.",INVITED_TEACHER_EMAIL_REQUIRED:"This review link is outdated. Refresh the Platform Support page and retry.",ACCOUNT_REVIEW_TICKET_REQUIRED:"This support ticket is no longer eligible for teacher account review. Refresh the ticket and confirm it is the correct school request.",TEACHER_INVITATION_LOOKUP_FAILED:"The teacher invitation could not be read. Confirm the latest teacher-invitation database migration is applied, then retry.",MULTIPLE_TEACHER_INVITATIONS_MATCH:"More than one invitation matches that email at this school. The system stopped to avoid changing the wrong account; ask the School Admin to resolve duplicate invitations.",TEACHER_INVITATION_NOT_REVIEWABLE:"This invitation was revoked or declined and cannot be used for account review. Ask the School Admin to confirm the correct invitation.",TEACHER_ACCOUNT_NOT_LINKED:"This invitation is not yet linked to a SOMA user profile. The teacher must finish account setup/sign-in first, or the School Admin must correct the invited account link; no lock was changed.",INVITATION_ACCOUNT_MISMATCH:"The invitation points to a different SOMA account. No account was changed; ask the School Admin to review the invitation identity.",AUTH_ACCOUNT_LOOKUP_FAILED:"The linked SOMA sign-in account could not be found. No account was changed.",PLATFORM_LOCK_NOT_PRESENT:"The deployed account-review function is out of date for this teacher profile. Deploy the current review-teacher-account-lock function and retry.",ACCOUNT_STATUS_REQUIRES_MANUAL_REVIEW:"This teacher profile has an unexpected account status. Keep the ticket open and inspect the linked account before changing it.",PLATFORM_AUDIT_WRITE_FAILED:"The review could not be recorded in the security audit log, so the account was not changed. Retry later or contact system support.",AUTH_ACCOUNT_UPDATE_FAILED:"The audit was recorded, but Supabase could not clear the sign-in lock. Keep this ticket open and retry or inspect the Edge Function logs.",ACCOUNT_STATUS_UPDATE_FAILED:"The sign-in lock was cleared, but the SOMA profile status could not be updated. Keep this ticket open and retry; the response includes partial-completion details.",SERVER_CONFIGURATION_ERROR:"The account-review function is missing required Supabase server configuration. Check its project secrets and function logs."};return errors[code]??(code?`Teacher account review failed (${code}). Check the function logs for this request before retrying.`:value?.message??"Teacher account review failed. Check the Edge Function logs and retry.")}
const label=(v:string)=>v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
const api=(platform:boolean)=>platform?platformSupabase:supabase;
const date=(v:string)=>new Intl.DateTimeFormat("en-UG",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));
const dayKey=(v:string)=>{const d=new Date(v);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`};
const dayLabel=(v:string)=>{const d=new Date(v);const today=new Date();const yesterday=new Date();yesterday.setDate(today.getDate()-1);if(dayKey(v)===dayKey(today.toISOString()))return "Today";if(dayKey(v)===dayKey(yesterday.toISOString()))return "Yesterday";return new Intl.DateTimeFormat("en-UG",{day:"numeric",month:"long",year:"numeric"}).format(d)};
const activity=(v:string)=>new Intl.DateTimeFormat("en-UG",{dateStyle:"short",timeStyle:"short"}).format(new Date(v));

function NotificationCenter({platform=false}:{platform?:boolean}) {
 const navigate=useNavigate(); const [items,setItems]=useState<Notice[]>([]); const [error,setError]=useState(""); const [loading,setLoading]=useState(true); const [unreadOnly,setUnreadOnly]=useState(false);
 const load=useCallback(async()=>{const client=api(platform);if(!client){setError("Notifications are not connected.");setLoading(false);return;}setLoading(true);const {data,error:e}=await (client as any).rpc("get_notification_centre",{p_limit:100});if(e)setError(e.message);else{setItems(Array.isArray(data)?data:[]);setError("");}setLoading(false)},[platform]); useEffect(()=>{void load()},[load]);
  const mark=async(ids:string[]|null)=>{const client=api(platform);if(!client)return;const {error:e}=await (client as any).rpc("mark_notification_centre_read",{p_notification_ids:ids});if(e)setError(e.message);else{window.dispatchEvent(new Event("soma-notifications-updated"));void load()}};
 const open=async(item:Notice)=>{if(!item.readAt)await mark([item.id]);navigate(item.actionUrl||(item.conversationId?(platform?`/platform/messages?conversation=${item.conversationId}`:`/messages?conversation=${item.conversationId}`):(platform?"/platform/dashboard":"/dashboard")))}; const visible=unreadOnly?items.filter(i=>!i.readAt):items;
 return <div className="notification-centre-page"><header className={platform?"platform-page-heading":"page-heading"}><div><span className="eyebrow">{platform?"PLATFORM OPERATIONS":"MY ACCOUNT"}</span><h1>Notification Centre</h1><p>One authorised feed for messages, academic work, payments, setup, and system events.</p></div><div className="session-row-actions"><Link className="secondary-button" to={platform?"/platform/messages":"/messages"}><MessageCircleMore size={16}/>Messages &amp; Support</Link><button className="secondary-button" type="button" onClick={()=>void mark(null)} disabled={!items.some(i=>!i.readAt)}><CheckCheck size={16}/>Mark all read</button><button className="secondary-button" type="button" aria-label="Refresh notifications" onClick={()=>void load()}><RefreshCw size={16}/></button></div></header>{error&&<div className="form-error-message" role="alert">Notifications could not load: {error}</div>}<section className="panel notification-controls"><label><Filter size={17}/><input type="checkbox" checked={unreadOnly} onChange={e=>setUnreadOnly(e.target.checked)}/> Unread only</label><strong>{items.filter(i=>!i.readAt).length} unread</strong></section><section className="panel notification-list" aria-busy={loading}>{!loading&&!visible.length?<div className="notification-empty"><Bell size={25}/><h2>No notifications</h2><p>New authorised events appear here.</p></div>:visible.map(item=><button className={`notification-row ${item.readAt?"":"is-unread"}`} type="button" key={item.id} onClick={()=>void open(item)}><span className="notification-row-icon"><Bell size={17}/></span><span><strong>{item.title}</strong><small>{item.message}</small><em>{label(item.category)} · {date(item.createdAt)}</em></span>{!item.readAt&&<i aria-label="Unread"/>}</button>)}</section><section className="notification-security-note"><ShieldCheck size={17}/><p>Opening a notification never bypasses school or platform permissions.</p></section></div>;
}
export function SchoolNotificationCenterPage(){return <NotificationCenter/>}
export function PlatformNotificationCenterPage(){return <NotificationCenter platform/>}

export function MessageCentrePage({platform=false}:{platform?:boolean}) {
 const [params]=useSearchParams();
 if (!platform && (currentUser.role==="TEACHER" || (currentUser.role==="SCHOOL_ADMIN" && params.get("view")==="school"))) return <SchoolTeacherMessages/>;
 return <SupportMessageCentrePage platform={platform}/>;
}

function SupportMessageCentrePage({platform=false}:{platform?:boolean}) {
 const dialogs=useSystemDialogs();
 const school=useSchoolContext(); const [params,setParams]=useSearchParams(); const [items,setItems]=useState<Conversation[]>([]); const [thread,setThread]=useState<Thread|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [reviewNotice,setReviewNotice]=useState(""); const [subject,setSubject]=useState(""); const [category,setCategory]=useState("GENERAL_SUPPORT"); const [priority,setPriority]=useState("NORMAL"); const [body,setBody]=useState(""); const [reply,setReply]=useState(""); const [internal,setInternal]=useState(false); const [busy,setBusy]=useState(false); const [statusFilter,setStatusFilter]=useState("ALL"); const [categoryFilter,setCategoryFilter]=useState("ALL"); const [priorityFilter,setPriorityFilter]=useState("ALL"); const [myAuthUserId,setMyAuthUserId]=useState(""); const [reviewedInvitations,setReviewedInvitations]=useState<string[]>([]); const [listWidth,setListWidth]=useState(()=>{try{const saved=Number(window.localStorage.getItem("soma-message-list-width"));return saved>=22&&saved<=55?saved:32}catch{return 32}}); const timelineRef=useRef<HTMLDivElement>(null); const layoutRef=useRef<HTMLDivElement>(null);
 const schoolId=platform?(params.get("school")||null):school.schoolId; const selectedId=params.get("conversation"); const client=api(platform); const [schools,setSchools]=useState<SchoolOption[]>([]); const [assignees,setAssignees]=useState<PlatformAssignee[]>([]); const [files,setFiles]=useState<File[]>([]);
 const load=useCallback(async()=>{if(!client||(!platform&&!schoolId)){setLoading(false);return}setLoading(true);const {data,error:e}=await (client as any).rpc("get_school_platform_message_centre",{p_school_id:schoolId});if(e){setError(e.message);setItems([])}else{setItems(Array.isArray(data)?data:[]);setError("")}setLoading(false)},[client,platform,schoolId]);
  const loadThread=useCallback(async(id:string)=>{if(!client)return;const {data,error:e}=await (client as any).rpc("get_school_platform_conversation",{p_conversation_id:id});if(e)setError(e.message);else{setThread(data as Thread);const {error:readError}=await (client as any).rpc("mark_school_platform_conversation_notifications_read",{p_conversation_id:id});if(readError)setError(readError.message);else{window.dispatchEvent(new Event("soma-notifications-updated"));void load()}}},[client,load]); useEffect(()=>{void load()},[load]); useEffect(()=>{if(selectedId)void loadThread(selectedId);else setThread(null)},[selectedId,loadThread]);
 useEffect(()=>{let alive=true;if(client)void (client as any).auth.getUser().then(({data}:{data:{user:{id:string}|null}})=>{if(alive)setMyAuthUserId(data.user?.id??"")});return()=>{alive=false}},[client]);
 useEffect(()=>{const timeline=timelineRef.current;if(timeline)timeline.scrollTop=timeline.scrollHeight},[thread?.messages]);
 useEffect(()=>{try{window.localStorage.setItem("soma-message-list-width",String(listWidth))}catch{/* Resizing still works for this session when storage is unavailable. */}},[listWidth]);
 useEffect(()=>{const requested=params.get("category");if(requested&&categories.includes(requested)){setCategory(requested);if(requested==="TEACHER_ACCOUNT_ACCESS"){setSubject("Teacher account access review");setBody(current=>current.trim()?current:teacherAccountReviewDraft)}}},[params]);
 useEffect(()=>{if(!platform||!client)return;let alive=true;void Promise.all([(client as any).from("schools").select("id,official_name").order("official_name"),(client as any).from("platform_admins").select("auth_user_id,full_name").eq("is_active",true)]).then(([schoolResult,assigneeResult])=>{if(!alive)return;if(!schoolResult.error)setSchools(schoolResult.data??[]);if(!assigneeResult.error)setAssignees(assigneeResult.data??[])});return()=>{alive=false}},[platform,client]);
 useEffect(()=>{const requested=params.get("category");if(requested&&categories.includes(requested))setCategory(requested)},[params]);
 const filtered=items.filter(i=>(statusFilter==="ALL"||i.status===statusFilter)&&(categoryFilter==="ALL"||i.category===categoryFilter)&&(priorityFilter==="ALL"||i.priority===priorityFilter)); const canStart=platform?Boolean(schoolId):Boolean(schoolId&&["SCHOOL_ADMIN","HEAD_TEACHER","DEPUTY_HEAD_TEACHER","DIRECTOR_OF_STUDIES","BURSAR_READ_ONLY"].includes(currentUser.role));
 async function create(e:FormEvent){e.preventDefault();if(!client||!schoolId)return;setBusy(true);setError("");const result=category==="TEACHER_ACCOUNT_ACCESS"?(await (client as any).rpc("create_school_teacher_account_access_review",{p_invitation_id:params.get("relatedId"),p_details:body})):await (client as any).rpc("create_school_platform_conversation",{p_school_id:schoolId,p_category:category,p_subject:subject,p_body:body,p_priority:priority,p_related_entity_type:params.get("relatedType"),p_related_entity_id:params.get("relatedId"),p_action_url:params.get("returnTo")});setBusy(false);if(result.error){setError(result.error.message);return}setSubject("");setBody("");setParams({conversation:String(result.data),...(platform?{school:schoolId}:{})});void load()}
 async function send(e:FormEvent){e.preventDefault();if(!client||!thread||!reply.trim())return;setBusy(true);setError("");const {data:messageId,error:err}=await (client as any).rpc("post_school_platform_message",{p_conversation_id:thread.conversation.id,p_body:reply,p_internal_platform_note:platform&&internal});if(err){setBusy(false);setError(err.message);return}let attachmentError="";if(files.length){const {data:auth}=await (client as any).auth.getUser();const authId=auth?.user?.id;if(!authId)attachmentError="Reply sent, but attachment upload could not identify your signed-in account.";for(const file of files){if(attachmentError)break;if(file.size>10*1024*1024){attachmentError=`Reply sent, but ${file.name} exceeds the 10 MB limit.`;break}const extension=file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g,"")||"bin";const path=`conversations/${thread.conversation.id}/${authId}/${crypto.randomUUID()}.${extension}`;const uploaded=await (client as any).storage.from("message-attachments").upload(path,file,{upsert:false,contentType:file.type});if(uploaded.error){attachmentError=`Reply sent, but ${file.name} could not upload: ${uploaded.error.message}`;break}const recorded=await (client as any).rpc("record_school_platform_attachment",{p_message_id:messageId,p_storage_path:path,p_file_name:file.name,p_mime_type:file.type||"application/octet-stream",p_file_size:file.size});if(recorded.error){attachmentError=`Reply sent, but ${file.name} could not be linked: ${recorded.error.message}`;break}}}setBusy(false);setReply("");setFiles([]);setInternal(false);if(attachmentError)setError(attachmentError);void loadThread(thread.conversation.id);void load()}
 async function action(value:"RESOLVE"|"CLOSE"|"REOPEN"){if(!client||!thread)return;const summary=value==="RESOLVE"||value==="CLOSE"?await dialogs.prompt({title:value==="RESOLVE"?"Resolve conversation":"Close conversation",message:"Add a short resolution summary for the conversation record.",placeholder:"Resolution summary",confirmLabel:value==="RESOLVE"?"Resolve conversation":"Close conversation",multiline:true}):null;if((value==="RESOLVE"||value==="CLOSE")&&summary===null)return;setBusy(true);const {error:err}=await (client as any).rpc("update_school_platform_conversation",{p_conversation_id:thread.conversation.id,p_action:value,p_resolution_summary:summary});setBusy(false);if(err)setError(err.message);else{void loadThread(thread.conversation.id);void load()}}
 async function assign(userId:string){if(!client||!thread)return;setBusy(true);const {error:err}=await (client as any).rpc("update_school_platform_conversation",{p_conversation_id:thread.conversation.id,p_action:"ASSIGN",p_assigned_platform_auth_user_id:userId||null});setBusy(false);if(err)setError(err.message);else{void loadThread(thread.conversation.id);void load()}}
 async function priorityAction(value:string){if(!client||!thread)return;setBusy(true);const {error:err}=await (client as any).rpc("update_school_platform_conversation",{p_conversation_id:thread.conversation.id,p_action:"PRIORITY",p_priority:value});setBusy(false);if(err)setError(err.message);else{void loadThread(thread.conversation.id);void load()}}
 async function reviewTeacherAccountLock() {
  if (!platform || !client || !thread) return;
  const linkedInvitation = thread.conversation.category === "TEACHER_ACCOUNT_ACCESS"
    && thread.conversation.relatedEntityType === "school_teacher_invitation"
    ? thread.conversation.relatedEntityId : null;
  const canLinkStaffTicket = thread.conversation.category === "GENERAL_SUPPORT"
    && /^\/staff(?:[/?#]|$)/i.test(thread.conversation.actionUrl ?? "")
    && !thread.conversation.relatedEntityId;
  if (!linkedInvitation && !canLinkStaffTicket) return;

  let invitedEmail: string | undefined;
  if (!linkedInvitation) {
    const enteredEmail = await dialogs.prompt({
      title: "Identify the invited teacher",
      message: "This staff-page help ticket is not linked to a teacher. Enter the exact email address used for the school invitation; the system will match it within this school before showing the lock action.",
      placeholder: "teacher@example.com",
      confirmLabel: "Find invited teacher",
    });
    if (enteredEmail === null) return;
    invitedEmail = enteredEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
      setError("Enter the teacher’s exact invited email address.");
      return;
    }
  }

  const reason = await dialogs.prompt({
    title: "Review teacher account access?",
    message: "This checks the linked SOMA sign-in. A Platform Admin may restore an inactive sign-in, while an invited account can continue onboarding. The school membership is handled separately. Record the reason for the review.",
    placeholder: "Review reason (at least 8 characters)",
    confirmLabel: "Review account access",
    multiline: true,
  });
  if (reason === null || reason.trim().length < 8) return;
  setBusy(true);
  setError("");
  setReviewNotice("");
  const { data, error: invokeError } = await (client as any).functions.invoke("review-teacher-account-lock", {
    body: {
      conversationId: thread.conversation.id,
      ...(linkedInvitation ? { invitationId: linkedInvitation } : { invitedEmail }),
      reason: reason.trim(),
    },
  });
  if (invokeError || data?.error) {
    setBusy(false);
    setError(data?.error ? await teacherAccountReviewError({ message: data.error }) : await teacherAccountReviewError(invokeError));
    return;
  }

  const outcome = data?.status;
  if (!["ALREADY_ACTIVE", "ONBOARDING_PENDING", "REACTIVATED"].includes(outcome)) {
    setBusy(false);
    setError("The account review returned an unknown result. Keep this ticket open and check the Edge Function logs.");
    return;
  }
  const message = outcome === "ONBOARDING_PENDING"
    ? "Platform Admin reviewed this teacher account. No platform lock was found. The teacher should refresh the existing invitation and tap Accept school invitation. After acceptance, the School Administrator activates this school membership."
    : outcome === "ALREADY_ACTIVE"
      ? "Platform Admin reviewed this request. The teacher’s global SOMA account is already active; no account lock needed clearing. The school can continue with invitation acceptance and its own membership activation."
      : "Platform Admin reviewed and restored the teacher’s global SOMA sign-in. The teacher can refresh the existing invitation and accept it; the School Administrator then activates this school membership.";
  const resolutionSummary = outcome === "ONBOARDING_PENDING"
    ? "No platform lock found. Teacher onboarding can continue through the existing school invitation."
    : outcome === "ALREADY_ACTIVE"
      ? "Account review completed; the global sign-in was already active. School invitation and membership remain unchanged."
      : "Global teacher sign-in restored after Platform Admin review. School invitation awaits teacher acceptance and school activation.";
  const pendingNotice = outcome === "ONBOARDING_PENDING"
    ? "No platform lock was found. The ticket still needs its school notification and closure."
    : outcome === "ALREADY_ACTIVE"
      ? "The teacher account is already active. The ticket still needs its school notification and closure."
      : "The account restriction has been cleared. The ticket still needs its school notification and closure.";
  const successNotice = outcome === "ONBOARDING_PENDING"
    ? "No platform lock was found. The school has been notified to ask the teacher to refresh and accept the existing invitation."
    : outcome === "ALREADY_ACTIVE"
      ? "The teacher’s account is already active; the school has been notified that no lock needed clearing."
      : "Account restriction cleared. The school has been notified; the teacher can refresh the invitation, accept it, then the School Admin can activate this school membership.";
  const alreadyReplied = thread.messages.some(item => item.body === message);
  const { error: replyError } = alreadyReplied ? { error: null } : await (client as any).rpc("post_school_platform_message", {
    p_conversation_id: thread.conversation.id,
    p_body: message,
    p_internal_platform_note: false,
  });
  const { error: resolveError } = replyError ? { error: replyError } : await (client as any).rpc("update_school_platform_conversation", {
    p_conversation_id: thread.conversation.id,
    p_action: "RESOLVE",
    p_resolution_summary: resolutionSummary,
  });
  setBusy(false);
  if (replyError || resolveError) {
    setError("The account review action completed, but the support ticket update failed. Retry the button to finish notifying the school and closing the ticket.");
    setReviewNotice(pendingNotice);
  } else {
    setError("");
    setReviewNotice(successNotice);
    setReviewedInvitations(current => [...current, linkedInvitation ?? data?.invitationId].filter((id): id is string => Boolean(id)));
  }
  void loadThread(thread.conversation.id);
  void load();
}
  const selectedConversation=items.find(item=>item.id===thread?.conversation.id);
  const assignedName=assignees.find(person=>person.auth_user_id===selectedConversation?.assignedPlatformAuthUserId)?.full_name;
  return <div className={`message-centre-page ${selectedId?"has-selected-conversation":""}`}>
   <header className={platform?"platform-page-heading":"page-heading"}>
    <div><span className="eyebrow">{platform?"PLATFORM CONTROL CENTRE":"SCHOOL CONTROL CENTRE"}</span><h1>{platform?"School Communications":"Messages & Support"}</h1><p>{platform?"Monitor and respond to authorised school conversations.":"Contact platform support about this school’s authorised records and setup."}</p></div>
    <div className="session-row-actions">{platform&&<label className="message-school-picker"><span>School</span><select value={schoolId??""} onChange={e=>setParams(e.target.value?{school:e.target.value}:{})}><option value="">All schools / choose school</option>{schools.map(s=><option key={s.id} value={s.id}>{s.official_name}</option>)}</select></label>}{!platform&&currentUser.role==="SCHOOL_ADMIN"&&<Link className="secondary-button" to="/messages?view=school"><MessageCircleMore size={16}/>School staff messages</Link>}<Link className="secondary-button" to={platform?"/platform/notifications":"/notifications"}><Bell size={16}/>Notification Centre</Link><button className="secondary-button" type="button" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button></div>
   </header>
   {error&&<div className="form-error-message" role="alert">{error}</div>}{reviewNotice&&<div className="form-success-message" role="status"><ShieldCheck size={17} aria-hidden="true"/>{reviewNotice}</div>}
   {platform&&<section className="message-stats">{["OPEN","AWAITING_PLATFORM","AWAITING_SCHOOL","RESOLVED"].map(status=><article className="panel" key={status}><span>{label(status)}</span><strong>{items.filter(i=>i.status===status).length}</strong></article>)}</section>}
   {!platform&&!schoolId?<section className="panel">Select an active school before opening Messages &amp; Support.</section>:<div className="message-centre-layout" ref={layoutRef} style={{"--message-list-width":`${listWidth}%`} as CSSProperties}>
    <section className="panel message-conversation-list" aria-label="Conversation list">
     <div className="panel-heading"><div><h2>Conversations</h2><p>{loading?"Loading…":`${filtered.length} visible conversation(s)`}</p></div></div>
     <div className="message-filters"><select aria-label="Filter status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All statuses</option>{["OPEN","AWAITING_PLATFORM","AWAITING_SCHOOL","RESOLVED","CLOSED","REOPENED"].map(v=><option key={v} value={v}>{label(v)}</option>)}</select><select aria-label="Filter category" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="ALL">All categories</option>{categories.map(v=><option key={v} value={v}>{label(v)}</option>)}</select><select aria-label="Filter priority" value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)}><option value="ALL">All priorities</option>{["LOW","NORMAL","HIGH","URGENT"].map(v=><option key={v} value={v}>{v}</option>)}</select></div>
     {filtered.map(item=><button type="button" key={item.id} className={`message-conversation-card ${item.id===selectedId?"is-selected":""} ${item.unread?"is-unread":""}`} onClick={()=>setParams({conversation:item.id,...(platform&&item.schoolId?{school:item.schoolId}:{})})} aria-current={item.id===selectedId?"true":undefined}>
      <span className="message-conversation-copy"><strong>{item.subject}</strong><small>{platform?item.schoolName||"School":school.schoolName} · {label(item.category)}</small><p>{item.latestPreview||"No visible message preview"}</p><span className="message-conversation-meta"><em>{label(item.status)}</em><em className={`message-priority message-priority-${item.priority.toLowerCase()}`}>{item.priority}</em><time dateTime={item.updatedAt}>{activity(item.updatedAt)}</time></span></span>{item.unread&&<span className="message-unread-badge">Unread</span>}
     </button>)}
     {!loading&&!filtered.length&&<p className="message-empty">No conversations match these filters.</p>}
    </section>
    <div className="message-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize conversation list and chat area" aria-valuemin={22} aria-valuemax={55} aria-valuenow={Math.round(listWidth)} aria-valuetext={`Conversation list ${Math.round(listWidth)} percent; chat area ${100-Math.round(listWidth)} percent`} tabIndex={0} title="Drag to resize; use left and right arrow keys" onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={event=>{if(event.buttons!==1||!layoutRef.current)return;const bounds=layoutRef.current.getBoundingClientRect();const next=Math.min(55,Math.max(22,((event.clientX-bounds.left)/bounds.width)*100));setListWidth(next)}} onKeyDown={event=>{if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();setListWidth(width=>Math.min(55,Math.max(22,width+(event.key==="ArrowRight"?2:-2))))}else if(event.key==="Home"){setListWidth(22)}else if(event.key==="End"){setListWidth(55)}}}/>
    <section className="panel message-thread" aria-label="Active conversation">
    {thread?<>
      <div className="message-thread-header">
       <button className="secondary-button message-mobile-back" type="button" onClick={()=>{setParams(platform&&schoolId?{school:schoolId}:{});}}><ArrowLeft size={17}/>Back</button>
       <div className="message-thread-title"><small>{platform?selectedConversation?.schoolName||"School":school.schoolName}</small><h2>{thread.conversation.subject}</h2><div className="message-header-badges"><span>{label(thread.conversation.status)}</span><span className={`message-priority message-priority-${thread.conversation.priority.toLowerCase()}`}>{thread.conversation.priority}</span><span>{label(thread.conversation.category)}</span></div></div>
       <div className="session-row-actions">{platform&&thread.conversation.status!=="CLOSED"&&thread.conversation.status!=="RESOLVED"&&((thread.conversation.category==="TEACHER_ACCOUNT_ACCESS"&&thread.conversation.relatedEntityType==="school_teacher_invitation"&&thread.conversation.relatedEntityId)|| (thread.conversation.category==="GENERAL_SUPPORT"&&/^\/staff(?:[/?#]|$)/i.test(thread.conversation.actionUrl??"")&&!thread.conversation.relatedEntityId))&&(!thread.conversation.relatedEntityId||!reviewedInvitations.includes(thread.conversation.relatedEntityId))&&<button className="primary-button" type="button" onClick={()=>void reviewTeacherAccountLock()} disabled={busy}><ShieldCheck size={16} aria-hidden="true"/>{busy?"Reviewing…":thread.conversation.relatedEntityId?"Review account access":"Find teacher & review lock"}</button>}{platform&&assignedName&&<span className="message-assigned-officer">Assigned: {assignedName}</span>}{thread.conversation.actionUrl&&<Link className="secondary-button" to={thread.conversation.actionUrl}>Open related record</Link>}{platform&&<><select aria-label="Assign conversation" value={selectedConversation?.assignedPlatformAuthUserId??""} onChange={e=>void assign(e.target.value)} disabled={busy}><option value="">Unassigned</option>{assignees.map(a=><option key={a.auth_user_id} value={a.auth_user_id}>{a.full_name}</option>)}</select><select aria-label="Change priority" value={thread.conversation.priority} onChange={e=>void priorityAction(e.target.value)} disabled={busy}>{["LOW","NORMAL","HIGH","URGENT"].map(v=><option key={v} value={v}>{v}</option>)}</select></>}{thread.conversation.status!=="CLOSED"&&<><button className="secondary-button" type="button" onClick={()=>void action("RESOLVE")} disabled={busy}>Resolve</button><button className="secondary-button" type="button" onClick={()=>void action("CLOSE")} disabled={busy}>Close</button></>}{!platform&&thread.conversation.status!=="CLOSED"&&<button className="secondary-button" type="button" onClick={()=>void action("RESOLVE")} disabled={busy}>Mark resolved</button>}{(thread.conversation.status==="RESOLVED"||thread.conversation.status==="CLOSED")&&<button className="secondary-button" type="button" onClick={()=>void action("REOPEN")} disabled={busy}>Reopen</button>}</div>
      </div>
      {thread.conversation.category==="TEACHER_ACCOUNT_ACCESS"&&<div className="form-info-message"><strong>Account review only.</strong> Clearing a global restriction does not accept the invitation or activate this school’s membership. School membership stays under School Admin control.</div>}
      {thread.conversation.resolutionSummary&&<div className="form-info-message"><strong>Resolution:</strong> {thread.conversation.resolutionSummary}</div>}
      <div className="message-thread-items" ref={timelineRef} aria-live="polite">
       {thread.messages.map((message,index)=>{const previous=thread.messages[index-1];const isOutgoing=message.senderAuthUserId===myAuthUserId;const sameSender=Boolean(previous&&previous.senderAuthUserId===message.senderAuthUserId&&new Date(message.sentAt).getTime()-new Date(previous.sentAt).getTime()<5*60*1000);const newDay=!previous||dayKey(previous.sentAt)!==dayKey(message.sentAt);return <div className="message-timeline-entry" key={message.id}>{newDay&&<div className="message-date-separator"><span>{dayLabel(message.sentAt)}</span></div>}<div className={`message-row ${isOutgoing?"message-row-outgoing":"message-row-incoming"}`}><article className={`message-bubble ${isOutgoing?"message-bubble-outgoing":"message-bubble-incoming"} ${message.isInternalPlatformNote?"message-internal":""} ${sameSender?"message-bubble-grouped":""}`}><strong className="message-sender">{message.isInternalPlatformNote?"Internal platform note":sameSender?"":isOutgoing?"You":platform?"School team":"Platform support"}</strong><p>{message.body}</p>{message.attachments.map(attachment=><button key={attachment.id} type="button" className="message-attachment-link" onClick={async()=>{const {data,error:e}=await (client as any).storage.from("message-attachments").createSignedUrl(attachment.storagePath,300);if(e)setError(e.message);else if(data?.signedUrl)window.open(data.signedUrl,"_blank","noopener,noreferrer")}}>{attachment.fileName} · {(attachment.fileSize/1024).toFixed(0)} KB</button>)}<small className="message-meta"><time dateTime={message.sentAt}>{new Intl.DateTimeFormat("en-UG",{hour:"numeric",minute:"2-digit"}).format(new Date(message.sentAt))}</time></small></article></div></div>})}
      </div>
      {thread.conversation.status!=="CLOSED"?<form className="message-compose" onSubmit={e=>void send(e)}>
       <label className="message-attach-button" htmlFor="message-attachments" title="Attach files"><Paperclip size={19}/></label><input id="message-attachments" className="message-file-input" aria-label="Attach files" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>setFiles(Array.from(e.target.files??[]))}/>
       <div className="message-compose-input"><textarea required value={reply} onChange={e=>setReply(e.target.value)} onInput={e=>{e.currentTarget.style.height="auto";e.currentTarget.style.height=`${Math.min(e.currentTarget.scrollHeight,128)}px`}} maxLength={5000} placeholder="Write a reply…" aria-label="Write a reply"/><div className="message-compose-details">{files.length>0&&<span>{files.map(file=>file.name).join(" · ")}</span>}{platform&&<label><input type="checkbox" checked={internal} onChange={e=>setInternal(e.target.checked)}/> Internal platform note</label>}</div></div>
       <button className="primary-button message-send-button" disabled={busy||!reply.trim()} title={busy?"Sending reply":"Send reply"}><Send size={17}/><span>{busy?"Sending…":"Send"}</span></button>
       <small className="message-attachment-guidance">Up to 10 MB each · PDF, image, DOCX or text</small>
      </form>:<div className="message-closed-note">This conversation is closed. Reopen it to send another message.</div>}
     </>:canStart?<form className="message-new-form" onSubmit={e=>void create(e)}><div className="panel-heading"><div><h2>{category==="TEACHER_ACCOUNT_ACCESS"?"Request teacher account review":platform?"New platform message":"New support request"}</h2><p>{category==="TEACHER_ACCOUNT_ACCESS"?"A draft reason is prepared below. Edit it if needed; this links the existing invitation to Platform Support without changing membership.":"Context from the current school and page is retained with this conversation."}</p></div></div>{category!=="TEACHER_ACCOUNT_ACCESS"&&<label className="form-field"><span>Subject</span><input required minLength={3} maxLength={180} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="What do you need help with?"/></label>}<div className="form-grid"><label className="form-field"><span>Category</span>{category==="TEACHER_ACCOUNT_ACCESS"?<div className="form-readonly-value">Teacher account access review</div>:<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.filter(v=>v!=="TEACHER_ACCOUNT_ACCESS"&&(platform||v!=="PLATFORM_ANNOUNCEMENT")).map(v=><option key={v} value={v}>{label(v)}</option>)}</select>}</label>{category!=="TEACHER_ACCOUNT_ACCESS"&&<label className="form-field"><span>Priority</span><select value={priority} onChange={e=>setPriority(e.target.value)}>{["LOW","NORMAL","HIGH","URGENT"].map(v=><option key={v} value={v}>{v}</option>)}</select></label>}</div><label className="form-field"><span>{category==="TEACHER_ACCOUNT_ACCESS"?"Draft reason for Platform Support (edit before sending)":"Message"}</span><textarea required maxLength={category==="TEACHER_ACCOUNT_ACCESS"?3000:5000} value={body} onChange={e=>setBody(e.target.value)} placeholder={category==="TEACHER_ACCOUNT_ACCESS"?teacherAccountReviewDraft:"Describe the issue, including any error reference."}/></label><button className="primary-button" disabled={busy||!body.trim()||(category!=="TEACHER_ACCOUNT_ACCESS"&&!subject.trim())}><Send size={16} aria-hidden="true"/>{busy?"Opening…":category==="TEACHER_ACCOUNT_ACCESS"?"Send account review to Platform Support":platform?"Send to School":"Send to Platform Support"}</button></form>:<div className="message-empty"><CircleAlert size={28}/><h2>Select a conversation</h2><p>Your current role cannot start a new School–Platform request.</p></div>}
    </section>
   </div>}
  </div>;
}
