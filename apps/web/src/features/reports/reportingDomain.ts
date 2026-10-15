import type { Learner } from "../learners/LearnerData";
import type { ComponentMarks } from "../academicSetup/AcademicWorkspace";
import type { ResolvedReportHeader } from "../settings/SchoolSettingsWorkspace";
import type { GradingBand } from "../marks/gradingConfiguration";

export type SubjectFeedback = {
  achievement: string;
  improvement: string;
  nextStep: string;
  teacherComment: string;
};

export type ReportCommentRole = "SUBJECT_TEACHER" | "CLASS_TEACHER" | "HOD" | "DOS" | "HEAD_TEACHER" | "CUSTOM_REPORT_ROLE";
export type ReportCommentStatus = "NOT_GENERATED" | "GENERATED" | "REVIEWED" | "EDITED" | "APPROVED" | "PUBLISHED" | "REQUIRES_ATTENTION";
export type ReportCommentRecord = {
  roleType: ReportCommentRole;
  subjectOfferingId?: string;
  generatedComment: string;
  editedComment: string | null;
  finalComment: string;
  status: ReportCommentStatus;
  evidenceUsed: string[];
  templateVersion: string;
  generationMethod: "DETERMINISTIC_RULES" | "MANUAL";
  confidenceState: "SUFFICIENT_EVIDENCE" | "LIMITED_EVIDENCE" | "INCOMPLETE_EVIDENCE";
  responsibleUser: string | null;
  generatedAt: string;
  reviewedAt: string | null;
};

export type ReportNarrative = {
  classTeacherComment: string;
  directorOfStudiesComment: string;
  headTeacherComment: string;
  subjectFeedback: Record<string, SubjectFeedback>;
  commentRecords: Record<string, ReportCommentRecord>;
  updatedAt: string;
  updatedBy: string;
};

export const emptySubjectFeedback: SubjectFeedback = {
  achievement: "", improvement: "", nextStep: "", teacherComment: "",
};

export type LockedSubjectResult = {
  offeringId: string;
  subjectCode: string;
  subjectName: string;
  teacher: string;
  components: { key: string; label: string; maximum: number; value: string }[];
  total: number;
  percentageScore: number;
  threePointScoreExact: number;
  threePointScoreDisplayed: string;
  gradingBandId: string;
  grade: string;
  descriptor: string;
  gradingDescriptor: string;
  competencyId: string;
  competencyText: string;
  teacherAllocationId: string;
  teacherIds: string[];
  teacherInitials: string;
};

export type LockedOverallResult = {
  average: number;
  grade: string;
  descriptor: string;
  narrative: string;
  threePointScoreExact: number;
  threePointScoreDisplayed: string;
  aggregationRule: string;
};

export type ResultLock = {
  id: string;
  schoolId: string;
  yearId: string;
  termId: string;
  className: string;
  programme: "O_LEVEL";
  lockedAt: string;
  lockedBy: string;
  gradingName: string;
  gradingVersion: string;
  conversionName: string;
  conversionVersion: string;
  learners: { learner: Learner; subjects: LockedSubjectResult[]; overall: LockedOverallResult }[];
};

export type ResultApproval = {
  lockId: string;
  approvedAt: string;
  approvedBy: string;
  note: string;
};

export type ReportSnapshot = {
  id: string;
  lockId: string;
  version: number;
  preparedAt: string;
  preparedBy: string;
  learner: Learner;
  schoolName: string;
  schoolBadge?: string;
  yearName: string;
  termName: string;
  programme: "O_LEVEL";
  className: string;
  stream: string;
  gradingName: string;
  gradingVersion: string;
  conversionName: string;
  conversionVersion: string;
  subjects: LockedSubjectResult[];
  overall: LockedOverallResult;
  narrative: ReportNarrative;
  headerSnapshot: ResolvedReportHeader;
  gradingBands: GradingBand[];
  classTeacher: { id: string; name: string; signatureUrl: string; signatureStatus: "HANDWRITTEN" | "DIGITAL_CONFIGURED" };
  headTeacher: { id: string; name: string; signatureUrl: string; signatureStatus: "HANDWRITTEN" | "DIGITAL_CONFIGURED" };
};

export type ReportPublication = {
  snapshotId: string;
  publishedAt: string;
  publishedBy: string;
  reportReference: string;
  verificationReference: string;
};

export function reportNarrativeComplete(narrative: ReportNarrative | undefined, offeringIds: string[]) {
  void offeringIds;
  if (!narrative?.classTeacherComment.trim() || !narrative.headTeacherComment.trim()) return false;
  const acceptedStatuses: ReportCommentStatus[] = ["REVIEWED", "EDITED", "APPROVED", "PUBLISHED"];
  const requiredRecords = ["CLASS_TEACHER", "HEAD_TEACHER"];
  if (!requiredRecords.every((key) => narrative.commentRecords[key] && acceptedStatuses.includes(narrative.commentRecords[key].status) && narrative.commentRecords[key].finalComment.trim())) return false;
  return true;
}

export function cloneMarks(marks: ComponentMarks): ComponentMarks {
  return { ...marks };
}
