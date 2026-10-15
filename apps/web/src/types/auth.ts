export type UserRole =
  | "PLATFORM_ADMIN"
  | "SCHOOL_ADMIN"
  | "ADMISSIONS_OFFICER"
  | "DOS"
  | "HOD"
  | "TEACHER"
  | "CLASS_TEACHER"
  | "HEAD_TEACHER"
  | "BURSAR_READ_ONLY"
  | "STAFF"
  | "PARENT_GUARDIAN"
  | "LEARNER"
  | "AUDITOR";

export type Permission =
  | "dashboard.view"
  | "learners.view"
  | "learners.manage"
  | "academics.manage"
  | "subjects.view"
  | "assessments.view"
  | "marks.enter"
  | "marks.review"
  | "marks.moderate"
  | "results.view"
  | "results.lock"
  | "results.approve"
  | "analysis.view"
  | "reports.view"
  | "reports.generate"
  | "reports.narrate"
  | "reports.publish"
  | "comments.subject.generate"
  | "comments.subject.edit"
  | "comments.subject.approve"
  | "comments.class.generate"
  | "comments.class.edit"
  | "comments.class.approve"
  | "comments.hod.generate"
  | "comments.hod.edit"
  | "comments.hod.approve"
  | "comments.dos.generate"
  | "comments.dos.edit"
  | "comments.dos.approve"
  | "comments.headteacher.generate"
  | "comments.headteacher.edit"
  | "comments.headteacher.approve"
  | "comments.configure"
  | "comments.reopen"
  | "users.view"
  | "users.manage"
  | "imports.manage"
  | "imports.view"
  | "imports.marks"
  | "imports.learners"
  | "imports.staff"
  | "imports.allocations"
  | "imports.academic"
  | "imports.competencies"
  | "imports.media"
  | "exports.view"
  | "exports.marks"
  | "exports.learners"
  | "exports.staff"
  | "exports.results"
  | "exports.analysis"
  | "templates.download"
  | "templates.generate"
  | "audit.view"
  | "settings.manage"
  | "school_profile.view"
  | "school_profile.edit"
  | "report_header.view"
  | "report_header.configure"
  | "report_header.preview"
  | "subscription.view"
  | "admissions.manage"
  | "idcards.manage"
  | "documents.manage";

export type CurrentUser = {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  schoolId: string | null;
  schoolCode: string | null;
  schoolName: string;
  profilePhotoPath?: string | null;
  profilePhotoUrl?: string | null;
  membershipStatus: "ACTIVE" | "INACTIVE" | "SUSPENDED" | null;
  permissions: Permission[];
};
