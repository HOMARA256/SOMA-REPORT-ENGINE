import { AlertTriangle, CheckCircle2, Download, FileText, Info, Layers3, Printer, ShieldCheck, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { currentUser } from "../../config/currentUser";
import { useAcademicWorkspace } from "../academicSetup/AcademicWorkspace";
import { useSchoolContext } from "../context/SchoolContext";
import { getLearnerFullName } from "../learners/LearnerData";
import { activeOLLevelGradingConfiguration, formatThreePoint, getOLLevelGradingBand } from "../marks/gradingConfiguration";
import { getMarksPreview } from "../marks/marksCalculation";
import { reportNarrativeComplete } from "./reportingDomain";
import { generateReportCommentDrafts } from "./reportCommentPreview";
import { reportableProfileFields, useSchoolSettings } from "../settings/SchoolSettingsWorkspace";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { getCombination } from "../alevel/aLevelDomain";
import { resolveALevelGrade } from "../marks/aLevelGradingConfiguration";
import { useApprovalEngine } from "../approvals/ApprovalEngine";
import { usePersistentResultScopes } from "../approvals/PersistentResultScopes";
import { ContactPlatformSupportButton } from "../notifications/MessageCentreLink";
const blankNarrative = () => ({ classTeacherComment: "", directorOfStudiesComment: "", headTeacherComment: "", subjectFeedback: {}, commentRecords: {} });
export function ReportCardsPage() {
    const inOLevelWorkspace = useLocation().pathname.startsWith("/school/o-level");
    const workspace = useAcademicWorkspace();
    const schoolContext = useSchoolContext();
    const approvalEngine = useApprovalEngine();
    const persistentResultScopes = usePersistentResultScopes();
    const schoolSettings = useSchoolSettings();
    const [searchParams] = useSearchParams();
    const [programme, setProgramme] = useState(!inOLevelWorkspace && searchParams.get("programme") === "A_LEVEL" ? "A_LEVEL" : "O_LEVEL");
    const [selectedClass, setSelectedClass] = useState(searchParams.get("class") ?? (searchParams.get("programme") === "A_LEVEL" ? "Senior 5" : "Senior 1"));
    const [selectedStream, setSelectedStream] = useState("all");
    const [selectedLearner, setSelectedLearner] = useState(searchParams.get("learner") ?? "");
    const [narrativeDraft, setNarrativeDraft] = useState(blankNarrative);
    const [notice, setNotice] = useState("");
    const [pendingAction, setPendingAction] = useState(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [batchOpen, setBatchOpen] = useState(false);
    async function queueBackgroundGeneration() {
        if (!readyCount)
            return;
        setActionBusy(true);
        const requestKey = [programme, activeClass?.name ?? "class", selectedStream, workspace.termId, readyCount].join(":").toLowerCase().replace(/[^a-z0-9:-]/g, "-");
        const error = await approvalEngine.queueReportJob({ programme, outputType: "ZIP", requestKey });
        setActionBusy(false);
        setNotice(error ?? "Background report generation was queued. Repeating this action will not create a duplicate job.");
    }
    const classes = workspace.classes.filter((item) => item.programme === programme);
    const activeClass = classes.find((item) => item.name === selectedClass) ?? classes[0];
    const classLearners = workspace.learners.filter((item) => item.status === "Active" && item.programme === (programme === "O_LEVEL" ? "O-Level" : "A-Level") && item.className === activeClass?.name);
    const streams = [...new Set(classLearners.map((item) => item.stream).filter(Boolean))];
    const activeStream = selectedStream === "all" || streams.includes(selectedStream) ? selectedStream : "all";
    const learners = classLearners.filter((item) => activeStream === "all" || item.stream === activeStream);
    const learner = learners.find((item) => item.id === selectedLearner) ?? learners[0];
    const offerings = workspace.offerings.filter((item) => item.programme === "O_LEVEL" && item.className === activeClass?.name && (!item.stream || item.stream === learner?.stream));
    const persistentScope = programme === "O_LEVEL"
        ? persistentResultScopes.scopes.find((scope) => scope.termId === workspace.termId && scope.classId === activeClass?.id)
        : undefined;
    const sessionLock = workspace.resultLocks.find((item) => item.termId === workspace.termId && item.className === activeClass?.name);
    const sessionApproval = workspace.resultApprovals.find((item) => item.lockId === sessionLock?.id);
    const approval = persistentScope?.status === "APPROVED" ? persistentScope : null;
    const snapshot = workspace.reportSnapshots.find((item) => item.lockId === sessionLock?.id && item.learner.id === learner?.id);
    const publication = workspace.reportPublications.find((item) => item.snapshotId === snapshot?.id);
    const snapshotResults = snapshot?.subjects ?? [];
    const cardLearner = snapshot?.learner ?? learner;
    const cardTermName = snapshot?.termName ?? schoolContext.termName ?? "No term selected";
    const savedNarrative = learner ? workspace.reportNarratives[`${workspace.termId}:${learner.id}`] : undefined;
    useEffect(() => {
        setNarrativeDraft(savedNarrative ? { classTeacherComment: savedNarrative.classTeacherComment, directorOfStudiesComment: savedNarrative.directorOfStudiesComment, headTeacherComment: savedNarrative.headTeacherComment, subjectFeedback: structuredClone(savedNarrative.subjectFeedback), commentRecords: structuredClone(savedNarrative.commentRecords) } : blankNarrative());
        setNotice("");
    }, [learner?.id, savedNarrative, workspace.termId]);
    const cardNarrative = snapshot?.narrative ?? narrativeDraft;
    const reportHeader = snapshot?.headerSnapshot ?? schoolSettings.resolveHeader();
    const displaySettings = reportHeader.displaySettings;
    const baseValidation = learner ? workspace.getReportValidation(learner.id) : null;
    const validation = baseValidation && programme === "O_LEVEL" ? (() => {
        const checks = baseValidation.checks.map((check) => check.label !== "Required approval" ? check : {
            ...check,
            passed: persistentScope?.status === "APPROVED",
            detail: persistentScope?.status === "APPROVED"
                ? "Class result scope is approved in Supabase. Persistent report snapshot and publication steps are separate."
                : persistentScope?.status === "LOCKED"
                    ? "Class result scope is locked in Supabase and still needs a different authorised approver."
                    : persistentResultScopes.loading ? "Checking the persistent class approval in Supabase." : "Moderated results must be locked and approved in Supabase.",
        });
        const issues = persistentScope?.status === "APPROVED"
            ? baseValidation.issues.filter((issue) => !issue.startsWith("Required approval:"))
            : baseValidation.issues;
        const layoutBlocked = checks.some((check) => check.label === "Single-page A4 layout" && !check.passed);
        return { ...baseValidation, checks, issues, status: layoutBlocked ? "REPORT_LAYOUT_REQUIRES_ATTENTION" : issues.length ? "REQUIRES_ATTENTION" : "READY" };
    })() : baseValidation;
    const classRecord = workspace.classes.find((item) => item.name === (cardLearner?.className ?? activeClass?.name));
    const liveClassTeacher = workspace.staff.find((item) => item.id === (classRecord?.streams.find((stream) => stream.name === cardLearner?.stream)?.teacherId ?? classRecord?.classTeacherId) && item.accountStatus === "Active");
    const liveHeadTeacher = workspace.staff.find((item) => item.role === "Head Teacher" && item.accountStatus === "Active");
    const classTeacher = snapshot?.classTeacher ?? (liveClassTeacher ? { id: liveClassTeacher.id, name: liveClassTeacher.name, signatureUrl: liveClassTeacher.signatureUrl, signatureStatus: liveClassTeacher.signatureUrl ? "DIGITAL_CONFIGURED" : "HANDWRITTEN" } : null);
    const headTeacher = snapshot?.headTeacher ?? (liveHeadTeacher ? { id: liveHeadTeacher.id, name: liveHeadTeacher.name, signatureUrl: liveHeadTeacher.signatureUrl, signatureStatus: liveHeadTeacher.signatureUrl ? "DIGITAL_CONFIGURED" : "HANDWRITTEN" } : null);
    const narrativeReady = reportNarrativeComplete(savedNarrative, offerings.map((item) => item.id));
    const results = offerings.map((offering) => {
        const marks = learner ? workspace.getMarks(offering.id, learner.id) : null;
        const preview = marks ? getMarksPreview(marks.continuousAssessment, marks.examination, marks.continuousAssessmentState, marks.examinationState) : null;
        const batch = workspace.batches.find((item) => item.offeringId === offering.id);
        return { offering, marks, preview, batch };
    });
    const aLevelResults = workspace.aLevelOfferings.filter((offering) => offering.className === activeClass?.name && offering.combination === learner?.aLevelCombination && (offering.subjectLevel !== "SUBSIDIARY" || getCombination(learner?.aLevelCombination)?.subsidiarySubjectCodes[0] === offering.subjectCode)).map((offering) => {
        const marks = learner ? workspace.getALevelMarks(offering.id, learner.id) : {};
        const required = workspace.getSelectedALevelPapers("assessment-003", offering).filter((item) => item.required);
        const complete = required.length > 0 && required.every((item) => marks[item.id]?.state === "PRESENT" && marks[item.id]?.value !== "");
        const average = complete ? required.reduce((sum, item) => sum + Number(marks[item.id].value), 0) / required.length : null;
        const category = (offering.subjectLevel === "OTHER" ? "SUBSIDIARY" : offering.subjectLevel);
        const grade = average === null ? null : resolveALevelGrade(workspace.getActiveALevelGradingScheme(category), average);
        return { offering: { ...offering, components: required }, marks, average, grade };
    });
    const cardSubjects = snapshot ? snapshotResults.map((item) => {
        return { id: item.offeringId, code: item.subjectCode, name: item.subjectName, components: item.components.map((component) => ({ ...component, numericValue: Number.isFinite(Number(component.value)) ? Number(component.value) : null })), total: item.percentageScore, threePointScoreExact: item.threePointScoreExact, threePointScoreDisplayed: item.threePointScoreDisplayed, gradingDescriptor: item.gradingDescriptor, competencyText: item.competencyText, teacherInitials: item.teacherInitials, state: "PRESENT" };
    }) : results.map(({ offering, marks, preview }) => {
        const allocated = (offering.teacherIds ?? []).map((id) => workspace.staff.find((item) => item.id === id && item.accountStatus === "Active"));
        const components = offering.components.map((component) => ({ ...component, value: marks?.[component.key] ?? "", numericValue: marks?.[`${component.key}State`] === "PRESENT" && Number.isFinite(Number(marks?.[component.key])) ? Number(marks?.[component.key]) : null }));
        return { id: offering.id, code: offering.subjectCode, name: offering.subjectName, components, total: preview?.state === "PRESENT" ? Number(preview.total) : null, threePointScoreExact: preview?.threePointScoreExact ?? null, threePointScoreDisplayed: preview?.threePointScoreDisplayed ?? "—", gradingDescriptor: preview?.gradingLabel ?? preview?.descriptor ?? "", competencyText: offering.competencyText ?? "MISSING COMPETENCY EVIDENCE", teacherInitials: !offering.teacherIds?.length || allocated.some((item) => !item) ? "MISSING ALLOCATION" : allocated.some((item) => !item?.initials) ? "MISSING INITIALS" : allocated.map((item) => item.initials).join(" / "), state: preview?.state ?? "MISSING" };
    });
    const assessmentComponents = snapshot?.subjects[0]?.components ?? offerings[0]?.components ?? [];
    const subjectLabel = (item) => displaySettings.subjectDisplay === "FULL_NAME" ? item.name : displaySettings.subjectDisplay === "CODE_AND_SHORT_NAME" ? `${item.code} · ${item.name}` : item.code;
    const nextTermDate = displaySettings.additionalInformation.nextTermStartDate ? new Date(`${displaySettings.additionalInformation.nextTermStartDate}T00:00:00`) : null;
    const footerItems = [
        displaySettings.additionalInformation.nextTermBegins && nextTermDate ? { label: "Next term begins", value: nextTermDate.toLocaleDateString("en-UG", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) } : null,
        displaySettings.additionalInformation.attendance && cardLearner?.attendance?.totalDays ? { label: "Attendance", value: `${cardLearner.attendance.presentDays} / ${cardLearner.attendance.totalDays} days · ${(cardLearner.attendance.presentDays / cardLearner.attendance.totalDays * 100).toFixed(1)}%` } : null,
        displaySettings.additionalInformation.feesStatus && cardLearner?.feesStatus ? { label: "Fees status", value: cardLearner.feesStatus } : null,
    ].filter((item) => Boolean(item));
    const complete = cardSubjects.length > 0 && cardSubjects.every((item) => item.total !== null);
    const average = snapshot?.overall.average ?? (complete ? cardSubjects.reduce((sum, item) => sum + (item.total ?? 0), 0) / cardSubjects.length : null);
    const overallBand = snapshot ? null : average === null ? null : getOLLevelGradingBand(average);
    const overallLabel = snapshot?.overall.descriptor ?? overallBand?.label;
    const overallThreePointExact = snapshot?.overall.threePointScoreExact ?? (complete ? cardSubjects.reduce((sum, item) => sum + (item.threePointScoreExact ?? 0), 0) / cardSubjects.length : null);
    const overallThreePointDisplayed = snapshot?.overall.threePointScoreDisplayed ?? (overallThreePointExact === null ? "—" : formatThreePoint(overallThreePointExact));
    const gradingBands = snapshot?.gradingBands ?? activeOLLevelGradingConfiguration.bands;
    const unresolved = results.filter(({ preview }) => preview?.state !== "PRESENT").length;
    const allModerated = results.length > 0 && results.every(({ batch }) => batch?.status === "MODERATED");
    const commentRecords = Object.values(narrativeDraft.commentRecords);
    const reportCommentRecords = commentRecords.filter((record) => ["CLASS_TEACHER", "HEAD_TEACHER"].includes(record.roleType));
    const attentionComments = reportCommentRecords.filter((record) => record.status === "REQUIRES_ATTENTION").length;
    const reviewedComments = reportCommentRecords.filter((record) => ["REVIEWED", "EDITED", "APPROVED", "PUBLISHED"].includes(record.status)).length;
    const reportStatus = publication ? "PUBLISHED" : snapshot ? "APPROVED" : approval ? "APPROVED · SNAPSHOT PENDING" : persistentScope?.status === "LOCKED" ? "LOCKED · APPROVAL PENDING" : programme === "O_LEVEL" && unresolved > 0 ? "PENDING MARKS" : !allModerated && programme === "O_LEVEL" ? "PENDING MODERATION" : "DRAFT";
    const batchReadiness = learners.map((item) => {
        if (programme === "O_LEVEL") {
            const reportValidation = workspace.getReportValidation(item.id);
            const missingMarks = reportValidation.checks.some((check) => check.label === "Required marks" && !check.passed);
            const pendingModeration = reportValidation.checks.some((check) => check.label === "Required approval" && !check.passed);
            const missingSignatory = reportValidation.checks.some((check) => ["Class Teacher assignment", "Head Teacher assignment"].includes(check.label) && !check.passed);
            const incompleteProfile = reportValidation.checks.some((check) => ["Learner information", "School logo"].includes(check.label) && !check.passed);
            return { learner: item, ready: reportValidation.status === "READY", missingMarks, pendingModeration, missingSignatory, incompleteProfile };
        }
        const learnerOfferings = workspace.aLevelOfferings.filter((offering) => offering.className === activeClass?.name && offering.combination === item.aLevelCombination);
        const missingMarks = learnerOfferings.length === 0 || learnerOfferings.some((offering) => workspace.getSelectedALevelPapers("assessment-003", offering).filter((paper) => paper.required).some((paper) => { const mark = workspace.getALevelMarks(offering.id, item.id)[paper.id]; return mark?.state !== "PRESENT" || mark.value === ""; }));
        const missingSignatory = !classTeacher || !headTeacher;
        return { learner: item, ready: !missingMarks && !missingSignatory, missingMarks, pendingModeration: false, missingSignatory, incompleteProfile: !item.admissionNumber };
    });
    const readyCount = batchReadiness.filter((item) => item.ready).length;
    function editedRecord(record, roleType, value, subjectOfferingId) {
        const now = new Date().toISOString();
        return record ? { ...record, editedComment: value, finalComment: value, status: "EDITED", reviewedAt: now, responsibleUser: currentUser.name }
            : { roleType, subjectOfferingId, generatedComment: "", editedComment: value, finalComment: value, status: "EDITED", evidenceUsed: ["Manual authorised entry"], templateVersion: "manual-1", generationMethod: "MANUAL", confidenceState: "SUFFICIENT_EVIDENCE", responsibleUser: currentUser.name, generatedAt: now, reviewedAt: now };
    }
    function changeComment(key, value) {
        const recordKey = key === "classTeacherComment" ? "CLASS_TEACHER" : "HEAD_TEACHER";
        const roleType = recordKey;
        setNarrativeDraft((current) => ({ ...current, [key]: value, commentRecords: { ...current.commentRecords, [recordKey]: editedRecord(current.commentRecords[recordKey], roleType, value) } }));
        setNotice("");
    }
    function generateDrafts() {
        if (!learner)
            return;
        const generated = generateReportCommentDrafts({ firstName: learner.firstName, responsibleUser: currentUser.name, subjects: results.map(({ offering, marks, preview }) => ({ offeringId: offering.id, subjectName: offering.subjectName, total: preview?.state === "PRESENT" ? Number(preview.total) : null, descriptor: preview?.descriptor ?? "", state: preview?.state ?? "MISSING", components: offering.components.map((component) => ({ label: component.label, maximum: component.maximum, value: marks?.[component.key] ?? "", state: marks?.[`${component.key}State`] ?? "MISSING" })) })) });
        setNarrativeDraft(generated);
        setNotice("Evidence-based draft comments generated locally for this review. Every comment still requires authorised review before snapshot preparation.");
    }
    function markReviewed(recordKey) {
        setNarrativeDraft((current) => ({ ...current, commentRecords: { ...current.commentRecords, [recordKey]: { ...current.commentRecords[recordKey], status: "REVIEWED", finalComment: current.commentRecords[recordKey].editedComment ?? current.commentRecords[recordKey].generatedComment, reviewedAt: new Date().toISOString(), responsibleUser: currentUser.name } } }));
    }
    function saveNarrative() {
        if (!learner)
            return;
        const error = workspace.saveReportNarrative(learner.id, narrativeDraft);
        setNotice(error ?? "Narrative saved in this review session. It is not a server sign-off.");
    }
    function prepareSnapshot() {
        if (!learner)
            return;
        const error = workspace.prepareReport(learner.id);
        setNotice(error ?? "Version 1 snapshot prepared from locked results and narratives in this review session.");
    }
    function publishSnapshot() {
        if (!snapshot)
            return;
        const error = workspace.publishReport(snapshot.id);
        setNotice(error ?? "Review publication recorded. This is not an official school report.");
    }
    function generatePdf() { if (learner)
        workspace.recordReportPreview(learner.id); window.print(); }
    function confirmReportAction() {
        if (!pendingAction || actionBusy)
            return;
        setActionBusy(true);
        window.setTimeout(() => {
            if (pendingAction === "REGENERATE")
                generateDrafts();
            if (pendingAction === "PREPARE")
                prepareSnapshot();
            if (pendingAction === "PUBLISH")
                publishSnapshot();
            setActionBusy(false);
            setPendingAction(null);
        }, 180);
    }
    const reportReturnTo = `/reports/cards?class=${encodeURIComponent(activeClass?.name ?? "")}&learner=${encodeURIComponent(learner?.id ?? "")}`;
    function readinessAction(label) {
        if (!learner)
            return null;
        if (label === "School logo")
            return { to: `/settings/school-profile?returnTo=${encodeURIComponent(reportReturnTo)}`, text: "Open School Profile" };
        if (["Learner photo", "Learner information", "Attendance"].includes(label))
            return { to: `/school/learners/${learner.id}?returnTo=${encodeURIComponent(reportReturnTo)}`, text: "Open Learner Profile" };
        if (["Teacher allocations and initials", "Class Teacher assignment", "Head Teacher assignment"].includes(label))
            return { to: `/people/users?returnTo=${encodeURIComponent(reportReturnTo)}`, text: "Open Staff & Users" };
        if (["Class Teacher comment", "Head Teacher comment"].includes(label))
            return { to: "#report-comments-editor", text: "Edit comments" };
        if (["Assessment configuration", "Required marks"].includes(label))
            return { to: "/setup/assessments", text: "Open Assessments" };
        if (["Next term date", "Grading configuration"].includes(label))
            return { to: `/settings/report-card/header?returnTo=${encodeURIComponent(reportReturnTo)}`, text: "Open Report Settings" };
        if (label === "Required approval")
            return { to: "/results/approvals", text: "Open Approvals" };
        return null;
    }
    return <div className="report-page">
    <header className="page-heading report-page-heading">
      <div><span className="eyebrow">RESULTS &amp; REPORTING</span><h1>Report Cards</h1><p>Exact A4 preview from marks, conversion, grading, competencies and teacher allocations.</p></div>
      <div className="report-heading-actions"><ContactPlatformSupportButton category="APPROVAL_OR_REPORT"/><button type="button" className="secondary-button" onClick={() => setBatchOpen((open) => !open)}><Layers3 size={17}/> Generate Class Batch</button><button type="button" className="secondary-button" onClick={generatePdf} disabled={!learner}><Printer size={17} aria-hidden="true"/> Print / Save as PDF</button></div>
    </header>

    <section className="panel report-controls" aria-label="Report card selection">
      {!inOLevelWorkspace && <label><span>Programme</span><select value={programme} onChange={(event) => { const next = event.target.value; setProgramme(next); setSelectedClass(next === "O_LEVEL" ? "Senior 1" : "Senior 5"); setSelectedStream("all"); setSelectedLearner(""); }}><option value="O_LEVEL">O-Level</option><option value="A_LEVEL">A-Level</option></select></label>}
      <label><span>Class</span><select value={activeClass?.name ?? ""} onChange={(event) => { setSelectedClass(event.target.value); setSelectedStream("all"); setSelectedLearner(""); }}><option value="" disabled>No configured class</option>{classes.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
      <label><span>Stream</span><select value={activeStream} onChange={(event) => { setSelectedStream(event.target.value); setSelectedLearner(""); }}><option value="all">All streams</option>{streams.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Learner</span><select value={learner?.id ?? ""} onChange={(event) => setSelectedLearner(event.target.value)}><option value="" disabled>No active learner</option>{learners.map((item) => <option key={item.id} value={item.id}>{getLearnerFullName(item)} · {item.admissionNumber || item.id}</option>)}</select></label>
    </section>

    {batchOpen && <section className="panel report-batch-panel" aria-label="Class batch generation"><div className="panel-heading"><div><h2>Class batch readiness</h2><p>{activeClass?.name ?? "No class"}{activeStream !== "all" ? ` · ${activeStream}` : " · All streams"} · {programme === "O_LEVEL" ? "O-Level" : "A-Level"}</p></div><span className={readyCount === learners.length && learners.length ? "report-ready" : "report-pending"}>{readyCount} of {learners.length} ready</span></div><div className="report-batch-summary"><article><span>Total learners</span><strong>{learners.length}</strong></article><article><span>Ready for generation</span><strong>{readyCount}</strong></article><article><span>Missing marks</span><strong>{batchReadiness.filter((item) => item.missingMarks).length}</strong></article><article><span>Pending moderation</span><strong>{batchReadiness.filter((item) => item.pendingModeration).length}</strong></article><article><span>Missing signatory</span><strong>{batchReadiness.filter((item) => item.missingSignatory).length}</strong></article><article><span>Incomplete profile</span><strong>{batchReadiness.filter((item) => item.incompleteProfile).length}</strong></article></div><div className="report-batch-actions"><Link className="secondary-button" to="/marks/missing">Resolve blocked records</Link><button className="secondary-button" type="button" disabled={!readyCount} onClick={generatePdf}><Printer size={16}/> Print ready reports</button><button className="primary-button" type="button" disabled={!readyCount || actionBusy || !approvalEngine.schoolId} onClick={() => void queueBackgroundGeneration()}><Download size={16}/> {actionBusy ? "Queueing…" : "Generate ready only"}</button></div></section>}

    {!learner ? <section className="panel report-empty"><FileText aria-hidden="true"/><div><h2>No learner in this context</h2><p>Select a class and stream with an active learner.</p></div></section> : <>
      <p className="report-draft-notice"><Info size={18} aria-hidden="true"/><span><strong>{publication ? "Published workspace copy." : "Unpublished preview."}</strong> {programme === "A_LEVEL" ? `${learner.aLevelCombination ?? "No combination"} resolves ${aLevelResults.length} subjects, including General Paper automatically. ${aLevelResults.filter((item) => item.average === null).length} subject results remain incomplete. ` : snapshot ? "This card reads a captured approved snapshot, not live marks. " : `${unresolved === 0 ? "All configured subjects have complete marks." : `${unresolved} subject${unresolved === 1 ? " has" : "s have"} unresolved marks.`} ${allModerated ? "The shown subject batches are moderated." : "Moderation is incomplete."} `}Issue an official report only after the class approval, snapshot preparation, and publication steps are complete.</span></p>
      <section className="panel report-workflow"><div><h2>Publication workflow</h2><p>{programme === "A_LEVEL" ? "Combination, paper marks and the independent versioned grading scheme now feed this preview. Approval and immutable publication remain required." : persistentResultScopes.error ? persistentResultScopes.error : approval ? "Class results are approved in Supabase. Report narratives, immutable snapshot generation and publication are not yet connected to persistent records." : persistentScope?.status === "LOCKED" ? "Class results are locked in Supabase and awaiting approval by a different authorized user." : "Complete moderation, lock and approve the class first."}</p></div><div className="report-workflow-status"><span>{programme === "A_LEVEL" ? (aLevelResults.every((item) => item.average !== null && item.grade) ? "Ready for approval" : "Academic evidence pending") : persistentResultScopes.loading ? "Checking Supabase…" : publication ? "Review published" : snapshot ? "Session snapshot prepared" : approval ? "Approved · persistent report pending" : persistentScope?.status === "LOCKED" ? "Locked · approval pending" : "Approval pending"}</span><Link className="secondary-button" to={publication ? "/reports/archive" : "/results/approvals"}>{publication ? "Open archive" : "Open approvals"}</Link></div></section>
      {programme === "O_LEVEL" && validation && <section className={`panel report-validation report-validation-${validation.status.toLowerCase().replaceAll("_", "-")}`}><div className="panel-heading"><div><h2>Report readiness</h2><p>Every critical report input and the single-page layout are checked before publication.</p></div><span className={validation.status === "READY" ? "report-ready" : "report-pending"}>{validation.status.replaceAll("_", " ")}</span></div><div className="report-validation-grid">{validation.checks.map((check) => { const action = !check.passed ? readinessAction(check.label) : null; return <div className={check.passed ? "validation-pass" : "validation-fail"} key={check.label}>{check.passed ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}<span><strong>{check.label}</strong><small>{check.detail}</small>{action && (action.to.startsWith("#") ? <a href={action.to}>{action.text}</a> : <Link to={action.to}>{action.text}</Link>)}</span></div>; })}</div><div className="report-preview-actions"><a className="secondary-button" href="#report-comments-editor">Edit comments</a><button type="button" className="secondary-button" onClick={() => setNotice(validation.issues.length ? validation.issues.join(" ") : "All required report information and the one-page A4 layout pass.")}>Check Missing Information</button><button type="button" className="secondary-button" onClick={generatePdf}><Printer size={16}/> Print / Save as PDF</button>{!approval && <Link className="secondary-button" to="/results/approvals"><ShieldCheck size={16}/> Open approvals</Link>}{snapshot && !publication && <button type="button" className="primary-button" onClick={() => setPendingAction("PUBLISH")} disabled={validation.status !== "READY" || actionBusy}><ShieldCheck size={16}/> {actionBusy && pendingAction === "PUBLISH" ? "Publishing…" : "Publish"}</button>}</div></section>}
      {!snapshot && <section className="panel report-narrative-editor" id="report-comments-editor">
        <div className="panel-heading"><div><h2>Class and Head Teacher comments</h2><p>Only these two reviewed narratives appear on this {programme === "A_LEVEL" ? "A-Level school progress" : "O-Level"} report.</p></div><span className={narrativeReady ? "report-ready" : "report-pending"}>{narrativeReady ? "Reviewed and saved" : "Review required"}</span></div>
        <div className="comment-engine-toolbar"><div><WandSparkles size={20}/><span><strong>Automatic evidence-based drafts</strong><small>Drafts use current academic evidence, remain editable, and never replace authorised review.</small></span></div><button type="button" className="primary-button" onClick={() => commentRecords.some((record) => record.status === "EDITED") ? setPendingAction("REGENERATE") : generateDrafts()} disabled={programme === "A_LEVEL" || !offerings.length || actionBusy}><WandSparkles size={16}/> {actionBusy && pendingAction === "REGENERATE" ? "Generating…" : "Generate two drafts"}</button></div>
        {!!reportCommentRecords.length && <div className="comment-status-summary"><span><strong>{reportCommentRecords.length}</strong> required comments</span><span className={reviewedComments === reportCommentRecords.length ? "comment-summary-ready" : ""}><CheckCircle2 size={15}/> {reviewedComments} reviewed</span><span className={attentionComments ? "comment-summary-attention" : ""}><AlertTriangle size={15}/> {attentionComments} require attention</span></div>}
        <div className="report-narrative-grid">
          <RoleCommentEditor label="Class Teacher comment" recordKey="CLASS_TEACHER" record={narrativeDraft.commentRecords.CLASS_TEACHER} value={narrativeDraft.classTeacherComment} onChange={(value) => changeComment("classTeacherComment", value)} onReview={markReviewed} maximumLength={displaySettings.numberFormatting.maximumCommentLength}/>
          <RoleCommentEditor label="Head Teacher comment" recordKey="HEAD_TEACHER" record={narrativeDraft.commentRecords.HEAD_TEACHER} value={narrativeDraft.headTeacherComment} onChange={(value) => changeComment("headTeacherComment", value)} onReview={markReviewed} maximumLength={displaySettings.numberFormatting.maximumCommentLength}/>
        </div>
        <div className="report-editor-actions"><button type="button" className="secondary-button" onClick={saveNarrative}>Save reviewed comments</button>{programme === "O_LEVEL" && <button type="button" className="primary-button" onClick={() => setPendingAction("PREPARE")} disabled={!approval || !sessionLock || !sessionApproval || !narrativeReady || actionBusy}><FileText size={16} aria-hidden="true"/> {actionBusy && pendingAction === "PREPARE" ? "Preparing…" : "Prepare immutable snapshot"}</button>}</div>
      </section>}
      {snapshot && !publication && <section className="panel report-publish-panel"><div><h2>Immutable snapshot ready</h2><p>Version {snapshot.version} captured header, learner data, exact scores, grading, competencies, allocations, initials, signatories and final comments.</p></div></section>}
      {notice && <p className="moderation-notice report-notice" role="status">{notice}</p>}
      <ConfirmDialog open={pendingAction !== null} title={pendingAction === "PUBLISH" ? "Publish report?" : pendingAction === "PREPARE" ? "Prepare immutable report snapshot?" : "Replace edited comment drafts?"} confirmLabel={pendingAction === "PUBLISH" ? "Publish Report" : pendingAction === "PREPARE" ? "Prepare Snapshot" : "Replace Drafts"} destructive={pendingAction === "PUBLISH"} busy={actionBusy} onConfirm={confirmReportAction} onCancel={() => { if (!actionBusy)
            setPendingAction(null); }}><p>{pendingAction === "PUBLISH" ? <>Publishing creates the official immutable report snapshot. Future corrections require a new version.</> : pendingAction === "PREPARE" ? <>The prepared snapshot freezes the reviewed narratives, scores, allocations, signatures, header and grading evidence for this learner.</> : <>Manually edited comments will be replaced by newly generated drafts. You can still review and edit the new drafts before saving.</>}</p></ConfirmDialog>
      <div className="report-paper-wrap"><article className={`report-paper ${publication ? "report-paper-published" : "report-paper-draft"}`} style={{ "--report-primary": reportHeader.primaryColour, "--report-secondary": reportHeader.secondaryColour }} aria-label={`${reportStatus} report card for ${getLearnerFullName(cardLearner ?? learner)}`}>
        {!publication && <div className="report-watermark" aria-hidden="true">DRAFT · NOT FOR ISSUE</div>}
        <ReportSchoolHeader header={reportHeader} programme={programme} termName={cardTermName} yearName={snapshot?.yearName ?? schoolContext.academicYearName ?? "No academic year"} learner={cardLearner ?? learner}/>
        {reportHeader.reportInformation.reportTitle && <h3 className="report-title">{programme === "A_LEVEL" ? learner.className === "Senior 5" ? "Senior Five Academic Progress Report" : "Senior Six School Progress Report" : "Ordinary Level End of Term Report Card"}</h3>}
        <dl className="report-identity">{displaySettings.learnerInformation.learnerName && <div><dt>Learner</dt><dd>{getLearnerFullName(cardLearner ?? learner).toUpperCase()}</dd></div>}{displaySettings.learnerInformation.admissionNumber && <div><dt>Admission No.</dt><dd>{cardLearner?.admissionNumber || "Not recorded"}</dd></div>}{displaySettings.learnerInformation.className && <div><dt>Class</dt><dd>{cardLearner?.className}</dd></div>}{displaySettings.learnerInformation.stream && <div><dt>Stream</dt><dd>{cardLearner?.stream || "Not recorded"}</dd></div>}{displaySettings.learnerInformation.gender && <div><dt>Gender</dt><dd>{cardLearner?.gender}</dd></div>}{(displaySettings.learnerInformation.year || displaySettings.learnerInformation.term) && <div><dt>Year / Term</dt><dd>{displaySettings.learnerInformation.year && (snapshot?.yearName ?? schoolContext.academicYearName ?? "No academic year")}{displaySettings.learnerInformation.year && displaySettings.learnerInformation.term && " · "}{displaySettings.learnerInformation.term && cardTermName}</dd></div>}</dl>
        {programme === "A_LEVEL" ? <ALevelReportResults results={aLevelResults} classSize={learners.length} paperGrade={(category, mark) => resolveALevelGrade(workspace.getActiveALevelGradingScheme(category), mark)?.grade ?? "REFERENCE REQUIRED"}/> : <>
          <div className="report-table-wrap"><table className="report-results-table report-final-results">
            <thead><tr>
              {displaySettings.resultsTable.subject && <th>Subject</th>}
              {displaySettings.resultsTable.continuousAssessment && assessmentComponents[0] && <th>{assessmentComponents[0].label}<br /><span>/{assessmentComponents[0].maximum}</span></th>}
              {displaySettings.resultsTable.examination && assessmentComponents[1] && <th>{assessmentComponents[1].label}<br /><span>/{assessmentComponents[1].maximum}</span></th>}
              {displaySettings.resultsTable.percentage && <th>Mark %</th>}
              {displaySettings.resultsTable.threePoint && <th>3-Point</th>}
              {displaySettings.resultsTable.descriptor && <th>Achievement</th>}
              {displaySettings.resultsTable.competency && <th>Competency demonstrated</th>}
              {displaySettings.resultsTable.teacherInitials && <th>Tr. initials</th>}
            </tr></thead>
            <tbody>{cardSubjects.map((item) => <tr key={item.id} title={item.name}>
              {displaySettings.resultsTable.subject && <td className="report-subject-code"><strong>{subjectLabel(item)}</strong></td>}
              {displaySettings.resultsTable.continuousAssessment && assessmentComponents[0] && <td className="report-component-mark">{item.components[0]?.numericValue === null || item.components[0]?.numericValue === undefined ? "—" : item.components[0].numericValue.toFixed(0)}</td>}
              {displaySettings.resultsTable.examination && assessmentComponents[1] && <td className="report-component-mark">{item.components[1]?.numericValue === null || item.components[1]?.numericValue === undefined ? "—" : item.components[1].numericValue.toFixed(0)}</td>}
              {displaySettings.resultsTable.percentage && <td className="report-result-total">{item.total === null ? "—" : item.total.toFixed(displaySettings.numberFormatting.percentageDecimalPlaces)}</td>}
              {displaySettings.resultsTable.threePoint && <td className="report-three-point">{item.threePointScoreDisplayed}</td>}
              {displaySettings.resultsTable.descriptor && <td>{item.total === null ? item.state : item.gradingDescriptor}</td>}
              {displaySettings.resultsTable.competency && <td className="report-competency-cell">{item.competencyText}</td>}
              {displaySettings.resultsTable.teacherInitials && <td className="report-initials-cell">{item.teacherInitials}</td>}
            </tr>)}</tbody>
          </table></div>
          <div className="report-overview report-overall-final"><div><span>Average score</span><strong>{average === null ? "Pending" : `${average.toFixed(displaySettings.numberFormatting.percentageDecimalPlaces)}%`}</strong><small>{overallLabel ?? "Awaiting complete results"}</small></div><div><span>Overall 3-point score</span><strong>{overallThreePointDisplayed}</strong></div><div><span>Class position</span><strong>Not calculated</strong></div><div><span>Learners in selection</span><strong>{learners.length}</strong></div></div>
          {displaySettings.gradingScheme.show && <section className="report-grading-key"><h4>3-Point grading / achievement guide</h4><table><thead><tr>{displaySettings.gradingScheme.percentageRanges && <th>Percentage</th>}{displaySettings.gradingScheme.descriptors && <th>Achievement</th>}{displaySettings.gradingScheme.scaleInformation && <th>Band reference</th>}</tr></thead><tbody>{gradingBands.map((band) => <tr key={band.displayOrder}>{displaySettings.gradingScheme.percentageRanges && <td>{band.minimumPercentage}–{Math.floor(band.maximumPercentage)}</td>}{displaySettings.gradingScheme.descriptors && <td>{band.label}</td>}{displaySettings.gradingScheme.scaleInformation && <td>{band.numericValue} · {band.abbreviation}</td>}</tr>)}</tbody></table><p>Subject 3-point values show the learner’s exact converted score to 1 decimal place; this guide shows band references.</p></section>}
        </>}
        <div className="report-signatories">{displaySettings.commentsSignatures.classTeacherComment && <ReportSignatory title="Class Teacher’s comment" text={cardNarrative.classTeacherComment} person={classTeacher} showSignature={displaySettings.commentsSignatures.classTeacherSignature}/>}{displaySettings.commentsSignatures.headTeacherComment && <ReportSignatory title="Head Teacher’s comment" text={cardNarrative.headTeacherComment} person={headTeacher} showSignature={displaySettings.commentsSignatures.headTeacherSignature}/>}</div>
        {(footerItems.length > 0 || publication) && <footer className={`report-footer report-footer-${footerItems.length + (publication ? 1 : 0)}`}>{footerItems.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}{publication && <div><span>Report reference</span><strong>{publication.reportReference}</strong></div>}</footer>}
        <p className="report-integrity">{publication ? `Published ${new Date(publication.publishedAt).toLocaleDateString("en-UG")} · ${publication.verificationReference} · Page 1 of 1` : "DRAFT · Preview only · Not for issue"}</p>
      </article></div>
    </>}
  </div>;
}
function ALevelReportResults({ results, classSize, paperGrade }) {
    const totalPoints = results.reduce((sum, item) => sum + (item.grade?.points ?? 0), 0);
    const principalCount = results.filter((item) => item.offering.subjectLevel === "PRINCIPAL").length;
    const subsidiaryCount = results.filter((item) => item.offering.subjectLevel !== "PRINCIPAL").length;
    return <>
    <div className="report-table-wrap"><table className="report-results-table report-advanced-table"><thead><tr><th>Subject</th><th>Level</th><th>Paper</th><th>Paper code</th><th>Mark</th><th>Paper grade</th><th>Subject grade</th><th>Teacher</th></tr></thead><tbody>{results.flatMap(({ offering, marks, grade }) => offering.components.map((paper, index) => { const mark = marks[paper.id]; const numericMark = mark?.state === "PRESENT" && mark.value !== "" ? Number(mark.value) : null; const category = (offering.subjectLevel === "OTHER" ? "SUBSIDIARY" : offering.subjectLevel); return <tr key={`${offering.id}:${paper.id}`}>{index === 0 && <td rowSpan={offering.components.length}><strong>{offering.subjectCode}</strong><small>{offering.subjectName}</small></td>}{index === 0 && <td rowSpan={offering.components.length}>{offering.subjectLevel.replaceAll("_", " ")}</td>}<td>{paper.label}</td><td>{offering.subjectCode}/{paper.paperNumber}</td><td>{numericMark === null ? mark?.state ?? "MISSING" : numericMark.toFixed(0)}</td><td>{numericMark === null ? "—" : paperGrade(category, numericMark)}</td>{index === 0 && <td rowSpan={offering.components.length}>{grade?.grade ?? "REFERENCE REQUIRED"}</td>}{index === 0 && <td rowSpan={offering.components.length}>{offering.teacher || "Not allocated"}</td>}</tr>; }))}{!results.length && <tr><td colSpan={8} className="report-no-subjects">Assign an active A-Level combination to this learner.</td></tr>}</tbody></table></div>
    <div className="report-overview report-a-level-summary"><div><span>Principal subjects</span><strong>{principalCount}</strong></div><div><span>Subsidiary / compulsory</span><strong>{subsidiaryCount}</strong></div><div><span>Total points</span><strong>{results.every((item) => item.grade) ? totalPoints : "Pending"}</strong></div><div><span>Class position</span><strong>Not calculated</strong><small>{classSize} learner{classSize === 1 ? "" : "s"} in selection</small></div></div>
    <section className="report-project"><h4>Project / practical assessment</h4><p>No separate project or practical assessment was recorded for this term. Practical papers included above remain part of their configured subject.</p></section>
    <section className="report-grading-key"><h4>A-Level grading guide</h4><p>Paper grades, principal points and subsidiary pass rules are resolved from the active versioned school grading configuration. Reference-required results remain unpublished until an authorised configuration is active.</p></section>
    <p className="a-level-footnote">School progress report only. Combination and paper results do not claim official UNEB/UACE certification.</p>
  </>;
}
function RoleCommentEditor({ label, recordKey, record, value, onChange, onReview, maximumLength }) {
    return <div className="role-comment-editor"><label>{label}<textarea value={value} maxLength={maximumLength} onChange={(event) => onChange(event.target.value)} placeholder="Generate a draft or enter authorised evidence-based wording"/><small>{value.length}/{maximumLength} characters</small></label><CommentRecordStatus record={record} onReview={() => onReview(recordKey)}/></div>;
}
function CommentRecordStatus({ record, onReview }) {
    if (!record)
        return <div className="comment-record-status"><span className="comment-status-not-generated">NOT GENERATED</span><small>No comment draft or evidence snapshot exists.</small></div>;
    const reviewable = record.finalComment.trim() && !["REVIEWED", "EDITED", "APPROVED", "PUBLISHED"].includes(record.status);
    return <div className="comment-record-status"><div><span className={`comment-status-${record.status.toLowerCase().replaceAll("_", "-")}`}>{record.status.replaceAll("_", " ")}</span><small>{record.confidenceState.replaceAll("_", " ")} · Template {record.templateVersion}</small></div>{record.evidenceUsed.length > 0 && <details><summary>Evidence used</summary><ul>{record.evidenceUsed.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></details>}{reviewable && <button type="button" className="table-view-button" onClick={onReview}>Mark reviewed</button>}</div>;
}
function ReportSignatory({ title, text, person, showSignature }) {
    return <section><h4>{title}</h4><p>{text || "Not recorded"}</p><div className="report-signature-meta"><span><b>Name:</b> {person?.name ?? "MISSING ASSIGNMENT"}</span>{showSignature && <span><b>Signature:</b> {person?.signatureUrl ? <img src={person.signatureUrl} alt={`${person.name} signature`}/> : "________________"}</span>}<span><b>Date:</b> ________________</span></div></section>;
}
function ReportSchoolHeader({ header, programme, termName, yearName, learner }) {
    const values = header.values;
    const contacts = header.displayOrder.filter((key) => values[key] && !["logoUrl", "officialName", "shortName", "motto", "slogan"].includes(key)).map((key) => `${reportableProfileFields[key]}: ${values[key]}`);
    const context = [header.reportInformation.programme && (programme === "A_LEVEL" ? "A-Level" : "O-Level"), header.reportInformation.term && termName, header.reportInformation.academicYear && yearName, header.reportInformation.reportType && "Term Report"].filter(Boolean).join(" · ");
    const showLogo = header.displaySettings.media.showSchoolLogo && Boolean(values.logoUrl);
    const showPhoto = header.displaySettings.media.showStudentPhoto && (Boolean(learner.photoUrl) || header.displaySettings.media.missingPhotoPolicy === "NEUTRAL_PLACEHOLDER");
    return <header className={`report-school-header ${showLogo ? "" : "report-header-no-logo"} ${showPhoto ? "" : "report-header-no-photo"}`}>{showLogo && <img className="report-logo-image" src={values.logoUrl} alt="School logo"/>}<div className="report-school-header-copy"><h2>{values.officialName ?? values.shortName ?? "SOMA REPORT ENGINE"}</h2>{values.motto && <em>“{values.motto}”</em>}{values.slogan && <small>{values.slogan}</small>}{contacts.length > 0 && <div className="report-header-contacts">{contacts.map((item) => <span key={item}>{item}</span>)}</div>}{context && <p>{context}</p>}</div>{showPhoto && (learner.photoUrl ? <img className="report-photo report-photo-image" src={learner.photoUrl} alt={`${learner.firstName} ${learner.lastName}`}/> : <div className="report-photo report-photo-placeholder" aria-label="Neutral learner-photo placeholder">{learner.firstName.charAt(0)}{learner.lastName.charAt(0)}</div>)}</header>;
}
