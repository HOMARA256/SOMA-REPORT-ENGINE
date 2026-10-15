export type MarksEntryRecord = {
  learnerId: string;
  lin: string;
  learnerName: string;
  teacher: string;
  continuousAssessment: string;
  examination: string;
  continuousAssessmentState: "PRESENT" | "MISSING" | "ABSENT" | "EXEMPT";
  examinationState: "PRESENT" | "MISSING" | "ABSENT" | "EXEMPT";
};

export const marksEntryRecords: MarksEntryRecord[] = [];
