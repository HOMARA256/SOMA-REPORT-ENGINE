import { Save, School } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { reportableProfileFields, useSchoolSettings } from "./SchoolSettingsWorkspace";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { MediaAssetEditor } from "../../components/common/MediaAssetEditor";
import { safeInternalReturnTo } from "../../utils/safeNavigation";
import { supabase } from "../../config/supabaseClient";
import { currentUser } from "../../config/currentUser";
import { useSchoolContext } from "../context/SchoolContext";
import { ContactPlatformSupportButton } from "../notifications/MessageCentreLink";
const sections = [
    { title: "School identity", description: "Official registration and public identity.", fields: [
            { key: "officialName", label: "Official school name" }, { key: "shortName", label: "Short school name" }, { key: "motto", label: "School motto" }, { key: "slogan", label: "School slogan / tagline" }, { key: "schoolCode", label: "School code" }, { key: "registrationNumber", label: "Registration number" }, { key: "unebCentreNumber", label: "UNEB centre number" }, { key: "emisNumber", label: "EMIS number" }, { key: "schoolLevel", label: "School level" }, { key: "schoolType", label: "School type" }, { key: "ownership", label: "Ownership / Foundation" }, { key: "genderCategory", label: "Gender category" }, { key: "yearEstablished", label: "Year established" }, { key: "country", label: "Country" },
        ] },
    { title: "School location", description: "Physical and postal location information.", fields: [
            { key: "physicalAddress", label: "Physical address" }, { key: "postalAddress", label: "Postal address / P.O. Box" }, { key: "village", label: "Village / Zone" }, { key: "parish", label: "Parish" }, { key: "subcounty", label: "Sub-county / Division" }, { key: "district", label: "District / City" }, { key: "region", label: "Region" },
        ] },
    { title: "Contact information", description: "Official school contact channels.", fields: [
            { key: "primaryTelephone", label: "Primary telephone" }, { key: "secondaryTelephone", label: "Secondary telephone" }, { key: "alternativeTelephone", label: "Alternative telephone" }, { key: "officialEmail", label: "Official email", type: "email" }, { key: "alternativeEmail", label: "Alternative email", type: "email" }, { key: "website", label: "Website" },
        ] },
    { title: "School administration", description: "Prefer linked active users when secured user management is connected.", fields: [
            { key: "headTeacherName", label: "Head Teacher" }, { key: "deputyHeadTeacherName", label: "Deputy Head Teacher" }, { key: "directorOfStudiesName", label: "Director of Studies" }, { key: "academicContact", label: "School administrator / Academic contact" },
        ] },
    { title: "Academic identity", description: "Programmes and academic identifiers.", fields: [{ key: "programmesOffered", label: "Programmes offered" }] },
    { title: "Branding", description: "Public report identity and colours.", fields: [
            { key: "secondaryLogoUrl", label: "Secondary logo URL" }, { key: "sealUrl", label: "School seal URL" }, { key: "primaryColour", label: "Primary brand colour", type: "color" }, { key: "secondaryColour", label: "Secondary brand colour", type: "color" }, { key: "reportHeaderStyle", label: "Report header style" },
        ] },
    { title: "Optional school information", description: "Stored for authorised use; not automatically displayed on reports.", fields: [{ key: "additionalInformation", label: "Additional information" }] },
];
export function SchoolProfilePage() {
    const settings = useSchoolSettings();
    const schoolContext = useSchoolContext();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [draft, setDraft] = useState({ ...settings.profile });
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const returnTo = safeInternalReturnTo(searchParams.get("returnTo"), "/settings");
    const isDirty = JSON.stringify(draft) !== JSON.stringify(settings.profile);
    useEffect(() => {
        const warn = (event) => { if (isDirty)
            event.preventDefault(); };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [isDirty]);
    function save() {
        if (busy || !isDirty)
            return;
        setBusy(true);
        window.setTimeout(() => { settings.saveProfile(draft); setBusy(false); setNotice("School profile changes are applied for this session only. They are not saved to the database and will be lost after reload."); }, 150);
    }
    async function saveLogo(dataUrl) {
        const schoolId = schoolContext.schoolId;
        if (!supabase || !schoolId)
            return "An active school session is required.";
        if (currentUser.role !== "SCHOOL_ADMIN")
            return "Only this school's administrator can change its badge.";
        let stage = "decode image";
        let cleanupWarning = "";
        try {
            let logoPath = "";
            if (dataUrl) {
                const encoded = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/i);
                if (!encoded)
                    return "The selected badge image is not a supported PNG, JPEG, or WebP file. Choose it again and retry.";
                const binary = window.atob(encoded[2]);
                const bytes = new Uint8Array(binary.length);
                for (let index = 0; index < binary.length; index += 1)
                    bytes[index] = binary.charCodeAt(index);
                const blob = new Blob([bytes], { type: encoded[1].toLowerCase() });
                if (!["image/png", "image/webp", "image/jpeg"].includes(blob.type))
                    return "For safety, school badges must be PNG, JPEG, or WebP images.";
                const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
                logoPath = `${schoolId}/logo.${extension}`;
                stage = "upload image to school branding storage";
                const { error: uploadError } = await supabase.storage.from("school-branding").upload(logoPath, blob, { upsert: true, contentType: blob.type, cacheControl: "3600" });
                if (uploadError) {
                    const detail = uploadError.message.toLowerCase().includes("row-level security")
                        ? "Storage denied access to this school’s badge. Confirm that your current session is an active administrator for the selected school. If it is, refresh your sign-in and ask the platform administrator to verify the school-scoped Storage policies."
                        : uploadError.message;
                    return `The badge upload failed: ${detail}`;
                }
            }
            stage = "save badge for the selected school";
            const { data, error } = await supabase.functions.invoke("update-school-branding", { body: { schoolId, logoPath } });
            if (error)
                return `The badge could not be saved: ${error.message}`;
            if (data?.error)
                return `The badge could not be saved (${String(data.error)}).`;
            if (!data || typeof data.logoUrl !== "string" && data.logoUrl !== null)
                return "The server did not confirm the badge update. Refresh the school profile before retrying.";
            if (!dataUrl) {
                stage = "remove the old badge image";
                const { error: removeError } = await supabase.storage.from("school-branding").remove(["png", "jpg", "webp", "svg"].map((extension) => `${schoolId}/logo.${extension}`));
                if (removeError)
                    cleanupWarning = `The badge was removed from the school profile. The old storage file could not be cleaned up: ${removeError.message}`;
            }
            const next = { ...draft, logoUrl: data.logoUrl ?? "" };
            settings.saveProfile(next);
            setDraft(next);
            stage = "refresh the selected school workspace";
            await schoolContext.refresh();
            setNotice(cleanupWarning || (dataUrl ? "✓ School badge uploaded and synced across the selected school." : "✓ School badge removed from the selected school."));
            return null;
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : "Unknown image processing error.";
            return `The school badge failed during ${stage}: ${detail}`;
        }
    }
    function cancel() { if (isDirty)
        setConfirmDiscard(true);
    else
        navigate(returnTo); }
    return <div>
    <nav className="page-breadcrumbs" aria-label="Breadcrumb"><Link to="/settings">Settings</Link><span>School Profile</span></nav>
    <header className="page-heading"><div><span className="eyebrow">SETTINGS · SCHOOL</span><h1>School Profile</h1><p>Update school identity, contacts, administration and branding for this session. Profile text is not yet saved to the database.</p></div><div className="session-row-actions"><ContactPlatformSupportButton category="SCHOOL_PROFILE_AND_SETUP"/><Link className="secondary-button" to="/settings/report-card/header">Report header settings</Link></div></header>
    <p className="profile-scope-note"><School size={17}/> Complete a field here once. Report settings only store whether it is displayed; they never duplicate its text.</p>
    {notice && <p className="form-success-message" role="status">{notice}</p>}
    {currentUser.role === "SCHOOL_ADMIN" ? <MediaAssetEditor title="School badge" description="Upload this school's badge. It appears in the school workspace and on future report previews; it never uses the SOMA system logo." value={draft.logoUrl} circular saveLabel="Save badge" onSave={saveLogo} onRemove={() => saveLogo("")}/> : <section className="panel"><h2>School badge</h2><p>Only the School Administrator can upload or remove this school's badge.</p>{draft.logoUrl && <img className="school-branding-readonly-preview" src={draft.logoUrl} alt={`${draft.officialName || "School"} badge`}/>}</section>}
    <div className="school-profile-sections">{sections.map((section) => <section className="panel school-profile-section" key={section.title}><div className="panel-heading"><div><h2>{section.title}</h2><p>{section.description}</p></div></div><div className="school-profile-grid">{section.fields.map((field) => <label className="form-field" key={field.key}><span>{field.label}</span>{field.key === "additionalInformation" ? <textarea value={draft[field.key]} onChange={(event) => { setDraft((current) => ({ ...current, [field.key]: event.target.value })); setNotice(""); }}/> : <input type={field.type ?? "text"} value={draft[field.key]} onChange={(event) => { setDraft((current) => ({ ...current, [field.key]: event.target.value })); setNotice(""); }}/>} {field.key in reportableProfileFields && <small>Eligible for report-header display</small>}</label>)}</div></section>)}</div>
    <div className="settings-sticky-actions"><button type="button" className="secondary-button" onClick={cancel}>Cancel</button><button type="button" className="primary-button" disabled={busy || !isDirty} onClick={save}><Save size={16}/> {busy ? "Applying…" : "Apply for this session"}</button></div>
    <ConfirmDialog open={confirmDiscard} title="Discard unsaved changes?" confirmLabel="Discard & leave" destructive onCancel={() => setConfirmDiscard(false)} onConfirm={() => navigate(returnTo)}><p>You have changes that have not been saved. The safe option is to keep editing.</p></ConfirmDialog>
  </div>;
}
