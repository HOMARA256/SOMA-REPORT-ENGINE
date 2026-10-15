import { ArrowRight, Building2, CheckCircle2, MapPin, Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadUgandaLocationChildren, saveSchoolRegistrationDraft, usePlatformWorkspace, } from "./PlatformWorkspace";
const steps = ["School Identity", "Location and Address", "Academic Profile", "Subscription and Billing", "Primary School Admin", "Review and Register"];
const today = new Date().toISOString().slice(0, 10);
function schoolCode(name) {
    return name.normalize("NFKD").replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((word) => word[0]).join("").toUpperCase().slice(0, 12);
}
export function ConnectedSchoolRegistration() {
    const workspace = usePlatformWorkspace();
    const [step, setStep] = useState(1);
    const [busy, setBusy] = useState(false);
    const [draftBusy, setDraftBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [codeEdited, setCodeEdited] = useState(false);
    const [registeredSchoolId, setRegisteredSchoolId] = useState("");
    const [locations, setLocations] = useState({});
    const [form, setForm] = useState({
        draftId: "", name: "", shortName: "", code: "", schoolLevel: "UCE_ONLY", schoolType: "Secondary School", email: "", phone: "", website: "", emisNumber: "",
        countryId: "", regionId: "", subRegionId: "", districtCityId: "", countyDivisionId: "", localGovernmentId: "", parishWardId: "", villageZoneId: "", district: "",
        address: "", plotRoad: "", landmark: "", postalAddress: "", latitude: "", longitude: "", academicYear: new Date().getFullYear(), currentTerm: "TERM_I", curriculumStartYear: "",
        planCode: "OURSCHOOL_TERMLY_V2", billingCadence: "TERMLY", subscriptionStart: today, trialStart: "", trialEnd: "", activeLearners: 0, supportApproval: "", paymentStatus: "PENDING",
        notes: "", requiresMfa: false, adminName: "", adminEmail: "", adminPhone: "", adminJobTitle: "School Administrator",
    });
    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const chain = [form.countryId, form.regionId, form.subRegionId, form.districtCityId, form.countyDivisionId];
    useEffect(() => { let live = true; loadUgandaLocationChildren(null).then((items) => { if (!live)
        return; setLocations((current) => ({ ...current, root: items })); const uganda = items.find((item) => item.code === "UG"); if (uganda)
        setForm((current) => current.countryId ? current : { ...current, countryId: uganda.id }); }).catch(() => setError("The Uganda Location Catalogue could not be loaded.")); return () => { live = false; }; }, []);
    useEffect(() => {
        let live = true;
        const missing = chain.filter((parent, index) => Boolean(parent) && !locations[parent] && chain.indexOf(parent) === index);
        if (!missing.length)
            return () => { live = false; };
        Promise.all(missing.map(async (parent) => [parent, await loadUgandaLocationChildren(parent)]))
            .then((loaded) => { if (live)
            setLocations((current) => ({ ...current, ...Object.fromEntries(loaded) })); })
            .catch(() => setError("A location level could not be loaded. Refresh the page and try again."));
        return () => { live = false; };
    }, [form.countryId, form.regionId, form.subRegionId, form.districtCityId, form.countyDivisionId, locations]);
    const locationNames = useMemo(() => Object.values(locations).flat().reduce((map, item) => { map[item.id] = item.name; return map; }, {}), [locations]);
    const preview = [form.plotRoad, form.landmark, locationNames[form.localGovernmentId], locationNames[form.countyDivisionId], locationNames[form.districtCityId], "Uganda"].filter(Boolean).join(", ");
    const generatedUsername = `${form.name.normalize("NFKD").replace(/[’']/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "school"}.admin`;
    const valid = step === 1 ? Boolean(form.name && form.code && form.schoolType && form.email && form.phone)
        : step === 2 ? Boolean(form.countryId && form.regionId && form.districtCityId && form.localGovernmentId && form.address)
            : step === 3 ? Boolean(form.academicYear && form.currentTerm)
                : step === 4 ? Boolean(form.planCode && form.subscriptionStart && form.activeLearners >= 0)
                    : step === 5 ? Boolean(form.adminName && form.adminEmail && form.adminPhone && form.adminJobTitle) : true;
    function choose(key, value, clear = []) { setForm((current) => { const next = { ...current, [key]: value }; clear.forEach((field) => { next[field] = ""; }); return next; }); }
    async function saveDraft() { setDraftBusy(true); setError(""); setMessage(""); try {
        const id = await saveSchoolRegistrationDraft(form.draftId, step, form);
        set("draftId", id);
        setMessage("Draft saved. You can safely return to it later.");
    }
    catch (reason) {
        setError(reason instanceof Error ? reason.message : "Draft could not be saved.");
    }
    finally {
        setDraftBusy(false);
    } }
    async function submit(event) { event.preventDefault(); setError(""); setMessage(""); if (step < 6) {
        setStep(step + 1);
        return;
    } setBusy(true); try {
        const schoolId = await workspace.registerSchool(form);
        setRegisteredSchoolId(schoolId);
        setMessage("School registration completed. The tenant, billing record, administrator invitation and onboarding checklist are now connected.");
    }
    catch (reason) {
        setError(reason instanceof Error ? reason.message : "Registration failed. The draft remains available for correction.");
    }
    finally {
        setBusy(false);
    } }
    if (registeredSchoolId)
        return <><section className="platform-page-heading"><div><span className="eyebrow">CONNECTED TENANT PROVISIONING</span><h1>School registered</h1><p>The new school workspace is ready for invitation activation and setup.</p></div></section><section className="panel registration-complete"><CheckCircle2 size={38}/><div><h2>{form.name}</h2><p>{message}</p><dl><div><dt>School code</dt><dd>{form.code}</dd></div><div><dt>Administrator</dt><dd>{form.adminName}</dd></div><div><dt>Invitation email</dt><dd>{form.adminEmail}</dd></div><div><dt>Location</dt><dd>{preview}</dd></div></dl><div className="form-actions"><Link className="secondary-button" to="/platform/schools">View all schools</Link><Link className="primary-button" to={`/platform/schools/${registeredSchoolId}`}>Open School Control Centre <ArrowRight size={17}/></Link></div></div></section></>;
    return <>
    <section className="platform-page-heading"><div><span className="eyebrow">CONNECTED TENANT PROVISIONING</span><h1>Register School</h1><p>One workflow creates the school identity, protected Uganda address, academics, billing, administrator and invitation.</p></div><Link className="secondary-button" to="/platform/schools">Cancel</Link></section>
    <form className="panel platform-registration connected-registration" onSubmit={submit}>
      <ol className="platform-stepper" aria-label="Registration progress">{steps.map((label, index) => <li key={label} className={step === index + 1 ? "active" : step > index + 1 ? "complete" : ""}><span>{step > index + 1 ? <CheckCircle2 size={15}/> : index + 1}</span>{label}</li>)}</ol>
      <div className="registration-stage">
      {step === 1 && <><Stage title="School Identity" text="The school code is generated from the official name and remains editable until registration."/><div className="form-grid">
        <label>School name<input required value={form.name} onChange={(e) => { set("name", e.target.value); if (!codeEdited)
            set("code", schoolCode(e.target.value)); }}/></label>
        <label>Short name <small>Optional</small><input value={form.shortName} onChange={(e) => set("shortName", e.target.value)}/></label>
        <label>School code<input required value={form.code} onChange={(e) => { setCodeEdited(true); set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)); }}/></label>
        <label>School type<select value={form.schoolType} onChange={(e) => set("schoolType", e.target.value)}><option>Secondary School</option><option>Mixed Secondary School</option><option>Girls Secondary School</option><option>Boys Secondary School</option></select></label>
        <label>School email<input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)}/></label><label>School phone<input required value={form.phone} onChange={(e) => set("phone", e.target.value)}/></label>
        <label>EMIS number <small>Optional</small><input value={form.emisNumber} onChange={(e) => set("emisNumber", e.target.value)}/></label><label>Website <small>Optional</small><input type="url" value={form.website} onChange={(e) => set("website", e.target.value)}/></label>
      </div></>}
      {step === 2 && <><Stage title="Uganda Location and Address" text="Administrative locations come from the protected catalogue. Selecting a new parent clears invalid descendants."/><div className="form-grid location-selector-grid">
        <LocationSelect label="Country" value={form.countryId} options={locations.root ?? []} onChange={(v) => choose("countryId", v, ["regionId", "subRegionId", "districtCityId", "countyDivisionId", "localGovernmentId", "parishWardId", "villageZoneId"])}/>
        <LocationSelect label="Region" value={form.regionId} options={locations[form.countryId] ?? []} disabled={!form.countryId} onChange={(v) => choose("regionId", v, ["subRegionId", "districtCityId", "countyDivisionId", "localGovernmentId", "parishWardId", "villageZoneId"])}/>
        <LocationSelect label="Sub-region" value={form.subRegionId} options={(locations[form.regionId] ?? []).filter((item) => item.level === "SUB_REGION")} disabled={!form.regionId} optional onChange={(v) => choose("subRegionId", v, ["districtCityId", "countyDivisionId", "localGovernmentId", "parishWardId", "villageZoneId"])}/>
        <LocationSelect label="District or City" value={form.districtCityId} options={(locations[form.subRegionId || form.regionId] ?? []).filter((item) => ["DISTRICT", "CITY"].includes(item.level))} disabled={!form.regionId} onChange={(v) => { choose("districtCityId", v, ["countyDivisionId", "localGovernmentId", "parishWardId", "villageZoneId"]); set("district", locationNames[v] ?? ""); }}/>
        <LocationSelect label="County" value={form.countyDivisionId} options={(locations[form.districtCityId] ?? []).filter((item) => item.level === "COUNTY")} disabled={!form.districtCityId} optional onChange={(v) => choose("countyDivisionId", v, ["localGovernmentId", "parishWardId", "villageZoneId"])}/>
        <LocationSelect label="Subcounty" value={form.localGovernmentId} options={(locations[form.countyDivisionId || form.districtCityId] ?? []).filter((item) => item.level === "SUB_COUNTY")} disabled={!form.districtCityId} onChange={(v) => choose("localGovernmentId", v, ["parishWardId", "villageZoneId"])}/>
        <label className="form-field-wide">Physical address line<textarea required value={form.address} onChange={(e) => set("address", e.target.value)}/></label>
        <label>Plot, building or road<input value={form.plotRoad} onChange={(e) => set("plotRoad", e.target.value)}/></label><label>Landmark<input value={form.landmark} onChange={(e) => set("landmark", e.target.value)}/></label>
        <label>Postal address <small>Optional</small><input value={form.postalAddress} onChange={(e) => set("postalAddress", e.target.value)}/></label><label>Latitude <small>Optional</small><input type="number" step="0.000001" min="-90" max="90" value={form.latitude} onChange={(e) => set("latitude", e.target.value)}/></label><label>Longitude <small>Optional</small><input type="number" step="0.000001" min="-180" max="180" value={form.longitude} onChange={(e) => set("longitude", e.target.value)}/></label>
      </div><aside className="address-preview"><MapPin size={20}/><div><strong>Formatted address preview</strong><span>{preview || "Complete the catalogue selections and physical address."}</span></div></aside></>}
      {step === 3 && <><Stage title="Academic Profile" text="Required O-Level subjects are activated and locked automatically; optional subjects remain for School Admin selection."/><div className="form-grid">
        <label>Academic levels<select value={form.schoolLevel} onChange={(e) => set("schoolLevel", e.target.value)}><option value="UCE_ONLY">O-Level</option><option value="UACE_ONLY">A-Level</option><option value="BOTH">O-Level and A-Level</option></select></label>
        <label>Current academic year<input type="number" min="2000" max="2200" value={form.academicYear} onChange={(e) => set("academicYear", Number(e.target.value))}/></label>
        <label>Current term<select value={form.currentTerm} onChange={(e) => set("currentTerm", e.target.value)}><option value="TERM_I">Term I</option><option value="TERM_II">Term II</option><option value="TERM_III">Term III</option></select></label>
        <label>Curriculum start year <small>Optional</small><input type="number" min="1900" max="2200" value={form.curriculumStartYear} onChange={(e) => set("curriculumStartYear", e.target.value)}/></label>
      </div>{form.schoolLevel !== "UACE_ONLY" && <div className="required-subjects"><ShieldCheck size={20}/><div><strong>Required and locked</strong><span>112 English Language · 456 Mathematics</span></div></div>}</>}
      {step === 4 && <><Stage title="Subscription and Billing" text="The same school ID will own the subscription, first invoice or trial, and billing schedule."/><div className="form-grid">
        <label>Billing frequency<select value={form.billingCadence} onChange={(e) => { const cadence = e.target.value; set("billingCadence", cadence); set("planCode", cadence === "ANNUAL" ? "OURSCHOOL_ANNUAL" : "OURSCHOOL_TERMLY_V2"); }}><option value="TERMLY">Termly</option><option value="ANNUAL">Annual</option></select></label>
        <label>Subscription plan<input readOnly value={form.billingCadence === "ANNUAL" ? "SOMA REPORT ENGINE Annual Subscription" : "SOMA REPORT ENGINE Termly Subscription"}/></label>
        <label>Subscription start<input type="date" required value={form.subscriptionStart} onChange={(e) => set("subscriptionStart", e.target.value)}/></label><label>Active learners for billing<input type="number" min="0" required value={form.activeLearners} onChange={(e) => set("activeLearners", Number(e.target.value))}/></label>
        <label>Payment status<select value={form.paymentStatus} onChange={(e) => set("paymentStatus", e.target.value)}><option value="PENDING">Pending</option><option value="PAID">Paid</option><option value="WAIVED">Waived</option><option value="TRIAL">Trial</option></select></label>
        <label>Trial start <small>Optional</small><input type="date" value={form.trialStart} onChange={(e) => set("trialStart", e.target.value)}/></label><label>Trial end <small>Optional</small><input type="date" min={form.trialStart || undefined} value={form.trialEnd} onChange={(e) => set("trialEnd", e.target.value)}/></label>
        <label className="form-field-wide">Discount or Support Programme approval <small>Optional</small><textarea value={form.supportApproval} onChange={(e) => set("supportApproval", e.target.value)}/></label>
      </div></>}
      {step === 5 && <><Stage title="Primary School Admin" text="Credentials and a single-use 72-hour activation token are generated only after the final transaction succeeds."/><div className="form-grid">
        <label>Full name<input required value={form.adminName} onChange={(e) => set("adminName", e.target.value)}/></label><label>Email address<input type="email" required value={form.adminEmail} onChange={(e) => set("adminEmail", e.target.value)}/></label><label>Phone number<input required value={form.adminPhone} onChange={(e) => set("adminPhone", e.target.value)}/></label><label>Job title<input required value={form.adminJobTitle} onChange={(e) => set("adminJobTitle", e.target.value)}/></label>
        <label className="checkbox-field"><input type="checkbox" checked={form.requiresMfa} onChange={(e) => set("requiresMfa", e.target.checked)}/><span>Require two-factor authentication during setup</span></label>
      </div></>}
      {step === 6 && <><Stage title="Review and Register" text="Confirm the complete connected tenant. A failed attempt preserves this draft and can be retried without intentional duplicates."/><div className="registration-review-grid">
        <Review title="School Identity" rows={[["School", form.name], ["Short name", form.shortName || "—"], ["School code", form.code], ["Type", form.schoolType], ["Contact", `${form.email} · ${form.phone}`]]}/>
        <Review title="Location and Address" rows={[["Administrative path", preview || "Incomplete"], ["Physical address", form.address], ["Postal address", form.postalAddress || "—"]]}/>
        <Review title="Academic Profile" rows={[["Levels", form.schoolLevel.replaceAll("_", " ")], ["Academic period", `${form.currentTerm.replace("TERM_", "Term ")} ${form.academicYear}`], ["Compulsory subjects", form.schoolLevel === "UACE_ONLY" ? "Not applicable" : "112 English Language; 456 Mathematics"]]}/>
        <Review title="Subscription and Billing" rows={[["Plan", form.planCode], ["Cadence", form.billingCadence], ["Start", form.subscriptionStart], ["Learners", String(form.activeLearners)], ["Payment", form.paymentStatus]]}/>
        <Review title="Primary School Admin" rows={[["Name", form.adminName], ["Job title", form.adminJobTitle], ["Generated username", generatedUsername], ["Invitation", form.adminEmail]]}/>
      </div><label className="platform-notes-field">Internal Platform Admin notes<textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Not visible to the school"/></label><div className="platform-info-note"><ShieldCheck size={18}/> No account, invoice or invitation is created until Register School succeeds.</div></>}
      </div>
      {error && <div className="form-error-message registration-feedback" role="alert">{error}</div>}{message && <div className="form-success-message registration-feedback" role="status">{message}</div>}
      <div className="form-actions platform-step-actions"><button className="secondary-button" type="button" disabled={busy || draftBusy} onClick={saveDraft}><Save size={17}/>{draftBusy ? "Saving…" : "Save Draft"}</button>{step > 1 && <button className="secondary-button" type="button" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}<button className="primary-button" type="submit" disabled={!valid || busy}>{step === 6 ? <><Building2 size={18}/>{busy ? "Registering securely…" : "Register School"}</> : <>Continue <ArrowRight size={18}/></>}</button></div>
    </form>
  </>;
}
function Stage({ title, text }) { return <div className="panel-heading registration-stage-heading"><div><h2>{title}</h2><p>{text}</p></div></div>; }
function LocationSelect({ label, value, options, onChange, disabled = false, optional = false }) { return <label>{label}{optional && <small>Optional</small>}<select required={!optional} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}><option value="">{disabled ? "Select the parent location first" : options.length ? "Select from catalogue" : "No child locations configured"}</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>; }
function Review({ title, rows }) { return <section className="registration-review-card"><h3>{title}</h3><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>; }
