export type LearnerStatus = "Active" | "Inactive" | "Transferred";

export type LearnerProgramme = "O-Level" | "A-Level";

export type LearnerGender = "Male" | "Female" | "Unspecified";

export interface Learner {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherName?: string;

  gender: LearnerGender;
  programme: LearnerProgramme;

  className: string;
  stream: string;
  aLevelCombination?: string;
  aLevelSubsidiarySubjectCode?: string;

  dateOfBirth: string;
  admissionDate: string;

  guardianName: string;
  guardianPhone: string;

  status: LearnerStatus;
  photoUrl?: string;
  attendance?: { presentDays: number; totalDays: number };
  feesStatus?: string;
}

export const learners: Learner[] = [];

export function getLearnerFullName(learner: Learner): string {
  return [
    learner.firstName,
    learner.otherName,
    learner.lastName,
  ]
    .filter(Boolean)
    .join(" ");
}

export function getLearnerInitials(learner: Learner): string {
  return `${learner.firstName.charAt(0)}${learner.lastName.charAt(0)}`.toUpperCase();
}
