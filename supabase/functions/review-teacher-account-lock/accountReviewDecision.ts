export type TeacherAccountReviewDecision = "REACTIVATE" | "ALREADY_ACTIVE" | "ONBOARDING_PENDING" | "MANUAL_REVIEW";

export function teacherAccountReviewDecision(
  accountStatus: string,
  isActive: boolean,
  authBanned: boolean,
): TeacherAccountReviewDecision {
  if (["LOCKED", "SUSPENDED"].includes(accountStatus) || authBanned || (accountStatus === "ACTIVE" && !isActive)) {
    return "REACTIVATE";
  }
  if (accountStatus === "ACTIVE") return "ALREADY_ACTIVE";
  if (["INVITED", "DISABLED"].includes(accountStatus)) return "ONBOARDING_PENDING";
  return "MANUAL_REVIEW";
}
