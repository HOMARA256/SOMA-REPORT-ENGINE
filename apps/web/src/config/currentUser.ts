import type { CurrentUser, Permission, UserRole } from "../types/auth";
import type { ResolvedIdentity } from "../features/auth/authSession";

export const currentUser: CurrentUser = {
  id: "authenticated-school-admin",

  name: "Omara William",

  initials: "OW",

  email: "omarawilling@gmail.com",

  role: "SCHOOL_ADMIN",

  roleLabel: "School Administrator",

  schoolId: "school-configuration-pending",

  schoolCode: "NOT_CONFIGURED",

  schoolName: "School",

  profilePhotoPath: null,

  profilePhotoUrl: null,

  membershipStatus: "ACTIVE",

  permissions: [
    "dashboard.view",

    "learners.view",

    "academics.manage",

    "subjects.view",

    "assessments.view",

    "marks.enter",

    "marks.review",

    "marks.moderate",

    "results.view",

    "results.lock",

    "results.approve",

    "analysis.view",

    "reports.view",

    "reports.generate",

    "reports.narrate",

    "reports.publish",

    "comments.subject.generate",
    "comments.subject.edit",
    "comments.subject.approve",
    "comments.class.generate",
    "comments.class.edit",
    "comments.class.approve",
    "comments.hod.generate",
    "comments.hod.edit",
    "comments.hod.approve",
    "comments.dos.generate",
    "comments.dos.edit",
    "comments.dos.approve",
    "comments.headteacher.generate",
    "comments.headteacher.edit",
    "comments.headteacher.approve",
    "comments.configure",
    "comments.reopen",

    "users.view",

    "users.manage",

    "imports.manage",
    "imports.view",
    "imports.marks",
    "imports.learners",
    "imports.staff",
    "imports.allocations",
    "imports.academic",
    "imports.competencies",
    "imports.media",
    "exports.view",
    "exports.marks",
    "exports.learners",
    "exports.staff",
    "exports.results",
    "exports.analysis",
    "templates.download",
    "templates.generate",

    "audit.view",

    "settings.manage",
    "school_profile.view",
    "school_profile.edit",
    "report_header.view",
    "report_header.configure",
    "report_header.preview",
    "subscription.view",
  ],
};

export function applyResolvedIdentity(identity:ResolvedIdentity){
  const names=identity.name.trim().split(/\s+/).filter(Boolean);
  currentUser.id=identity.id;
  currentUser.name=identity.name;
  currentUser.initials=names.slice(0,2).map((name)=>name[0]?.toUpperCase()).join("")||"OS";
  currentUser.email=identity.email;
  currentUser.role=identity.role as UserRole;
  currentUser.roleLabel=identity.roleLabel??identity.role.replaceAll("_"," ");
  currentUser.schoolId=identity.schoolId;
  currentUser.schoolCode=identity.schoolCode??null;
  currentUser.schoolName=identity.schoolName??"SOMA REPORT ENGINE";
  currentUser.profilePhotoPath=identity.profilePhotoPath??null;
  currentUser.profilePhotoUrl=identity.profilePhotoUrl??null;
  currentUser.membershipStatus=(identity.membershipStatus as CurrentUser["membershipStatus"])??null;
  currentUser.permissions=identity.permissions as Permission[];
}
