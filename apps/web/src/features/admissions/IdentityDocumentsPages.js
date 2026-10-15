import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Archive, Download, FileUp, Printer, RefreshCw, Search, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "../../config/supabaseClient";
import { currentUser } from "../../config/currentUser";
import { useSchoolContext } from "../context/SchoolContext";
import { makeIdentityCardPdf } from "./identityCardPdf";
const fail = (error) => {
    if (error instanceof Error && error.message)
        return error.message;
    if (error && typeof error === "object") {
        const value = error;
        const detail = [value.message, value.details, value.hint]
            .filter((part) => typeof part === "string" && part.trim().length > 0)
            .join(" ");
        if (detail) {
            const domainErrors = {
                SCHOOL_ADMIN_REQUIRED: "Only an active school administrator can issue or manage cards for the selected school.",
                ID_CARD_PERSON_LIST_INVALID: "Select at least one eligible person before issuing cards.",
                ID_CARD_EXPIRY_INVALID: "Choose an expiry date that is today or later.",
                LEARNER_NOT_AVAILABLE: "That learner is no longer active in this school. Refresh the register and select an active learner.",
                STAFF_NOT_AVAILABLE: "That staff account is no longer active in this school. Refresh the register and select active staff.",
                CARD_SCHOOL_NOT_FOUND: "The selected school could not be confirmed. Re-select the school and refresh.",
                CARD_LEARNER_NOT_ACTIVE: "The learner must be active before an identity card can be issued.",
                CARD_CURRENT_ENROLMENT_REQUIRED: "This learner needs a current class enrolment before an identity card can be issued.",
                CARD_STAFF_NOT_ACTIVE: "The staff account must be active before an identity card can be issued.",
                CARD_STAFF_NUMBER_REQUIRED: "Add a staff number to this staff profile before issuing their card.",
                CARD_STAFF_NUMBER_NOT_UNIQUE_IN_SCHOOL: "Staff numbers must be unique within the school before cards can be issued.",
                STAFF_NUMBER_INVALID: "Enter a staff number of up to 80 characters.",
                STAFF_NUMBER_NOT_UNIQUE_IN_SCHOOL: "That staff number is already assigned in this school. Choose a unique number.",
                STAFF_MEMBER_NOT_AVAILABLE: "That staff profile is no longer active in this school. Refresh and try again.",
                CARD_STAFF_MEMBERSHIP_REQUIRED: "The staff member needs an active non-learner role in this school before card issuance.",
            };
            const domainCode = Object.keys(domainErrors).find((code) => new RegExp(`(^|\\W)${code}($|\\W)`).test(detail));
            if (domainCode)
                return domainErrors[domainCode];
            if (value.code === "42501")
                return "Your account does not have permission to manage ID cards for this school. Confirm the selected school and administrator access.";
            if (value.code === "PGRST202" || /function .* does not exist|could not find the function/i.test(detail))
                return `PostgREST cannot resolve an ID-card RPC (${detail}). Refresh the schema cache or confirm that the function migration is applied.`;
            return detail;
        }
    }
    return "The ID-card request failed without a database error message. Check the connection and refresh.";
};
async function callRpc(name, args) {
    if (!supabase)
        throw new Error("The school database is unavailable.");
    const result = await supabase.rpc(name, args);
    if (result.error)
        throw result.error;
    return result.data;
}
function VerificationQr({ token }) {
    const [url, setUrl] = useState("");
    const verificationUrl = useMemo(() => new URL(`/verify/id/${encodeURIComponent(token)}`, window.location.origin).toString(), [token]);
    useEffect(() => {
        let active = true;
        void QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 180 }).then((value) => { if (active)
            setUrl(value); }).catch(() => { if (active)
            setUrl(""); });
        return () => { active = false; };
    }, [verificationUrl]);
    return <div className="id-card__verification">{url ? <img src={url} alt="Scan to verify this card"/> : <span>Verification code unavailable</span>}<small>Scan to verify · {token.slice(0, 8).toUpperCase()}</small></div>;
}
function PrintableCard({ person, school, photoUrl, schoolContact }) {
    const staff = person.personType === "STAFF";
    const card = person.card;
    if (!card)
        return null;
    const printed = person.printSnapshot;
    const printedName = printed?.fullName || person.fullName;
    const printedSchool = printed?.schoolName || school.schoolName;
    const printedLogo = printed?.schoolLogo || school.schoolLogo;
    const initials = printedName.split(/\s+/).slice(0, 2).map((word) => word[0]).join("");
    return <div className="id-card-pair">
    <article className={`id-card id-card--front ${staff ? "id-card--staff" : "id-card--student"}`} aria-label={`${staff ? "Staff" : "Learner"} card front for ${printedName}`}>
      <header className="id-card__header"><div className="id-card__logo">{printedLogo ? <img src={printedLogo} alt=""/> : school.schoolShortName.slice(0, 2)}</div><div className="id-card__school"><strong>{printedSchool}</strong><small>OFFICIAL SCHOOL IDENTIFICATION</small></div><span className="id-card__type">{staff ? "STAFF" : "LEARNER"}</span></header>
      <strong className="id-card__kind">{staff ? "STAFF CREDENTIAL" : "LEARNER IDENTITY"}</strong>
      <div className="id-card__person">{photoUrl ? <img src={photoUrl} alt=""/> : <span aria-label="Photo unavailable">{initials}</span>}<div className="id-card__person-details"><h2>{printedName}</h2>{staff && <small>Employment no.</small>}<strong className="id-card__identifier">{printed?.identifier || (staff ? person.staffNumber || "Staff number pending" : person.admissionNumber)}</strong><p>{staff ? `Role: ${(printed?.role || person.role || "Staff member").replaceAll("_", " ")}` : `${printed?.className || person.className || "Class pending"}${printed?.streamName || person.streamName ? ` · ${printed?.streamName || person.streamName}` : ""}`}</p>{staff && <small>{person.telephone ? `Tel: ${person.telephone}` : "Telephone not recorded"}</small>}</div></div>
      <footer><span>{staff ? "STAFF" : `ACADEMIC YEAR ${printed?.academicYear || person.academicYear || "—"}`}</span><strong title={`Card reference ${card.reference}`}>CARD · {card.reference}</strong></footer>
    </article>
    <article className={`id-card id-card__back ${staff ? "id-card--staff" : "id-card--student"}`} aria-label={`${staff ? "Staff" : "Learner"} card back for ${printedName}`}>
      <header className="id-card__header"><div className="id-card__logo">{printedLogo ? <img src={printedLogo} alt=""/> : school.schoolShortName.slice(0, 2)}</div><div className="id-card__school"><strong>{printedSchool}</strong><small>ISSUED BY THE SCHOOL</small></div><span className="id-card__type">{staff ? "STAFF" : "LEARNER"}</span></header>
      <div className="id-card__back-content"><div><h2>Return if found</h2><p>Please return this card to <strong>{printedSchool}</strong>.</p>{schoolContact.address && <p>{schoolContact.address}</p>}{schoolContact.telephone && <p>Tel: {schoolContact.telephone}</p>}{schoolContact.email && <p>{schoolContact.email}</p>}<p className="id-card__dates">Issued {card.issueDate}{card.expiryDate ? ` · Expires ${card.expiryDate}` : ""}</p></div><VerificationQr token={card.verificationToken}/></div>
      <footer><span>Authorized signature <i aria-hidden="true"/></span><strong className="id-card__status">{card.status}</strong></footer>
    </article>
  </div>;
}
export function IdentityCardsPage() {
    const school = useSchoolContext();
    const [searchParams] = useSearchParams();
    const requestedPerson = searchParams.get("person") ?? "";
    const initialKind = searchParams.get("type") === "STAFF" ? "STAFF" : "LEARNER";
    const deepLinkHandled = useRef(false);
    const canManage = currentUser.permissions.includes("idcards.manage") || currentUser.role === "SCHOOL_ADMIN";
    const [people, setPeople] = useState({ learners: [], staff: [] });
    const [kind, setKind] = useState(initialKind);
    const [selected, setSelected] = useState([]);
    const [filterClass, setFilterClass] = useState("ALL");
    const [query, setQuery] = useState("");
    const [expiry, setExpiry] = useState("");
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [photoUrls, setPhotoUrls] = useState({});
    const [printCards, setPrintCards] = useState([]);
    const [pdfBusyId, setPdfBusyId] = useState("");
    const [staffNumberDrafts, setStaffNumberDrafts] = useState({});
    const [savingStaffId, setSavingStaffId] = useState("");
    const [schoolContact, setSchoolContact] = useState({});
    const issueRequestKey = useRef("");
    const issuing = useRef(false);
    useEffect(() => { if (!issuing.current)
        issueRequestKey.current = ""; }, [selected, kind, expiry, school.schoolId]);
    const load = useCallback(async () => {
        if (!school.schoolId || !canManage)
            return;
        setLoading(true);
        setError("");
        try {
            const result = await callRpc("get_school_id_card_register", { p_school_id: school.schoolId });
            setPeople({ learners: result?.learners ?? [], staff: result?.staff ?? [] });
        }
        catch (cause) {
            setError(fail(cause));
        }
        finally {
            setLoading(false);
        }
    }, [school.schoolId, canManage]);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        if (!school.schoolId || !supabase)
            return;
        let active = true;
        void supabase.from("schools").select("telephone,email,address").eq("id", school.schoolId).single().then(({ data }) => { if (active && data)
            setSchoolContact({ telephone: data.telephone ?? undefined, email: data.email ?? undefined, address: data.address ?? undefined }); });
        return () => { active = false; };
    }, [school.schoolId]);
    useEffect(() => {
        if (deepLinkHandled.current || !requestedPerson)
            return;
        if ((initialKind === "STAFF" ? people.staff : people.learners).some((person) => person.id === requestedPerson)) {
            setKind(initialKind);
            setSelected([requestedPerson]);
            deepLinkHandled.current = true;
        }
    }, [people, requestedPerson, initialKind]);
    useEffect(() => {
        let alive = true;
        const rows = [...people.learners, ...people.staff].filter((item) => item.photoPath);
        void Promise.all(rows.map(async (person) => {
            const { data, error: urlError } = await supabase?.storage.from("profile-photos").createSignedUrl(person.photoPath, 300) ?? {};
            if (!urlError && data?.signedUrl && alive)
                setPhotoUrls((current) => ({ ...current, [person.id]: data.signedUrl }));
        }));
        return () => { alive = false; };
    }, [people]);
    const all = kind === "LEARNER" ? people.learners : people.staff;
    const classes = [...new Set(people.learners.map((item) => item.className).filter(Boolean))];
    const filtered = useMemo(() => all.filter((item) => (!query || `${item.fullName} ${item.admissionNumber ?? ""} ${item.staffNumber ?? ""}`.toLowerCase().includes(query.toLowerCase())) && (kind !== "LEARNER" || filterClass === "ALL" || item.className === filterClass)), [all, query, kind, filterClass]);
    const selectedPeople = all.filter((person) => selected.includes(person.id));
    const selectedCardsReady = selectedPeople.length > 0 && selectedPeople.every((person) => person.card?.status === "ACTIVE");
    const selectedMissingStaffNumber = kind === "STAFF" && selectedPeople.some((person) => !person.staffNumber?.trim());
    async function saveStaffNumber(person) {
        if (!school.schoolId)
            return;
        const staffNumber = (staffNumberDrafts[person.id] ?? "").trim();
        if (!staffNumber) {
            setError("Enter a staff number before saving.");
            return;
        }
        setSavingStaffId(person.id);
        setError("");
        setNotice("");
        try {
            await callRpc("set_school_identity_card_staff_number", { p_school_id: school.schoolId, p_staff_id: person.id, p_staff_number: staffNumber });
            setStaffNumberDrafts((current) => { const next = { ...current }; delete next[person.id]; return next; });
            setSelected((current) => current.filter((id) => id !== person.id));
            setNotice(`Staff number saved for ${person.fullName}. You can now select them and issue their card.`);
            await load();
        }
        catch (cause) {
            setError(fail(cause));
        }
        finally {
            setSavingStaffId("");
        }
    }
    async function previewSelectedCards() {
        if (!school.schoolId || !selectedCardsReady)
            return;
        setLoading(true);
        setError("");
        setNotice("");
        try {
            const cards = await Promise.all(selectedPeople.map(async (person) => {
                const snapshot = await callRpc("get_school_identity_card_print_snapshot", { p_school_id: school.schoolId, p_card_id: person.card.id });
                if (snapshot.needsReissue)
                    throw new Error(`${person.fullName}'s card details have changed. Reissue that card before printing.`);
                return { ...person, personType: kind, printSnapshot: snapshot };
            }));
            setPrintCards(cards);
            setNotice(`${cards.length} selected card${cards.length === 1 ? "" : "s"} ready. Only these cards will appear in the print dialog.`);
            requestAnimationFrame(() => document.querySelector(".identity-print-grid")?.scrollIntoView({ behavior: "smooth", block: "center" }));
        }
        catch (cause) {
            setPrintCards([]);
            setError(fail(cause));
        }
        finally {
            setLoading(false);
        }
    }
    async function issue() {
        if (!school.schoolId || selected.length === 0 || issuing.current)
            return;
        issuing.current = true;
        if (!issueRequestKey.current)
            issueRequestKey.current = crypto.randomUUID();
        setLoading(true);
        setError("");
        setNotice("");
        try {
            const cards = await callRpc("issue_school_identity_cards_once", { p_school_id: school.schoolId, p_person_type: kind, p_person_ids: selected, p_expiry_date: expiry || null, p_request_key: issueRequestKey.current });
            const issued = (Array.isArray(cards) ? cards : []).map((card) => {
                const person = all.find((item) => item.id === card.personId);
                return person ? { ...person, personType: kind, photoPath: person.photoPath, card: { id: card.id, reference: card.cardReference, verificationToken: card.verificationToken, status: card.status, issueDate: card.issueDate, expiryDate: card.expiryDate } } : null;
            }).filter(Boolean);
            const snapshots = await Promise.allSettled(issued.map(async (person) => ({ ...person, printSnapshot: await callRpc("get_school_identity_card_print_snapshot", { p_school_id: school.schoolId, p_card_id: person.card.id }) })));
            const ready = snapshots.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
            setPrintCards(ready.length === issued.length ? ready : []);
            setSelected([]);
            issueRequestKey.current = "";
            setNotice(ready.length === issued.length ? `${issued.length} card(s) issued. Review both sides before printing.` : `${issued.length} card(s) were issued, but the print snapshots could not load. Refresh the register; do not issue again until you confirm the existing cards.`);
            await load();
            for (const person of ready)
                await cardPdf(person, "archive");
        }
        catch (cause) {
            setError(fail(cause));
        }
        finally {
            issuing.current = false;
            setLoading(false);
        }
    }
    async function cardAction(card, status) {
        if (!school.schoolId)
            return;
        try {
            await callRpc("set_school_identity_card_status", { p_school_id: school.schoolId, p_card_id: card.id, p_status: status });
            setNotice(`Card ${card.reference} marked ${status}.`);
            await load();
        }
        catch (cause) {
            setError(fail(cause));
        }
    }
    async function previewCard(person) {
        if (!school.schoolId || !person.card)
            return;
        setLoading(true);
        setError("");
        try {
            const snapshot = await callRpc("get_school_identity_card_print_snapshot", { p_school_id: school.schoolId, p_card_id: person.card.id });
            if (snapshot.needsReissue)
                throw new Error("This card contains outdated information. Select the person and reissue a card before printing.");
            setPrintCards([{ ...person, personType: kind, printSnapshot: snapshot }]);
            requestAnimationFrame(() => document.querySelector(".identity-print-grid")?.scrollIntoView({ behavior: "smooth", block: "center" }));
        }
        catch (cause) {
            setError(fail(cause));
        }
        finally {
            setLoading(false);
        }
    }
    async function print() {
        if (!printCards.length)
            return;
        await document.fonts?.ready;
        const images = Array.from(document.querySelectorAll(".identity-print-grid img"));
        await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
        window.print();
    }
    async function cardPdf(person, action) {
        if (!school.schoolId || !person.card || !person.printSnapshot || !supabase)
            return;
        const card = person.card;
        setPdfBusyId(card.id);
        setError("");
        setNotice("");
        let uploadedPath = "";
        let documentSaved = false;
        try {
            let stored = await callRpc("get_school_identity_card_document", { p_school_id: school.schoolId, p_card_id: card.id });
            if (!stored) {
                if (person.printSnapshot.needsReissue)
                    throw new Error("This card is out of date. Reissue it before generating a print PDF.");
                const { data: schoolProfile, error: profileError } = await supabase.from("schools").select("address,telephone,email").eq("id", school.schoolId).single();
                if (profileError)
                    throw profileError;
                const bytes = await makeIdentityCardPdf({
                    personType: person.personType || kind,
                    schoolName: person.printSnapshot.schoolName || school.schoolName,
                    schoolLogo: person.printSnapshot.schoolLogo || school.schoolLogo,
                    schoolPhone: schoolProfile.telephone ?? "", schoolEmail: schoolProfile.email ?? "",
                    schoolAddress: schoolProfile.address ?? "",
                    fullName: person.printSnapshot.fullName, identifier: person.printSnapshot.identifier,
                    role: person.printSnapshot.role, department: person.printSnapshot.department, staffTelephone: person.telephone,
                    className: person.printSnapshot.className, streamName: person.printSnapshot.streamName,
                    academicYear: person.printSnapshot.academicYear, photoUrl: photoUrls[person.id],
                    reference: card.reference, verificationToken: card.verificationToken,
                    verificationBaseUrl: window.location.origin, issueDate: card.issueDate, expiryDate: card.expiryDate,
                });
                const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
                uploadedPath = `schools/${school.schoolId}/documents/${person.personType === "STAFF" ? "staff" : "learners"}/${person.id}/documents/${crypto.randomUUID()}`;
                const { error: uploadError } = await supabase.storage.from("school-document-library").upload(uploadedPath, blob, { contentType: "application/pdf", upsert: false });
                if (uploadError)
                    throw uploadError;
                const documentId = await callRpc("save_school_document_library_item", {
                    p_school_id: school.schoolId, p_document_id: null, p_category: "INTERNAL_ADMINISTRATION",
                    p_title: `${person.personType === "STAFF" ? "Staff" : "Learner"} ID card ${card.reference}`,
                    p_description: "Immutable front/back print snapshot", p_linked_entity_type: person.personType || kind,
                    p_linked_entity_id: person.id, p_visibility: "SCHOOL_ADMIN_ONLY", p_storage_path: uploadedPath,
                    p_file_name: `${card.reference.replace(/[^A-Za-z0-9_-]/g, "-")}.pdf`,
                    p_mime_type: "application/pdf", p_file_size: blob.size,
                });
                documentSaved = true;
                await callRpc("register_school_identity_card_document", { p_school_id: school.schoolId, p_card_id: card.id, p_document_id: documentId });
                stored = await callRpc("get_school_identity_card_document", { p_school_id: school.schoolId, p_card_id: card.id });
            }
            if (!stored?.storagePath)
                throw new Error("The card PDF was saved, but its archive record could not be loaded. Refresh and retry.");
            if (action === "archive") {
                setNotice(`Card ${card.reference} issued and its two-sided print PDF archived. Review both sides before printing.`);
                return;
            }
            const { data: signed, error: signError } = await supabase.storage.from("school-document-library").createSignedUrl(stored.storagePath, 120);
            if (signError || !signed?.signedUrl)
                throw signError ?? new Error("The protected PDF could not be opened.");
            if (action === "preview")
                window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
            else {
                const response = await fetch(signed.signedUrl);
                if (!response.ok)
                    throw new Error("The protected PDF download failed.");
                const url = URL.createObjectURL(await response.blob());
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = stored.fileName || `${card.reference}.pdf`;
                document.body.append(anchor);
                anchor.click();
                anchor.remove();
                setTimeout(() => URL.revokeObjectURL(url), 30000);
                await callRpc("record_school_identity_card_download", { p_school_id: school.schoolId, p_card_id: card.id });
            }
            setNotice(`Card ${card.reference} PDF is archived for this school. Open it to print at actual size (85.6 × 54 mm).`);
        }
        catch (cause) {
            if (uploadedPath && !documentSaved)
                void supabase.storage.from("school-document-library").remove([uploadedPath]);
            setError(documentSaved ? `${fail(cause)} The PDF was saved in Document Library; do not reissue the card. Refresh and retry.` : fail(cause));
        }
        finally {
            setPdfBusyId("");
        }
    }
    async function historicalPdf(cardId) {
        if (!school.schoolId || !supabase)
            return;
        setPdfBusyId(cardId);
        setError("");
        try {
            const stored = await callRpc("get_school_identity_card_document", { p_school_id: school.schoolId, p_card_id: cardId });
            if (!stored?.storagePath)
                throw new Error("No archived PDF exists for this card. Earlier cards may predate print-PDF archiving.");
            const { data, error: signError } = await supabase.storage.from("school-document-library").createSignedUrl(stored.storagePath, 120);
            if (signError || !data?.signedUrl)
                throw signError ?? new Error("The protected PDF could not be opened.");
            window.open(data.signedUrl, "_blank", "noopener,noreferrer");
            await callRpc("record_school_identity_card_download", { p_school_id: school.schoolId, p_card_id: cardId });
        }
        catch (cause) {
            setError(fail(cause));
        }
        finally {
            setPdfBusyId("");
        }
    }
    if (!canManage)
        return <main className="page-content"><div className="admissions-card"><h1>ID card access required</h1><p>Only authorized school administrators can issue and manage identity cards.</p></div></main>;
    return <main className="page-content identity-page">
    <header className="page-heading"><div><span className="eyebrow">SCHOOL CONTROL CENTRE</span><h1>ID Cards</h1><p>Issue, reissue, print, and track school cards using real learner and staff records.</p></div><button className="button button--secondary" onClick={() => void load()}><RefreshCw size={16}/> Refresh</button></header>
    {error && <div className="admissions-alert" role="alert">{error}</div>}{notice && <div className="admissions-notice" role="status">{notice}</div>}
    <section className="admissions-card"><div className="identity-toolbar"><div className="admissions-segment"><button className={kind === "LEARNER" ? "is-active" : ""} onClick={() => { setKind("LEARNER"); setSelected([]); setPrintCards([]); }}>Learner ID cards</button><button className={kind === "STAFF" ? "is-active" : ""} onClick={() => { setKind("STAFF"); setSelected([]); setPrintCards([]); }}>Staff ID cards</button></div><label className="admissions-search"><Search size={16}/><input placeholder="Find a person" value={query} onChange={(e) => { setQuery(e.target.value); setSelected([]); setPrintCards([]); }}/></label>{kind === "LEARNER" && <select value={filterClass} onChange={(e) => { setFilterClass(e.target.value); setSelected([]); setPrintCards([]); }}><option value="ALL">All classes</option>{classes.map((name) => <option key={name}>{name}</option>)}</select>}</div>
      <div className="identity-batch"><span>{selected.length} selected · selection applies to the visible people filter.{selectedMissingStaffNumber && <small className="identity-selection-warning">Save a unique staff number on each selected staff profile before issuing.</small>}</span><label>Expires (optional)<input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)}/></label><div className="identity-batch__actions"><button className="button button--secondary" disabled={!selectedCardsReady || loading} onClick={() => void previewSelectedCards()}><Printer size={16}/> Preview selected active cards</button><button className="button button--primary" disabled={!selected.length || selectedMissingStaffNumber || loading} onClick={() => void issue()}>Issue / reissue selected</button></div></div>
      {kind === "STAFF" && filtered.some((person) => !person.staffNumber?.trim()) && <p className="admissions-help"><ShieldCheck size={16}/> Staff ID cards need a unique staff number. Add it here; the number is saved to the staff profile for this school.</p>}
      <div className="identity-people">{filtered.map((person) => <div className="identity-person" key={person.id}><input type="checkbox" aria-label={`Select ${person.fullName}`} checked={selected.includes(person.id)} onChange={(e) => { setSelected(e.target.checked ? [...selected, person.id] : selected.filter((id) => id !== person.id)); setPrintCards([]); }}/><span className="identity-avatar">{photoUrls[person.id] ? <img src={photoUrls[person.id]} alt=""/> : person.fullName.split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span><span className="identity-person__details"><strong>{person.fullName}</strong><small>{kind === "LEARNER" ? `${person.admissionNumber ?? "No admission number"} · ${person.className ?? "No class"}${person.streamName ? ` / ${person.streamName}` : ""}` : `${person.staffNumber ?? "No staff number"} · ${person.department ?? person.role ?? "Staff"}`}</small>{kind === "STAFF" && !person.staffNumber?.trim() && <span className="identity-staff-number-editor"><input aria-label={`Staff number for ${person.fullName}`} maxLength={80} placeholder="Enter staff number" value={staffNumberDrafts[person.id] ?? ""} onChange={(event) => setStaffNumberDrafts((current) => ({ ...current, [person.id]: event.target.value }))}/><button type="button" className="button button--secondary" disabled={savingStaffId === person.id || !staffNumberDrafts[person.id]?.trim()} onClick={() => void saveStaffNumber(person)}>{savingStaffId === person.id ? "Saving…" : "Save number"}</button></span>}</span><span className={`admissions-status-tag status-${(person.card?.status ?? "DRAFT").toLowerCase()}`}>{person.card?.status ?? "NO CARD"}</span></div>)}{filtered.length === 0 && <p className="admissions-empty">{loading ? "Loading records…" : "No people match those filters."}</p>}</div>
    </section>
    {printCards.length > 0 && <section className="admissions-card print-actions"><div className="identity-preview__heading"><div><h2>Card preview · Front and back</h2><p>{printCards.length} selected ID{printCards.length === 1 ? "" : "s"} · Review both sides before printing.</p></div><button type="button" className="button button--secondary" onClick={() => setPrintCards([])}>Clear preview</button></div><div className="admissions-actions"><button className="button button--primary" onClick={() => void print()}><Printer size={16}/> Print {printCards.length} selected ID{printCards.length === 1 ? "" : "s"}</button>{printCards.map((person) => <span className="identity-pdf-action" key={person.card.id}><strong>{person.fullName}</strong><button className="button button--secondary" disabled={!!pdfBusyId} onClick={() => void cardPdf(person, "preview")}>Preview PDF</button><button className="button button--secondary" disabled={!!pdfBusyId} onClick={() => void cardPdf(person, "download")}><Download size={16}/>{pdfBusyId === person.card.id ? "Preparing…" : "Download PDF"}</button></span>)}</div></section>}
    <section className={`identity-print-grid ${printCards.length ? "identity-print-grid--preview" : ""}`} aria-label="Printable identity cards">{printCards.map((person) => <PrintableCard key={person.card?.id ?? person.id} person={person} school={school} photoUrl={photoUrls[person.id]} schoolContact={schoolContact}/>)}</section>
    <section className="admissions-card"><h2>Previously issued cards</h2><div className="table-wrapper"><table><thead><tr><th>Person</th><th>Reference</th><th>Status</th><th>Issued</th><th>Expiry</th><th>Actions</th></tr></thead><tbody>{all.flatMap((person) => (person.cardHistory ?? (person.card ? [{ id: person.card.id, reference: person.card.reference, status: person.card.status, issueDate: person.card.issueDate, expiryDate: person.card.expiryDate }] : [])).map((history) => { const actionCard = person.card?.id === history.id ? person.card : { id: history.id, reference: history.reference, verificationToken: "", status: history.status, issueDate: history.issueDate, expiryDate: history.expiryDate }; return <tr key={history.id}><td>{person.fullName}</td><td>{history.reference}</td><td>{history.status}</td><td>{history.issueDate}</td><td>{history.expiryDate ?? "—"}</td><td><button className="button button--secondary" disabled={!!pdfBusyId} onClick={() => void historicalPdf(history.id)}>Archived PDF</button>{history.status === "ACTIVE" && <div className="admissions-actions">{person.card?.id === history.id && <button className="button button--secondary" disabled={loading} onClick={() => void previewCard(person)}>Preview</button>}<button className="button button--secondary" onClick={() => void cardAction(actionCard, "EXPIRED")}>Expire</button><button className="button button--secondary" onClick={() => void cardAction(actionCard, "REVOKED")}>Revoke</button></div>}</td></tr>; }))}</tbody></table></div>{all.every((person) => (person.cardHistory ?? []).length === 0) && <p className="admissions-empty">No identity cards have been issued for this filter.</p>}</section>
  </main>;
}
const categories = ["SCHOOL_POLICY", "CIRCULAR", "SCHOOL_FORM", "LEARNER_ADMISSION", "LEARNER_TRANSFER", "STAFF_EMPLOYMENT", "STAFF_QUALIFICATION", "ACADEMIC_RESOURCE", "PAST_PAPER", "TEACHER_LESSON_RESOURCE", "INTERNAL_ADMINISTRATION"];
const visibilities = ["SCHOOL_ADMIN_ONLY", "AUTHORIZED_STAFF", "TEACHERS", "LEARNERS", "PARENTS", "PUBLIC_ADMISSION_APPLICANT"];
export function DocumentLibraryPage() {
    const school = useSchoolContext();
    const canManage = currentUser.permissions.includes("documents.manage") || currentUser.role === "SCHOOL_ADMIN";
    const [items, setItems] = useState([]);
    const [filter, setFilter] = useState("ALL");
    const [query, setQuery] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [versioning, setVersioning] = useState(null);
    const [form, setForm] = useState({ category: "SCHOOL_POLICY", title: "", description: "", visibility: "SCHOOL_ADMIN_ONLY", linkedEntityType: "", linkedEntityId: "" });
    const [file, setFile] = useState(null);
    const load = useCallback(async () => { if (!school.schoolId)
        return; setBusy(true); setError(""); try {
        const data = await callRpc("get_school_document_library", { p_school_id: school.schoolId });
        setItems(Array.isArray(data) ? data : []);
    }
    catch (cause) {
        setError(fail(cause));
    }
    finally {
        setBusy(false);
    } }, [school.schoolId]);
    useEffect(() => { void load(); }, [load]);
    const shown = items.filter((item) => (filter === "ALL" || item.category === filter) && (!query || `${item.title} ${item.fileName} ${item.category}`.toLowerCase().includes(query.toLowerCase())));
    async function upload(event) {
        event.preventDefault();
        if (!school.schoolId || !file)
            return;
        setBusy(true);
        setError("");
        setNotice("");
        let uploadedPath = "";
        let saved = false;
        try {
            const id = crypto.randomUUID();
            const categoryPath = form.linkedEntityType === "LEARNER" ? `learners/${form.linkedEntityId}/documents/${id}` : form.linkedEntityType === "STAFF" ? `staff/${form.linkedEntityId}/documents/${id}` : form.category.includes("ACADEMIC") || form.category === "PAST_PAPER" || form.category === "TEACHER_LESSON_RESOURCE" ? `academic-resources/${id}` : `school/${id}`;
            uploadedPath = `schools/${school.schoolId}/documents/${categoryPath}`;
            const { error: uploadError } = await supabase.storage.from("school-document-library").upload(uploadedPath, file, { contentType: file.type, upsert: false });
            if (uploadError)
                throw uploadError;
            await callRpc("save_school_document_library_item", { p_school_id: school.schoolId, p_document_id: versioning?.id ?? null, p_category: form.category, p_title: form.title, p_description: form.description, p_linked_entity_type: form.linkedEntityType || null, p_linked_entity_id: form.linkedEntityId || null, p_visibility: form.visibility, p_storage_path: uploadedPath, p_file_name: file.name, p_mime_type: file.type, p_file_size: file.size });
            saved = true;
            setNotice(versioning ? `Version ${versioning.versionNumber + 1} saved; the previous version is archived.` : "Protected document saved. The file remains in private storage.");
            setFile(null);
            setVersioning(null);
            setForm({ category: "SCHOOL_POLICY", title: "", description: "", visibility: "SCHOOL_ADMIN_ONLY", linkedEntityType: "", linkedEntityId: "" });
            try {
                await load();
            }
            catch {
                setNotice("Document saved. The register could not refresh; use Refresh to reload it.");
            }
        }
        catch (cause) {
            if (uploadedPath && !saved)
                void supabase?.storage.from("school-document-library").remove([uploadedPath]);
            setError(fail(cause));
        }
        finally {
            setBusy(false);
        }
    }
    function beginVersion(item) { setVersioning(item); setForm({ category: item.category, title: item.title, description: item.description ?? "", visibility: item.visibilityLevel, linkedEntityType: item.linkedEntityType ?? "", linkedEntityId: item.linkedEntityId ?? "" }); setFile(null); document.querySelector(".document-upload")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
    async function view(item) { const { data, error: signError } = await supabase.storage.from("school-document-library").createSignedUrl(item.storagePath, 90); if (signError) {
        setError(fail(signError));
        return;
    } window.open(data.signedUrl, "_blank", "noopener,noreferrer"); }
    async function archive(item) { try {
        await callRpc("archive_school_document_library_item", { p_school_id: school.schoolId, p_document_id: item.id });
        setNotice("Document archived; its record remains for audit.");
        await load();
    }
    catch (cause) {
        setError(fail(cause));
    } }
    return <main className="page-content document-page"><header className="page-heading"><div><span className="eyebrow">SCHOOL CONTROL CENTRE</span><h1>Document Library</h1><p>School, learner, staff, and academic files in private, role-scoped storage.</p></div><button className="button button--secondary" onClick={() => void load()}><RefreshCw size={16}/> Refresh</button></header>
    {error && <div className="admissions-alert" role="alert">{error}</div>}{notice && <div className="admissions-notice" role="status">{notice}</div>}
    {canManage && <form className="admissions-card document-upload" onSubmit={upload}><h2>{versioning ? `Upload version ${versioning.versionNumber + 1}` : "Upload a protected document"}</h2>{versioning && <p>Replacing version {versioning.versionNumber} of “{versioning.title}”. The older version remains archived for audit.</p>}<div className="admissions-grid"><label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, visibility: form.visibility === "PUBLIC_ADMISSION_APPLICANT" && e.target.value !== "SCHOOL_FORM" ? "SCHOOL_ADMIN_ONLY" : form.visibility })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Visibility<select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>{visibilities.filter((item) => item !== "PUBLIC_ADMISSION_APPLICANT" || form.category === "SCHOOL_FORM").map((item) => <option key={item}>{item}</option>)}</select></label><label>Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/></label><label>Linked entity type<select value={form.linkedEntityType} onChange={(e) => setForm({ ...form, linkedEntityType: e.target.value })}><option value="">School-level document</option><option value="LEARNER">Learner</option><option value="STAFF">Staff</option></select></label><label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></label><label>{form.linkedEntityType ? `${form.linkedEntityType} record ID` : "File"}{form.linkedEntityType ? <input required value={form.linkedEntityId} onChange={(e) => setForm({ ...form, linkedEntityId: e.target.value })}/> : <input required type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)}/>}</label>{form.linkedEntityType && <label>File<input required type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)}/></label>}</div><p className="admissions-help"><ShieldCheck size={16}/> Maximum 50 MB. Files remain in private Storage. Public admission forms receive only short-lived signed links after explicit publication.</p><div className="admissions-actions"><button className="button button--primary" disabled={busy || !file}><FileUp size={17}/>{versioning ? "Save new version" : "Upload document"}</button>{versioning && <button type="button" className="button button--secondary" onClick={() => { setVersioning(null); setForm({ category: "SCHOOL_POLICY", title: "", description: "", visibility: "SCHOOL_ADMIN_ONLY", linkedEntityType: "", linkedEntityId: "" }); }}>Cancel version</button>}</div></form>}
    <section className="admissions-card"><div className="admissions-card__head"><h2>Available to your role</h2><span>{shown.length} files</span></div><div className="admissions-filters"><label><Search size={16}/><input placeholder="Search title or filename" value={query} onChange={(e) => setQuery(e.target.value)}/></label><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ALL">All categories visible to me</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div><div className="table-wrapper"><table><thead><tr><th>Document</th><th>Category</th><th>Visibility</th><th>Version</th><th>Uploaded</th><th>Owner</th><th>Actions</th></tr></thead><tbody>{shown.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.fileName} · {Math.ceil(item.fileSize / 1024)} KB</small></td><td>{item.category.replaceAll("_", " ")}</td><td>{item.visibilityLevel.replaceAll("_", " ")}</td><td>v{item.versionNumber}</td><td>{new Date(item.uploadedAt).toLocaleDateString()}</td><td>{item.uploadedBy}</td><td><div className="admissions-actions"><button className="button button--secondary" onClick={() => void view(item)}><Download size={15}/> Secure view</button>{canManage && <><button className="button button--secondary" onClick={() => beginVersion(item)}>New version</button><button className="button button--secondary" onClick={() => void archive(item)}><Archive size={15}/> Archive</button></>}</div></td></tr>)}</tbody></table></div>{shown.length === 0 && <p className="admissions-empty">{busy ? "Loading documents…" : "No documents match this filter or your role has no access."}</p>}</section>
  </main>;
}
export function PublicIdVerificationPage() {
    const { token = "" } = useParams();
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    useEffect(() => { let active = true; setLoading(true); setError(""); setResult(null); void callRpc("verify_school_identity_card", { p_verification_token: token }).then((value) => { if (active)
        setResult(value); }).catch((cause) => { if (active)
        setError(fail(cause)); }).finally(() => { if (active)
        setLoading(false); }); return () => { active = false; }; }, [token]);
    return <main className="admissions-public"><section className="admissions-card"><span className="eyebrow">CARD VERIFICATION</span><h1>{result?.schoolName ?? "Identity card verification"}</h1>{loading && <p role="status">Checking this card with the issuing school…</p>}{error && <div className="admissions-alert" role="alert">Verification is temporarily unavailable. Please retry later.</div>}{!loading && !error && !result && <div className="admissions-alert" role="status"><strong>Card not found</strong><p>This verification code is not registered.</p></div>}{result && <><h2 className={result.valid ? "verification-valid" : "verification-invalid"}>{result.valid ? "VALID CARD" : String(result.cardStatus ?? "CARD NOT VALID").replaceAll("_", " ")}</h2><p>{result.fullName}</p><p>{result.personType === "LEARNER" ? `${result.admissionOrStaffNumber} · ${result.className ?? ""} ${result.streamName ?? ""}` : `${result.admissionOrStaffNumber ?? ""} · ${result.roleOrDepartment ?? ""}`}</p><p>Issued {result.issueDate}{result.expiryDate ? ` · Expires ${result.expiryDate}` : ""}</p><p className="admissions-help"><ShieldCheck size={16}/> Verification contains only the minimum card details; it never publishes private documents or contact information.</p></>}</section></main>;
}
