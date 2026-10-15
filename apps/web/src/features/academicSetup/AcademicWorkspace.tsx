import { createContext, useContext, useState, type ReactNode } from "react";

import { currentUser } from "../../config/currentUser";
import { getLearnerFullName, type Learner } from "../learners/LearnerData";
import type { MarkState } from "../marks/gradingConfiguration";
import { activeOLLevelGradingConfiguration, activeThreePointConversionConfiguration, formatThreePoint, getOLLevelGradingBand } from "../marks/gradingConfiguration";
import { getMarksPreview } from "../marks/marksCalculation";
import type { ModerationStatus } from "../marks/moderationData";
import { reportNarrativeComplete, type ReportNarrative, type ResultLock, type ResultApproval, type ReportSnapshot, type ReportPublication } from "../reports/reportingDomain";
import { systemSubjectCatalogue, type Subject, type SystemSubject } from "../subjects/subjectData";
import type { StaffMember } from "../staff/staffData";
import { useSchoolSettings } from "../settings/SchoolSettingsWorkspace";
import { validateALevelGradingScheme, type ALevelGradingScheme, type ALevelSubjectCategory } from "../marks/aLevelGradingConfiguration";
import { aLevelCombinations, getCombination } from "../alevel/aLevelDomain";
import { useSchoolContext } from "../context/SchoolContext";

export type ComponentKey = "continuousAssessment" | "examination";
export type ComponentMarks = {
  continuousAssessment: string;
  examination: string;
  continuousAssessmentState: MarkState;
  examinationState: MarkState;
};

export type SubjectOffering = {
  id: string;
  schoolId: string;
  yearId: string;
  termId: string;
  programme: "O_LEVEL";
  className: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  teacher: string;
  teacherIds?: string[];
  stream?: string;
  competencyId?: string;
  competencyText?: string;
  components: { key: ComponentKey; label: string; maximum: number }[];
};

export type ALevelAssessmentComponent = { id: string; paperNumber: number; label: string; assessmentType: "PAPER"; maximum: 100; weight: number; required: boolean; verificationStatus: "VERIFIED_REFERENCE" | "REFERENCE_REQUIRED"; contributesToReport: boolean };
export type ALevelOffering = { id: string; schoolId: string; yearId: string; termId: string; programme: "A_LEVEL"; className: string; stream?: string; combination: string; subjectName: string; subjectCode: string; subjectLevel: "PRINCIPAL" | "SUBSIDIARY" | "GENERAL_PAPER" | "OTHER"; teacher: string; components: ALevelAssessmentComponent[] };
export type ALevelComponentMark = { value: string; state: MarkState };
export type ALevelMarks = Record<string, ALevelComponentMark>;

export type ReviewBatch = {
  id: string;
  offeringId: string;
  status: ModerationStatus;
  submittedAt: string;
  reviewNote: string;
};

export type ClassStatus = "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED";
export type ClassStream = { id: string; name: string; capacity: number | null; teacherId: string | null };
export type ClassRecord = {
  id: string;
  schoolId: string;
  yearId: string;
  name: string;
  programme: "O_LEVEL" | "A_LEVEL";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  capacity: number | null;
  classTeacherId: string | null;
  promotionDestination: string | null;
  status: ClassStatus;
  streams: ClassStream[];
};
export type ClassInput = Omit<ClassRecord, "id" | "schoolId" | "yearId" | "streams">;
export type StreamInput = Omit<ClassStream, "id">;
export type SubjectCatalogueSelection = { systemSubjectIds: string[]; classNames: string[]; compulsory: boolean };
export type NewStaffInput = Pick<StaffMember, "name" | "email" | "department">;
export type ReportValidation = { status: "READY" | "REQUIRES_ATTENTION" | "REPORT_LAYOUT_REQUIRES_ATTENTION"; issues: string[]; checks: { label: string; passed: boolean; detail: string }[] };
export type AcademicAuditEvent = { type: string; detail: string; at: string };

export const configuredOfferings: SubjectOffering[] = [];

export const configuredALevelOfferings: ALevelOffering[] = [];

export const emptyMarks: ComponentMarks = {
  continuousAssessment: "",
  examination: "",
  continuousAssessmentState: "MISSING",
  examinationState: "MISSING",
};

function markKey(offeringId: string, learnerId: string) {
  return `${offeringId}:${learnerId}`;
}

export function isComplete(marks: ComponentMarks) {
  return marks.continuousAssessmentState === "PRESENT"
    && marks.examinationState === "PRESENT"
    && marks.continuousAssessment !== ""
    && marks.examination !== "";
}

export function getOfferingLearners(offering: SubjectOffering, roster: Learner[]): Learner[] {
  return roster.filter((learner) => learner.status === "Active"
    && learner.programme === "O-Level"
    && learner.className === offering.className
    && (!offering.stream || learner.stream === offering.stream));
}

export function getALevelOfferingLearners(offering: ALevelOffering, roster: Learner[]): Learner[] {
  return roster.filter((learner) => learner.status === "Active" && learner.programme === "A-Level" && learner.className === offering.className && learner.aLevelCombination === offering.combination && (offering.subjectLevel !== "SUBSIDIARY" || getCombination(offering.combination)?.subsidiarySubjectCodes[0] === offering.subjectCode) && (!offering.stream || learner.stream === offering.stream));
}

export type AcademicWorkspaceValue = {
  schoolId: string;
  yearId: string;
  termId: string;
  setTermId: (value: string) => void;
  offerings: SubjectOffering[];
  aLevelOfferings: ALevelOffering[];
  classes: ClassRecord[];
  addClass: (values: ClassInput) => { id: string | null; error: string | null };
  updateClass: (id: string, values: ClassInput) => string | null;
  addStream: (classId: string, values: StreamInput) => string | null;
  deleteClass: (id: string) => string | null;
  deleteStream: (classId: string, streamId: string) => string | null;
  learners: Learner[];
  addLearner: (values: Omit<Learner, "id">) => string | null;
  updateLearner: (id: string, values: Omit<Learner, "id">) => string | null;
  deleteLearner: (id: string) => string | null;
  assignALevelProgramme: (learnerId: string, combination: string) => string | null;
  subjects: Subject[];
  systemSubjects: SystemSubject[];
  addSubjectsFromCatalogue: (values: SubjectCatalogueSelection) => string | null;
  updateSubjectConfiguration: (id: string, values: { classNames: string[]; compulsory: boolean }) => string | null;
  deleteSubject: (id: string) => string | null;
  staff: StaffMember[];
  addStaff: (values: NewStaffInput) => string | null;
  updateStaff: (id: string, values: Pick<StaffMember, "firstName" | "middleName" | "lastName" | "staffNumber" | "initials" | "signatureUrl" | "photoUrl" | "department" | "accountStatus">) => string | null;
  deleteStaff: (id: string) => string | null;
  marks: Record<string, ComponentMarks>;
  aLevelMarks: Record<string, ALevelMarks>;
  batches: ReviewBatch[];
  getMarks: (offeringId: string, learnerId: string) => ComponentMarks;
  saveMarks: (offering: SubjectOffering, learnerId: string, values: ComponentMarks) => string | null;
  getALevelMarks: (offeringId: string, learnerId: string, assessmentId?: string) => ALevelMarks;
  saveALevelMarks: (offering: ALevelOffering, learnerId: string, values: ALevelMarks, assessmentId?: string) => string | null;
  getSelectedALevelPapers: (assessmentId: string, offering: ALevelOffering) => ALevelAssessmentComponent[];
  setSelectedALevelPapers: (assessmentId: string, offering: ALevelOffering, paperIds: string[]) => string | null;
  aLevelGradingSchemes: ALevelGradingScheme[];
  getActiveALevelGradingScheme: (category: ALevelSubjectCategory) => ALevelGradingScheme | undefined;
  saveALevelGradingScheme: (scheme: ALevelGradingScheme, activate: boolean) => string | null;
  submitOffering: (offering: SubjectOffering) => string | null;
  reviewBatch: (batchId: string, status: ModerationStatus, note: string) => string | null;
  reportNarratives: Record<string, ReportNarrative>;
  saveReportNarrative: (learnerId: string, values: Omit<ReportNarrative, "updatedAt" | "updatedBy">) => string | null;
  resultLocks: ResultLock[];
  resultApprovals: ResultApproval[];
  reportSnapshots: ReportSnapshot[];
  reportPublications: ReportPublication[];
  lockClassResults: (className: string) => string | null;
  approveClassResults: (className: string, note: string) => string | null;
  prepareReport: (learnerId: string, authorizedHeadteacher?: { name: string; signatureUrl: string } | null) => string | null;
  publishReport: (snapshotId: string) => string | null;
  getReportValidation: (learnerId: string) => ReportValidation;
  auditEvents: AcademicAuditEvent[];
  recordReportPreview: (learnerId: string) => void;
};

const AcademicWorkspaceContext = createContext<AcademicWorkspaceValue | null>(null);

export function AcademicWorkspaceProvider({ children }: { children: ReactNode }) {
  const schoolContext = useSchoolContext();
  const schoolId = schoolContext.schoolId;
  const yearId = schoolContext.academicYearId;
  const selectedTermId = schoolContext.termId;
  const setSelectedTermId = schoolContext.selectTerm;
  const schoolSettings = useSchoolSettings();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [learnerRecords, setLearnerRecords] = useState<Learner[]>([]);
  const [subjectRecords, setSubjectRecords] = useState<Subject[]>([]);
  const [staffRecords, setStaffRecords] = useState<StaffMember[]>([]);
  const [marks, setMarks] = useState<Record<string, ComponentMarks>>({});
  const [aLevelMarks, setALevelMarks] = useState<Record<string, ALevelMarks>>({});
  const [aLevelPaperSelections, setALevelPaperSelections] = useState<Record<string, string[]>>({});
  const [aLevelGradingSchemes, setALevelGradingSchemes] = useState<ALevelGradingScheme[]>([]);
  const [batches, setBatches] = useState<ReviewBatch[]>([]);
  const [reportNarratives, setReportNarratives] = useState<Record<string, ReportNarrative>>({});
  const [resultLocks, setResultLocks] = useState<ResultLock[]>([]);
  const [resultApprovals, setResultApprovals] = useState<ResultApproval[]>([]);
  const [reportSnapshots, setReportSnapshots] = useState<ReportSnapshot[]>([]);
  const [reportPublications, setReportPublications] = useState<ReportPublication[]>([]);
  const [auditEvents, setAuditEvents] = useState<AcademicAuditEvent[]>([]);

  function addAudit(type: string, detail: string) { setAuditEvents((current) => [{ type, detail, at: new Date().toISOString() }, ...current]); }
  function recordReportPreview(learnerId: string) { addAudit("REPORT_PREVIEWED", `Previewed report for ${learnerRecords.find((item) => item.id === learnerId)?.admissionNumber || learnerId}`); }

  const offerings = configuredOfferings.filter((offering) => offering.schoolId === schoolId
    && offering.yearId === yearId && offering.termId === selectedTermId
    && (!["TEACHER", "CLASS_TEACHER"].includes(currentUser.role) || offering.teacher === currentUser.name));
  const aLevelOfferings = configuredALevelOfferings.filter((offering) => offering.schoolId === schoolId
    && offering.yearId === yearId && offering.termId === selectedTermId
    && (!["TEACHER", "CLASS_TEACHER"].includes(currentUser.role) || offering.teacher === currentUser.name));

  function getMarks(offeringId: string, learnerId: string) {
    return marks[markKey(offeringId, learnerId)] ?? emptyMarks;
  }

  function aLevelMarkKey(assessmentId: string, offeringId: string, learnerId: string) { return `${assessmentId}:${offeringId}:${learnerId}`; }
  function selectionKey(assessmentId: string, offeringId: string) { return `${assessmentId}:${offeringId}`; }
  function getALevelMarks(offeringId: string, learnerId: string, assessmentId = "assessment-003") { return aLevelMarks[aLevelMarkKey(assessmentId, offeringId, learnerId)] ?? {}; }
  function getSelectedALevelPapers(assessmentId: string, offering: ALevelOffering) {
    const selectedIds = aLevelPaperSelections[selectionKey(assessmentId, offering.id)] ?? (assessmentId === "assessment-003" ? offering.components.slice(0, 1).map((item) => item.id) : offering.components.map((item) => item.id));
    return offering.components.filter((item) => selectedIds.includes(item.id));
  }
  function setSelectedALevelPapers(assessmentId: string, offering: ALevelOffering, paperIds: string[]): string | null {
    if (!currentUser.permissions.includes("academics.manage")) return "You cannot configure assessment papers.";
    const validIds = new Set(offering.components.map((item) => item.id));
    if (!paperIds.length) return "Select at least one configured paper.";
    if (paperIds.some((id) => !validIds.has(id))) return "Only papers configured for this subject may be selected.";
    setALevelPaperSelections((current) => ({ ...current, [selectionKey(assessmentId, offering.id)]: [...new Set(paperIds)] }));
    addAudit("ASSESSMENT_PAPERS_SELECTED", `${assessmentId}: ${offering.subjectCode} uses ${paperIds.join(", ")}.`);
    return null;
  }

  function getActiveALevelGradingScheme(category: ALevelSubjectCategory) {
    return aLevelGradingSchemes.find((scheme) => scheme.subjectCategory === category && scheme.status === "ACTIVE" && scheme.effectiveAcademicYear === schoolContext.academicYearName && scheme.effectiveTerm === schoolContext.termName);
  }

  function saveALevelGradingScheme(scheme: ALevelGradingScheme, activate: boolean): string | null {
    if (!currentUser.permissions.includes("settings.manage")) return "You cannot manage A-Level grading settings.";
    const errors = validateALevelGradingScheme(scheme, activate);
    if (errors.length) return errors[0];
    const next = { ...scheme, status: activate ? "ACTIVE" as const : "DRAFT" as const, approvedBy: activate ? currentUser.name : scheme.approvedBy, bands: scheme.bands.map((band, index) => ({ ...band, displayOrder: index + 1 })) };
    setALevelGradingSchemes((current) => [
      ...current.filter((item) => item.id !== next.id).map((item) => activate && item.subjectCategory === next.subjectCategory && item.status === "ACTIVE" ? { ...item, status: "INACTIVE" as const } : item),
      next,
    ]);
    addAudit(activate ? "A_LEVEL_GRADING_ACTIVATED" : "A_LEVEL_GRADING_SAVED", `${next.name} v${next.version} (${next.subjectCategory.replaceAll("_", " ")}).`);
    return null;
  }

  function saveALevelMarks(offering: ALevelOffering, learnerId: string, values: ALevelMarks, assessmentId = "assessment-003"): string | null {
    if (!currentUser.permissions.includes("marks.enter")) return "You cannot enter marks.";
    if (["TEACHER", "CLASS_TEACHER"].includes(currentUser.role) && offering.teacher !== currentUser.name) return "You are not allocated to this A-Level subject.";
    if (offering.termId !== selectedTermId || schoolContext.termStatus !== "MARKS_OPEN") return "Marks are not open for this term.";
    if (classes.find((item) => item.name === offering.className)?.status !== "ACTIVE") return "This class is not active for marks entry.";
    if (!getALevelOfferingLearners(offering, learnerRecords).some((learner) => learner.id === learnerId)) return "This learner is not enrolled in the selected A-Level class and stream.";
    const selectedPapers = getSelectedALevelPapers(assessmentId, offering);
    for (const component of selectedPapers) { const mark = values[component.id] ?? { value: "", state: "MISSING" as MarkState }; if (mark.state === "PRESENT" && (mark.value === "" || !/^\d+(?:\.\d+)?$/.test(mark.value) || Number(mark.value) > component.maximum)) return `${component.label} requires a valid mark from 0 to ${component.maximum}.`; if (mark.state !== "PRESENT" && mark.value !== "") return `${component.label} has a mark but is not marked present.`; }
    setALevelMarks((current) => ({ ...current, [aLevelMarkKey(assessmentId, offering.id, learnerId)]: Object.fromEntries(Object.entries(values).filter(([paperId]) => selectedPapers.some((paper) => paper.id === paperId))) }));
    addAudit("A_LEVEL_MARKS_SAVED", `Saved ${offering.subjectCode} selected paper marks for ${learnerId} in ${offering.className} (${assessmentId}).`);
    return null;
  }

  function saveMarks(offering: SubjectOffering, learnerId: string, values: ComponentMarks): string | null {
    if (!currentUser.permissions.includes("marks.enter")) return "You cannot enter marks.";
    if (["TEACHER", "CLASS_TEACHER"].includes(currentUser.role) && offering.teacher !== currentUser.name) return "You are not allocated to this subject offering.";
    if (offering.termId !== selectedTermId || schoolContext.termStatus !== "MARKS_OPEN") return "Marks are not open for this term.";
    if (classes.find((item) => item.name === offering.className)?.status !== "ACTIVE") return "This class is not active for marks entry.";
    if (!getOfferingLearners(offering, learnerRecords).some((learner) => learner.id === learnerId)) return "This learner is not enrolled in the selected class.";
    if (batches.some((batch) => batch.offeringId === offering.id && batch.status !== "RETURNED")) return "This offering is submitted for review. Return it before editing.";
    for (const component of offering.components) {
      const state = values[`${component.key}State`];
      const raw = values[component.key];
      if (state === "PRESENT" && (raw === "" || !/^\d+(?:\.\d+)?$/.test(raw) || Number(raw) > component.maximum)) return `${component.label} requires a valid mark from 0 to ${component.maximum}.`;
      if (state !== "PRESENT" && raw !== "") return `${component.label} has a mark but is not marked present.`;
    }
    setMarks((current) => ({ ...current, [markKey(offering.id, learnerId)]: { ...values } }));
    addAudit("MARKS_SAVED", `Saved ${offering.subjectCode} marks for ${learnerId} in ${offering.className}.`);
    return null;
  }

  function submitOffering(offering: SubjectOffering): string | null {
    if (!currentUser.permissions.includes("marks.enter")) return "You cannot submit marks.";
    if (["TEACHER", "CLASS_TEACHER"].includes(currentUser.role) && offering.teacher !== currentUser.name) return "You are not allocated to this subject offering.";
    if (offering.termId !== selectedTermId || schoolContext.termStatus !== "MARKS_OPEN") return "Marks are not open for this term.";
    if (classes.find((item) => item.name === offering.className)?.status !== "ACTIVE") return "This class is not active for marks submission.";
    if (batches.some((batch) => batch.offeringId === offering.id && batch.status !== "RETURNED")) return "This offering has already been submitted.";
    const roster = getOfferingLearners(offering, learnerRecords);
    if (!roster.length || roster.some((learner) => !isComplete(getMarks(offering.id, learner.id)))) return "Complete and save every required mark before submission. Absent and exempt states need a separate authorised review.";
    setBatches((current) => [...current.filter((batch) => batch.offeringId !== offering.id), {
      id: `MOD-${offering.id.toUpperCase()}`,
      offeringId: offering.id,
      status: "HOD_REVIEW",
      submittedAt: new Date().toLocaleDateString("en-GB"),
      reviewNote: "",
    }]);
    addAudit("MARKS_SUBMITTED", `Submitted ${offering.subjectCode} marks for ${offering.className} to HOD review.`);
    return null;
  }

  function reviewBatch(batchId: string, status: ModerationStatus, note: string): string | null {
    if (!note.trim()) return "Enter a review reason first.";
    const batch = batches.find((item) => item.id === batchId);
    if (!batch) return "This batch no longer exists.";
    if (status === "READY" && (batch.status !== "HOD_REVIEW" || !currentUser.permissions.includes("marks.review"))) return "HOD review is not available for this batch.";
    if ((status === "MODERATED" || status === "RETURNED") && (batch.status !== "READY" || !currentUser.permissions.includes("marks.moderate"))) return "Moderation is not available for this batch.";
    const offering = configuredOfferings.find((item) => item.id === batch.offeringId);
    if (!offering) return "Subject offering is unavailable.";
    if (status !== "RETURNED" && getOfferingLearners(offering, learnerRecords).some((learner) => !isComplete(getMarks(offering.id, learner.id)))) return "Required marks are incomplete. Return the batch for correction.";
    setBatches((current) => current.map((item) => item.id === batchId ? { ...item, status, reviewNote: note.trim() } : item));
    addAudit("MARKS_REVIEWED", `${offering.subjectCode} for ${offering.className} changed to ${status.replaceAll("_", " ")}. Reason: ${note.trim()}`);
    return null;
  }

  function narrativeKey(learnerId: string) { return `${selectedTermId}:${learnerId}`; }

  function getReportValidation(learnerId: string): ReportValidation {
    const learner = learnerRecords.find((item) => item.id === learnerId && item.status === "Active");
    if (!learner) return { status: "REQUIRES_ATTENTION", issues: ["Learner information is unavailable."], checks: [{ label: "Learner information", passed: false, detail: "Learner information is unavailable." }] };
    const selectedOfferings = offerings.filter((item) => item.className === learner.className && (!item.stream || item.stream === learner.stream));
    const narrative = reportNarratives[narrativeKey(learnerId)];
    const classRecord = classes.find((item) => item.name === learner.className);
    const classTeacher = staffRecords.find((item) => item.id === (classRecord?.streams.find((stream) => stream.name === learner.stream)?.teacherId ?? classRecord?.classTeacherId) && item.accountStatus === "Active");
    const headTeacher = staffRecords.find((item) => item.role === "Head Teacher" && item.accountStatus === "Active");
    const resultPreviews = selectedOfferings.map((offering) => ({ offering, preview: (() => { const mark = getMarks(offering.id, learner.id); return getMarksPreview(mark.continuousAssessment, mark.examination, mark.continuousAssessmentState, mark.examinationState); })() }));
    const teacherProblems = selectedOfferings.flatMap((offering) => {
      if (!offering.teacherIds?.length) return [`${offering.subjectName}: MISSING TEACHER ALLOCATION`];
      const allocated = offering.teacherIds.map((id) => staffRecords.find((item) => item.id === id && item.accountStatus === "Active"));
      if (allocated.some((item) => !item)) return [`${offering.subjectName}: MISSING TEACHER ALLOCATION`];
      if (allocated.some((item) => !item?.initials.trim())) return [`${offering.subjectName}: MISSING TEACHER INITIALS`];
      return [];
    });
    const maxComment = schoolSettings.headerSettings.numberFormatting.maximumCommentLength;
    const maxCompetency = schoolSettings.headerSettings.numberFormatting.maximumCompetencyLength;
    const reportSettings = schoolSettings.headerSettings;
    const layoutIssues = [
      ...(selectedOfferings.length > 10 ? [`${selectedOfferings.length} subjects exceed the one-page limit of 10.`] : []),
      ...selectedOfferings.filter((item) => (item.competencyText?.length ?? 0) > maxCompetency).map((item) => `${item.subjectName} competency exceeds ${maxCompetency} characters.`),
      ...(narrative?.classTeacherComment.length && narrative.classTeacherComment.length > maxComment ? [`Class Teacher comment exceeds ${maxComment} characters.`] : []),
      ...(narrative?.headTeacherComment.length && narrative.headTeacherComment.length > maxComment ? [`Head Teacher comment exceeds ${maxComment} characters.`] : []),
      ...(schoolSettings.headerSettings.visibleFields.length > 8 ? ["Selected report-header fields exceed the compact one-page allowance of 8."] : []),
      ...(activeOLLevelGradingConfiguration.bands.length > 6 ? ["The grading scheme has too many rows for the single-page layout."] : []),
      ...(reportSettings.subjectDisplay !== "SHORT_CODE" && selectedOfferings.some((item) => item.subjectName.length > 28) ? ["One or more full subject names are too long for the selected one-page subject display mode."] : []),
    ];
    const checks = [
      { label: "School logo", passed: !reportSettings.media.showSchoolLogo || Boolean(schoolSettings.profile.logoUrl), detail: reportSettings.media.showSchoolLogo ? "The active School Profile logo asset is required by these report settings." : "Optional and hidden by report settings." },
      { label: "Learner photo", passed: !reportSettings.media.showStudentPhoto || Boolean(learner.photoUrl) || reportSettings.media.missingPhotoPolicy === "NEUTRAL_PLACEHOLDER", detail: learner.photoUrl ? "Active learner-photo asset resolved." : reportSettings.media.missingPhotoPolicy === "NEUTRAL_PLACEHOLDER" ? "Neutral placeholder policy will be used." : "Optional and hidden by report settings." },
      { label: "Learner information", passed: Boolean(learner.admissionNumber && learner.className && learner.stream), detail: "Admission number, class and stream must be complete." },
      { label: "Assessment configuration", passed: selectedOfferings.length > 0 && selectedOfferings.every((item) => item.components.length >= 2 && item.components.reduce((sum, component) => sum + component.maximum, 0) === 100), detail: "Component names and maximum marks come from the active offering configuration and must total 100." },
      { label: "Required marks", passed: selectedOfferings.length > 0 && resultPreviews.every((item) => item.preview.state === "PRESENT"), detail: "Every configured subject must have complete valid marks." },
      { label: "Exact 3-point conversion", passed: activeThreePointConversionConfiguration.approved && activeThreePointConversionConfiguration.status === "ACTIVE" && resultPreviews.every((item) => item.preview.threePointScoreExact !== null), detail: `Approved active conversion v${activeThreePointConversionConfiguration.version} is required.` },
      { label: "Grading descriptors", passed: resultPreviews.every((item) => Boolean(item.preview.gradingLabel)), detail: "Every score must resolve through the active grading bands." },
      { label: "Competency evidence", passed: selectedOfferings.every((item) => Boolean(item.competencyId && item.competencyText)), detail: "Every subject needs configured assessed competency evidence." },
      { label: "Teacher allocations and initials", passed: teacherProblems.length === 0, detail: teacherProblems.join("; ") || "All subject allocations resolve to confirmed initials." },
      { label: "Class Teacher assignment", passed: Boolean(classTeacher), detail: classTeacher ? classTeacher.name : "MISSING CLASS TEACHER ASSIGNMENT" },
      { label: "Class Teacher comment", passed: Boolean(narrative?.classTeacherComment.trim() && narrative.commentRecords.CLASS_TEACHER && ["REVIEWED", "EDITED", "APPROVED", "PUBLISHED"].includes(narrative.commentRecords.CLASS_TEACHER.status)), detail: "A reviewed final comment is required." },
      { label: "Head Teacher assignment", passed: Boolean(headTeacher), detail: headTeacher ? headTeacher.name : "MISSING HEAD TEACHER ASSIGNMENT" },
      { label: "Head Teacher comment", passed: Boolean(narrative?.headTeacherComment.trim() && narrative.commentRecords.HEAD_TEACHER && ["REVIEWED", "EDITED", "APPROVED", "PUBLISHED"].includes(narrative.commentRecords.HEAD_TEACHER.status)), detail: "A reviewed final comment is required." },
      { label: "Grading configuration", passed: Boolean(activeOLLevelGradingConfiguration.isActive && activeOLLevelGradingConfiguration.bands.length), detail: `${activeOLLevelGradingConfiguration.name} v${activeOLLevelGradingConfiguration.version}` },
      { label: "Attendance", passed: !reportSettings.additionalInformation.attendance || Boolean(learner.attendance?.totalDays), detail: reportSettings.additionalInformation.attendance ? "Reliable present and total school days are required when attendance is displayed." : "Optional and hidden by report settings." },
      { label: "Next term date", passed: !reportSettings.additionalInformation.nextTermBegins || Boolean(reportSettings.additionalInformation.nextTermStartDate), detail: reportSettings.additionalInformation.nextTermBegins ? "Configured from School Calendar & Important Dates." : "Optional and hidden by report settings." },
      { label: "Single-page A4 layout", passed: layoutIssues.length === 0, detail: layoutIssues.join("; ") || "Subject, competency, comment, header and grading-key limits pass." },
      { label: "Required approval", passed: resultLocks.some((lock) => lock.className === learner.className && resultApprovals.some((approval) => approval.lockId === lock.id)), detail: "Moderated results must be locked and approved." },
    ];
    const issues = [...teacherProblems, ...layoutIssues, ...checks.filter((item) => !item.passed && !["Teacher allocations and initials", "Single-page A4 layout"].includes(item.label)).map((item) => `${item.label}: ${item.detail}`)];
    return { status: layoutIssues.length ? "REPORT_LAYOUT_REQUIRES_ATTENTION" : issues.length ? "REQUIRES_ATTENTION" : "READY", issues, checks };
  }

  function saveReportNarrative(learnerId: string, values: Omit<ReportNarrative, "updatedAt" | "updatedBy">): string | null {
    if (!currentUser.permissions.includes("reports.narrate")) return "You cannot edit report narratives.";
    const learner = learnerRecords.find((item) => item.id === learnerId && item.status === "Active");
    if (!learner) return "Learner not found in this academic context.";
    if (reportSnapshots.some((item) => item.learner.id === learnerId && resultLocks.some((lock) => lock.id === item.lockId && lock.termId === selectedTermId))) return "A report snapshot exists. Reopening and a new version are required before changing its narrative.";
    const previous = reportNarratives[narrativeKey(learnerId)];
    setReportNarratives((current) => ({ ...current, [narrativeKey(learnerId)]: { ...values, subjectFeedback: Object.fromEntries(Object.entries(values.subjectFeedback).map(([id, feedback]) => [id, { ...feedback }])), commentRecords: Object.fromEntries(Object.entries(values.commentRecords).map(([key, record]) => [key, { ...record, evidenceUsed: [...record.evidenceUsed] }])), updatedAt: new Date().toISOString(), updatedBy: currentUser.name } }));
    if (values.classTeacherComment !== previous?.classTeacherComment) addAudit(values.commentRecords.CLASS_TEACHER?.generationMethod === "DETERMINISTIC_RULES" ? "CLASS_TEACHER_COMMENT_GENERATED" : "CLASS_TEACHER_COMMENT_EDITED", `Updated Class Teacher comment for ${learner.admissionNumber || learner.id}`);
    if (values.headTeacherComment !== previous?.headTeacherComment) addAudit(values.commentRecords.HEAD_TEACHER?.generationMethod === "DETERMINISTIC_RULES" ? "HEAD_TEACHER_COMMENT_GENERATED" : "HEAD_TEACHER_COMMENT_EDITED", `Updated Head Teacher comment for ${learner.admissionNumber || learner.id}`);
    return null;
  }

  function lockClassResults(className: string): string | null {
    if (!currentUser.permissions.includes("results.lock")) return "You cannot lock results.";
    if (resultLocks.some((item) => item.className === className && item.termId === selectedTermId)) return "This class already has a locked result scope.";
    const selectedOfferings = offerings.filter((item) => item.className === className && item.programme === "O_LEVEL");
    const roster = learnerRecords.filter((item) => item.status === "Active" && item.programme === "O-Level" && item.className === className);
    if (!selectedOfferings.length || !roster.length) return "Configure offerings and active learners before locking.";
    if (selectedOfferings.some((item) => !batches.some((batch) => batch.offeringId === item.id && batch.status === "MODERATED"))) return "Every subject offering must be moderated before locking.";
    if (selectedOfferings.some((item) => roster.some((learner) => !isComplete(getMarks(item.id, learner.id))))) return "All required learner marks must be complete before locking.";
    const lock: ResultLock = {
      id: `LOCK-${selectedTermId}-${className.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "-")}`,
      schoolId, yearId, termId: selectedTermId, className, programme: "O_LEVEL",
      lockedAt: new Date().toISOString(), lockedBy: currentUser.name,
      gradingName: activeOLLevelGradingConfiguration.name, gradingVersion: activeOLLevelGradingConfiguration.version,
      conversionName: activeThreePointConversionConfiguration.name, conversionVersion: activeThreePointConversionConfiguration.version,
      learners: roster.map((learner) => { const subjects = selectedOfferings.map((offering) => {
        const marks = getMarks(offering.id, learner.id);
        const result = getMarksPreview(marks.continuousAssessment, marks.examination, marks.continuousAssessmentState, marks.examinationState);
        const allocatedTeachers = (offering.teacherIds ?? []).map((id) => staffRecords.find((item) => item.id === id)).filter((item): item is StaffMember => Boolean(item));
        if (!result.gradingBandId || result.threePointScoreExact === null || !offering.competencyId || !offering.competencyText || !allocatedTeachers.length || allocatedTeachers.some((item) => !item.initials)) throw new Error(`Report evidence is incomplete for ${offering.subjectName}.`);
        return { offeringId: offering.id, subjectCode: offering.subjectCode, subjectName: offering.subjectName, teacher: offering.teacher,
          components: offering.components.map((component) => ({ key: component.key, label: component.label, maximum: component.maximum, value: marks[component.key] })),
          total: Number(result.total), percentageScore: Number(result.total), threePointScoreExact: result.threePointScoreExact, threePointScoreDisplayed: result.threePointScoreDisplayed, gradingBandId: result.gradingBandId, grade: result.grade, descriptor: result.descriptor, gradingDescriptor: result.gradingLabel, competencyId: offering.competencyId, competencyText: offering.competencyText, teacherAllocationId: offering.id, teacherIds: [...(offering.teacherIds ?? [])], teacherInitials: allocatedTeachers.map((item) => item.initials).join(" / ") };
      }); const average = subjects.reduce((sum, subject) => sum + subject.total, 0) / subjects.length;
        const band = getOLLevelGradingBand(average);
        if (!band) throw new Error("No active grading band for a complete locked result.");
        const exactOverall = subjects.reduce((sum, subject) => sum + subject.threePointScoreExact, 0) / subjects.length;
        return { learner: { ...learner }, subjects, overall: { average, grade: formatThreePoint(exactOverall), descriptor: band.label, narrative: band.descriptor, threePointScoreExact: exactOverall, threePointScoreDisplayed: formatThreePoint(exactOverall), aggregationRule: activeThreePointConversionConfiguration.aggregationRule } };
      }),
    };
    setResultLocks((current) => [...current, lock]);
    addAudit("RESULTS_LOCKED", `Locked ${className} results for ${selectedTermId}`);
    return null;
  }

  function approveClassResults(className: string, note: string): string | null {
    if (!currentUser.permissions.includes("results.approve")) return "You cannot approve results.";
    if (!note.trim()) return "Record an approval reason.";
    const lock = resultLocks.find((item) => item.className === className && item.termId === selectedTermId);
    if (!lock) return "Lock this class after moderation first.";
    if (resultApprovals.some((item) => item.lockId === lock.id)) return "This locked result scope is already approved.";
    setResultApprovals((current) => [...current, { lockId: lock.id, approvedAt: new Date().toISOString(), approvedBy: currentUser.name, note: note.trim() }]);
    addAudit("RESULTS_APPROVED", `Approved ${className} results. Reason: ${note.trim()}`);
    return null;
  }

  function prepareReport(learnerId: string, authorizedHeadteacher?: { name: string; signatureUrl: string } | null): string | null {
    if (!currentUser.permissions.includes("reports.generate")) return "You cannot prepare report cards.";
    const lock = resultLocks.find((item) => item.termId === selectedTermId && item.learners.some((entry) => entry.learner.id === learnerId));
    if (!lock || !resultApprovals.some((item) => item.lockId === lock.id)) return "Moderate, lock and approve this learner's class results first.";
    if (reportSnapshots.some((item) => item.lockId === lock.id && item.learner.id === learnerId)) return "A report snapshot already exists. Corrections require a new version workflow.";
    const record = lock.learners.find((item) => item.learner.id === learnerId);
    const narrative = reportNarratives[narrativeKey(learnerId)];
    if (!record || !reportNarrativeComplete(narrative, record.subjects.map((item) => item.offeringId))) return "Complete and save the reviewed Class Teacher and Head Teacher comments first.";
    const validation = getReportValidation(learnerId); if (validation.status !== "READY") return validation.issues[0] ?? "Report validation requires attention.";
    const classRecord = classes.find((item) => item.name === record.learner.className);
    const classTeacher = staffRecords.find((item) => item.id === (classRecord?.streams.find((stream) => stream.name === record.learner.stream)?.teacherId ?? classRecord?.classTeacherId) && item.accountStatus === "Active");
    const headTeacher = staffRecords.find((item) => item.role === "Head Teacher" && item.accountStatus === "Active");
    if (!classTeacher || !headTeacher) return "Class Teacher and Head Teacher assignments are required.";
    const snapshot: ReportSnapshot = {
      id: `REPORT-${lock.id}-${learnerId}-V1`, lockId: lock.id, version: 1,
      preparedAt: new Date().toISOString(), preparedBy: currentUser.name,
        learner: { ...record.learner }, schoolName: schoolContext.schoolName, schoolBadge: schoolContext.schoolLogo, yearName: schoolContext.academicYearName,
      termName: lock.termId === schoolContext.termId ? schoolContext.termName : "Selected term",
      programme: "O_LEVEL", className: lock.className, stream: record.learner.stream,
      gradingName: lock.gradingName, gradingVersion: lock.gradingVersion,
      conversionName: lock.conversionName, conversionVersion: lock.conversionVersion,
      subjects: record.subjects.map((item) => ({ ...item, components: item.components.map((component) => ({ ...component })) })),
      overall: { ...record.overall },
        narrative: { ...narrative, subjectFeedback: Object.fromEntries(Object.entries(narrative.subjectFeedback).map(([id, feedback]) => [id, { ...feedback }])), commentRecords: Object.fromEntries(Object.entries(narrative.commentRecords).map(([key, comment]) => [key, { ...comment, status: "APPROVED", evidenceUsed: [...comment.evidenceUsed] }])) },
        headerSnapshot: schoolSettings.resolveHeader(),
        gradingBands: activeOLLevelGradingConfiguration.bands.map((band) => ({ ...band })),
        classTeacher: { id: classTeacher.id, name: classTeacher.name, signatureUrl: classTeacher.signatureUrl, signatureStatus: classTeacher.signatureUrl ? "DIGITAL_CONFIGURED" : "HANDWRITTEN" },
        headTeacher: { id: headTeacher.id, name: authorizedHeadteacher?.name || headTeacher.name, signatureUrl: authorizedHeadteacher?.signatureUrl || "", signatureStatus: authorizedHeadteacher?.signatureUrl ? "DIGITAL_CONFIGURED" : "HANDWRITTEN" },
    };
    setReportSnapshots((current) => [...current, snapshot]);
    addAudit("REPORT_GENERATED", `Prepared immutable report snapshot ${snapshot.id}`);
    addAudit("CLASS_TEACHER_COMMENT_APPROVED", `Approved Class Teacher comment in ${snapshot.id}`);
    addAudit("HEAD_TEACHER_COMMENT_APPROVED", `Approved Head Teacher comment in ${snapshot.id}`);
    return null;
  }

  function publishReport(snapshotId: string): string | null {
    if (!currentUser.permissions.includes("reports.publish")) return "You cannot publish reports.";
    const snapshot = reportSnapshots.find((item) => item.id === snapshotId);
      if (!snapshot) return "Prepare an approved report snapshot first.";
      if (reportPublications.some((item) => item.snapshotId === snapshotId)) return "This report version is already published in this review session.";
      if (!resultApprovals.some((item) => item.lockId === snapshot.lockId)) return "The source result lock is not approved.";
      if (!reportNarrativeComplete(snapshot.narrative, snapshot.subjects.map((item) => item.offeringId))) return "Every required report comment must be reviewed and frozen before publication.";
      if (!snapshot.subjects.every((item) => item.competencyId && item.teacherIds.length && item.teacherInitials && item.threePointScoreDisplayed) || !snapshot.gradingBands.length || !snapshot.classTeacher.id || !snapshot.headTeacher.id) return "The immutable report snapshot is missing required report evidence.";
      const publishedAt = new Date().toISOString();
      const reportReference = `${snapshot.headerSnapshot.values.schoolCode ?? "OS"}-${snapshot.yearName}-${snapshot.termName.replace(/\D/g, "") || "T"}-${snapshot.className.replaceAll(/[^A-Za-z0-9]/g, "").toUpperCase()}-${snapshot.learner.admissionNumber.replaceAll(/[^A-Za-z0-9]/g, "").slice(-3).padStart(3, "0")}`;
      setReportPublications((current) => [...current, { snapshotId, publishedAt, publishedBy: currentUser.name, reportReference, verificationReference: `VR-${crypto.randomUUID().slice(0, 8).toUpperCase()}` }]);
      addAudit("REPORT_PUBLISHED", `Published immutable report snapshot ${snapshotId}`);
    return null;
  }

  function validateLearner(values: Omit<Learner, "id">, existingId?: string): string | null {
    if (!values.firstName.trim() || !values.lastName.trim() || (!existingId && !values.admissionNumber.trim())) return "Name and admission number are required for a new learner.";
    if (learnerRecords.some((item) => item.id !== existingId && item.admissionNumber.toLowerCase() === values.admissionNumber.trim().toLowerCase())) return "This admission number is already registered.";
    const placement = classes.find((item) => item.name === values.className && item.programme === (values.programme === "O-Level" ? "O_LEVEL" : "A_LEVEL"));
    if (!placement) return "The class does not match the selected programme.";
    if (placement.status !== "ACTIVE" && !(existingId && learnerRecords.some((item) => item.id === existingId && item.className === values.className))) return "Learners can only be placed in an active class.";
    const stream = placement.streams.find((item) => item.name === values.stream);
    if (!stream) return "Select a configured stream for this class.";
    if (!existingId) {
      const classCount = learnerRecords.filter((item) => item.className === values.className && item.status === "Active").length;
      const streamCount = learnerRecords.filter((item) => item.className === values.className && item.stream === values.stream && item.status === "Active").length;
      if (placement.capacity !== null && classCount >= placement.capacity) return "This class is at capacity.";
      if (stream.capacity !== null && streamCount >= stream.capacity) return "This stream is at capacity.";
    }
    return null;
  }

  function addLearner(values: Omit<Learner, "id">): string | null {
    const error = validateLearner(values);
    if (error) return error;
    if (batches.some((batch) => batch.status !== "RETURNED" && configuredOfferings.some((offering) => offering.id === batch.offeringId && offering.className === values.className))) return "This class already has a submitted batch. Return it before changing the roster.";
    const id = `LRN-SESSION-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setLearnerRecords((current) => [...current, { ...values, id }]);
    addAudit("LEARNER_REGISTERED", `Registered ${values.admissionNumber} in ${values.className} · ${values.stream}.`);
    return null;
  }

  function updateLearner(id: string, values: Omit<Learner, "id">): string | null {
    if (currentUser.role !== "SCHOOL_ADMIN" || !currentUser.permissions.includes("users.manage")) return "Only the School Administrator can edit learner records.";
    const original = learnerRecords.find((item) => item.id === id);
    if (!original) return "Learner not found.";
    if (original.className !== values.className || original.stream !== values.stream || original.programme !== values.programme || original.status !== values.status) return "Placement and enrolment-status changes require an enrolment-history workflow. They cannot overwrite the current record.";
    const error = validateLearner(values, id);
    if (error) return error;
    setLearnerRecords((current) => current.map((item) => item.id === id ? { ...values, id } : item));
    addAudit("LEARNER_UPDATED", `Updated learner ${values.admissionNumber}.`);
    return null;
  }

  function deleteLearner(id: string): string | null {
    if (currentUser.role !== "SCHOOL_ADMIN" || !currentUser.permissions.includes("users.manage")) return "Only the School Administrator can delete learner records.";
    const learner = learnerRecords.find((item) => item.id === id);
    if (!learner) return "Learner not found.";
    if (!id.startsWith("LRN-SESSION-")) return "Existing learner records require a withdrawal and history workflow; only new, uncommitted review records can be deleted.";
    if (Object.keys(marks).some((key) => key.endsWith(`:${id}`))) return "This learner has saved marks and cannot be deleted.";
    if (batches.some((batch) => batch.status !== "RETURNED" && configuredOfferings.some((offering) => offering.id === batch.offeringId && offering.className === learner.className))) return "This class has submitted marks. Return the batch before changing its roster.";
    setLearnerRecords((current) => current.filter((item) => item.id !== id));
    addAudit("LEARNER_DELETED", `Deleted uncommitted learner ${learner.admissionNumber}.`);
    return null;
  }

  function assignALevelProgramme(learnerId: string, combination: string): string | null {
    if (!currentUser.permissions.includes("academics.manage")) return "Only an authorised School Administrator or DOS can assign A-Level subjects.";
    const learner = learnerRecords.find((item) => item.id === learnerId);
    if (!learner || learner.programme !== "A-Level" || !["Senior 5", "Senior 6"].includes(learner.className)) return "Select an active Senior 5 or Senior 6 learner.";
    const definition = aLevelCombinations.find((item) => item.code === combination && item.status === "ACTIVE");
    if (!definition) return "Select an active A-Level combination.";
    const subsidiarySubjectCode = definition.subsidiarySubjectCodes[0];
    if (!subsidiarySubjectCode) return "The combination does not have exactly one subsidiary subject.";
    setLearnerRecords((current) => current.map((item) => item.id === learnerId ? { ...item, aLevelCombination: combination, aLevelSubsidiarySubjectCode: subsidiarySubjectCode } : item));
    addAudit("A_LEVEL_LEARNER_COMBINATION_ASSIGNED", `Assigned ${combination}; its three principals, subsidiary ${subsidiarySubjectCode}, and automatic GP resolve for ${learner.admissionNumber}.`);
    return null;
  }

  function validateClass(values: ClassInput, existingId?: string): string | null {
    if (!currentUser.permissions.includes("academics.manage")) return "You cannot manage classes.";
    if (!values.name.trim()) return "Enter a class name.";
    if ((values.programme === "O_LEVEL" && values.level > 4) || (values.programme === "A_LEVEL" && values.level < 5)) return "The level does not match the programme.";
    if (classes.some((item) => item.id !== existingId && item.yearId === yearId && item.name.toLowerCase() === values.name.trim().toLowerCase())) return `A class with this name already exists in ${schoolContext.academicYearName || "the selected academic year"}.`;
    if (values.capacity !== null && (!Number.isInteger(values.capacity) || values.capacity < 1)) return "Capacity must be a positive whole number.";
    return null;
  }

  function addClass(values: ClassInput): { id: string | null; error: string | null } {
    const error = validateClass(values);
    if (error) return { id: null, error };
    const id = `class-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setClasses((current) => [...current, { ...values, name: values.name.trim(), id, schoolId, yearId, streams: [] }]);
    addAudit("CLASS_CREATED", `Created ${values.name.trim()} for the active academic year.`);
    return { id, error: null };
  }

  function updateClass(id: string, values: ClassInput): string | null {
    const original = classes.find((item) => item.id === id);
    if (!original) return "Class not found.";
    const error = validateClass(values, id);
    if (error) return error;
    if ((original.name !== values.name.trim() || original.programme !== values.programme || original.level !== values.level) && (learnerRecords.some((learner) => learner.className === original.name) || configuredOfferings.some((offering) => offering.className === original.name))) return "A class with learners or subject offerings cannot be renamed or moved to another programme in this review.";
    const transitions: Record<ClassStatus, ClassStatus[]> = { DRAFT: ["DRAFT", "ACTIVE"], ACTIVE: ["ACTIVE", "CLOSED"], CLOSED: ["CLOSED", "ARCHIVED"], ARCHIVED: ["ARCHIVED"] };
    if (!transitions[original.status].includes(values.status)) return "Class status can only advance from Draft to Active to Closed to Archived.";
    if (values.capacity !== null && learnerRecords.filter((learner) => learner.className === original.name && learner.status === "Active").length > values.capacity) return "Capacity cannot be lower than current active enrolment.";
    setClasses((current) => current.map((item) => item.id === id ? { ...item, ...values, name: values.name.trim() } : item));
    addAudit("CLASS_UPDATED", `Updated ${original.name}.`);
    return null;
  }

  function addStream(classId: string, values: StreamInput): string | null {
    if (!currentUser.permissions.includes("academics.manage")) return "You cannot manage streams.";
    const classRecord = classes.find((item) => item.id === classId);
    if (!classRecord) return "Class not found.";
    if (classRecord.status === "CLOSED" || classRecord.status === "ARCHIVED") return "Closed classes cannot accept new streams.";
    if (!values.name.trim()) return "Enter a stream name.";
    if (classRecord.streams.some((item) => item.name.toLowerCase() === values.name.trim().toLowerCase())) return "This stream already exists in the class.";
    if (values.capacity !== null && (!Number.isInteger(values.capacity) || values.capacity < 1)) return "Stream capacity must be a positive whole number.";
    const stream: ClassStream = { ...values, name: values.name.trim(), id: `stream-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    setClasses((current) => current.map((item) => item.id === classId ? { ...item, streams: [...item.streams, stream] } : item));
    addAudit("CLASS_STREAM_CREATED", `Added ${stream.name} stream to ${classRecord.name}.`);
    return null;
  }

  function deleteStream(classId: string, streamId: string): string | null {
    if (!currentUser.permissions.includes("academics.manage")) return "You cannot delete streams.";
    const classRecord = classes.find((item) => item.id === classId);
    const stream = classRecord?.streams.find((item) => item.id === streamId);
    if (!classRecord || !stream) return "Stream not found.";
    if (!streamId.startsWith("stream-session-")) return "Existing streams require historical enrolment handling; only new review streams can be deleted.";
    if (learnerRecords.some((item) => item.className === classRecord.name && item.stream === stream.name)) return "This stream has learners and cannot be deleted.";
    setClasses((current) => current.map((item) => item.id === classId ? { ...item, streams: item.streams.filter((entry) => entry.id !== streamId) } : item));
    addAudit("CLASS_STREAM_DELETED", `Deleted ${stream.name} stream from ${classRecord.name}.`);
    return null;
  }

  function deleteClass(id: string): string | null {
    if (!currentUser.permissions.includes("academics.manage")) return "You cannot delete classes.";
    const classRecord = classes.find((item) => item.id === id);
    if (!classRecord) return "Class not found.";
    if (!id.startsWith("class-session-")) return "Existing classes must be closed or archived, not deleted.";
    if (learnerRecords.some((item) => item.className === classRecord.name)) return "This class has learners and cannot be deleted.";
    if (configuredOfferings.some((item) => item.className === classRecord.name)) return "This class has subject offerings and cannot be deleted.";
    if (classes.some((item) => item.id !== id && item.promotionDestination === classRecord.name)) return "Another class uses this as its promotion destination.";
    setClasses((current) => current.filter((item) => item.id !== id));
    addAudit("CLASS_DELETED", `Deleted uncommitted class ${classRecord.name}.`);
    return null;
  }

  function addSubjectsFromCatalogue(values: SubjectCatalogueSelection): string | null {
    if (!currentUser.permissions.includes("academics.manage")) return "You cannot manage subjects.";
    if (!values.systemSubjectIds.length) return "Select at least one system subject.";
    if (!values.classNames.length) return "Select at least one class.";
    const selected = systemSubjectCatalogue.filter((item) => values.systemSubjectIds.includes(item.id));
    if (selected.length !== values.systemSubjectIds.length) return "One or more catalogue subjects are unavailable.";
    if (selected.some((subject) => values.classNames.some((className) => classes.find((item) => item.name === className)?.programme !== subject.programme))) return "Selected classes must match the catalogue programme.";
    const newSelections = selected.filter((subject) => !subjectRecords.some((item) => item.systemSubjectId === subject.id));
    if (!newSelections.length) return "Every selected system subject is already offered by this school.";
    setSubjectRecords((current) => [...current, ...newSelections.map((subject, index): Subject => ({
      id: `school-subject-session-${Date.now()}-${index}`, systemSubjectId: subject.id, source: "SYSTEM_CATALOGUE",
      code: subject.subjectCode ?? "PENDING",
      name: subject.name, department: subject.department, programme: subject.programme === "O_LEVEL" ? "O-Level" : "A-Level",
      classNames: [...values.classNames], compulsory: values.compulsory, status: "Active", verificationStatus: subject.verificationStatus,
    }))]);
    addAudit("SUBJECTS_SELECTED", `Selected ${newSelections.map((item) => item.subjectCode).join(", ")} for ${values.classNames.join(", ")}.`);
    return null;
  }

  function deleteSubject(id: string): string | null {
    if (!currentUser.permissions.includes("academics.manage")) return "You cannot delete subjects.";
    const subject = subjectRecords.find((item) => item.id === id);
    if (!subject) return "Subject not found.";
    if (configuredOfferings.some((item) => item.subjectId === id)) return "This school subject is used by a class offering and cannot be deleted.";
    if (staffRecords.some((item) => item.subjects.includes(subject.name))) return "This subject is assigned to staff and cannot be deleted.";
    if (!id.startsWith("school-subject-session-")) return "Existing school offerings require deactivation and history; only new review selections can be removed.";
    setSubjectRecords((current) => current.filter((item) => item.id !== id));
    addAudit("SUBJECT_DELETED", `Deleted uncommitted subject ${subject.code}.`);
    return null;
  }

  function updateSubjectConfiguration(id: string, values: { classNames: string[]; compulsory: boolean }): string | null {
    if (!currentUser.permissions.includes("academics.manage")) return "You cannot manage subjects.";
    const subject = subjectRecords.find((item) => item.id === id);
    if (!subject) return "Subject not found.";
    if (!values.classNames.length) return "Select at least one class.";
    const programme = subject.programme === "O-Level" ? "O_LEVEL" : "A_LEVEL";
    if (values.classNames.some((className) => classes.find((item) => item.name === className)?.programme !== programme)) return "Every selected class must match the subject programme.";
    const configuredClasses = configuredOfferings.filter((item) => item.subjectId === id).map((item) => item.className);
    if (configuredClasses.some((className) => !values.classNames.includes(className))) return "A class with a teacher or assessment offering cannot be removed here.";
    setSubjectRecords((current) => current.map((item) => item.id === id ? { ...item, classNames: [...values.classNames], compulsory: values.compulsory } : item));
    addAudit("SUBJECT_CONFIGURATION_UPDATED", `Updated ${subject.code} allocation for ${values.classNames.join(", ")}.`);
    return null;
  }

  function addStaff(values: NewStaffInput): string | null {
    if (!currentUser.permissions.includes("users.manage")) return "You cannot manage staff.";
    const name = values.name.trim();
    const email = values.email.trim().toLowerCase();
    const department = values.department.trim();
    if (!name || !email || !department) return "Name, email and department are required.";
    if (staffRecords.some((item) => item.email.toLowerCase() === email)) return "This email is already used by a staff record.";
    const id = `teacher-session-${Date.now()}`;
    const parts = name.split(/\s+/); const firstName = parts[0] ?? ""; const lastName = parts.at(-1) ?? ""; const middleName = parts.slice(1, -1).join(" ");
    setStaffRecords((current) => [...current, { id, staffNumber: `STAFF-${current.length + 1}`, initials: [firstName, middleName, lastName].filter(Boolean).map((part) => part[0]).join("").toUpperCase(), firstName, middleName, lastName, signatureUrl: "", name, email, department, phone: "", role: "Teacher", accountStatus: "Inactive", classes: 0, subjects: [], submissionRate: 0, missingMarks: 0, moderationPending: 0, lastActive: "Never", allocations: [] }]);
    addAudit("STAFF_CREATED", `Created staff profile for ${name}.`);
    return null;
  }

  function updateStaff(id: string, values: Pick<StaffMember, "firstName" | "middleName" | "lastName" | "staffNumber" | "initials" | "signatureUrl" | "photoUrl" | "department" | "accountStatus">): string | null {
    if (!currentUser.permissions.includes("users.manage")) return "You cannot manage staff.";
    const member = staffRecords.find((item) => item.id === id); if (!member) return "Staff record not found.";
    const initials = values.initials.trim().toUpperCase();
    if (!values.firstName.trim() || !values.lastName.trim() || !values.staffNumber.trim() || !initials) return "First name, last name, staff number and confirmed initials are required.";
    if (!/^[A-Z]{1,6}(?:\s*\/\s*[A-Z]{1,6})*$/.test(initials)) return "Teacher initials must use letters, or slash-separated initials for an authorised team.";
    if (staffRecords.some((item) => item.id !== id && item.staffNumber.toLowerCase() === values.staffNumber.trim().toLowerCase())) return "This staff number is already in use.";
    const name = [values.firstName.trim(), values.middleName.trim(), values.lastName.trim()].filter(Boolean).join(" ");
    setStaffRecords((current) => current.map((item) => item.id === id ? { ...item, ...values, staffNumber: values.staffNumber.trim(), initials, name } : item));
    addAudit("STAFF_UPDATED", `Updated staff profile for ${name}.`);
    if (initials !== member.initials) addAudit("TEACHER_INITIALS_CHANGED", `${member.name}: ${member.initials} → ${initials}. Historical snapshots remain unchanged.`);
    return null;
  }

  function deleteStaff(id: string): string | null {
    if (!currentUser.permissions.includes("users.manage")) return "You cannot delete staff.";
    const member = staffRecords.find((item) => item.id === id);
    if (!member) return "Staff record not found.";
    if (classes.some((item) => item.classTeacherId === id || item.streams.some((stream) => stream.teacherId === id))) return "This teacher is assigned to a class or stream.";
    if (member.allocations.length || configuredOfferings.some((item) => item.teacher === member.name)) return "This teacher has subject allocations and cannot be deleted.";
    if (!id.startsWith("teacher-session-")) return "Existing staff accounts require deactivation and audit history; only new review records can be deleted.";
    setStaffRecords((current) => current.filter((item) => item.id !== id));
    addAudit("STAFF_DELETED", `Deleted uncommitted staff profile for ${member.name}.`);
    return null;
  }

  return <AcademicWorkspaceContext.Provider value={{ schoolId, yearId, termId: selectedTermId, setTermId: setSelectedTermId, offerings, aLevelOfferings, classes, addClass, updateClass, addStream, deleteClass, deleteStream, learners: learnerRecords, addLearner, updateLearner, deleteLearner, assignALevelProgramme, subjects: subjectRecords, systemSubjects: systemSubjectCatalogue, addSubjectsFromCatalogue, updateSubjectConfiguration, deleteSubject, staff: staffRecords, addStaff, updateStaff, deleteStaff, marks, aLevelMarks, aLevelGradingSchemes, getActiveALevelGradingScheme, saveALevelGradingScheme, batches, getMarks, saveMarks, getALevelMarks, saveALevelMarks, getSelectedALevelPapers, setSelectedALevelPapers, submitOffering, reviewBatch, reportNarratives, saveReportNarrative, resultLocks, resultApprovals, reportSnapshots, reportPublications, lockClassResults, approveClassResults, prepareReport, publishReport, getReportValidation, auditEvents, recordReportPreview }}>{children}</AcademicWorkspaceContext.Provider>;
}

export function useAcademicWorkspace() {
  const context = useContext(AcademicWorkspaceContext);
  if (!context) throw new Error("Academic workspace is not available.");
  return context;
}

export function learnerDisplayName(learner: Learner) {
  return getLearnerFullName(learner).toUpperCase();
}

export function staffAcademicSummary(member: StaffMember, workspace: AcademicWorkspaceValue) {
  const offerings = workspace.offerings.filter((offering) => offering.teacher === member.name);
  const subjects = [...new Set(offerings.map((offering) => offering.subjectName))];
  const classes = new Set(offerings.map((offering) => offering.className)).size;
  const total = offerings.reduce((sum, offering) => sum + getOfferingLearners(offering, workspace.learners).length * offering.components.length, 0);
  const recorded = offerings.reduce((sum, offering) => sum + getOfferingLearners(offering, workspace.learners).reduce((learnerSum, learner) => {
    const marks = workspace.getMarks(offering.id, learner.id);
    return learnerSum + offering.components.filter((component) => marks[`${component.key}State`] === "PRESENT" && marks[component.key] !== "").length;
  }, 0), 0);
  return { subjects, classes, submissionRate: total ? Math.round(recorded / total * 100) : 0, missingMarks: total - recorded, moderationPending: workspace.batches.filter((batch) => batch.status === "READY" && offerings.some((offering) => offering.id === batch.offeringId)).length };
}
