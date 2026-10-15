export type AccountStatus = "Active" | "Inactive";
export type StaffRole =
  | "School Administrator"
  | "Director of Studies"
  | "Head of Department"
  | "Teacher"
  | "Class Teacher"
  | "Head Teacher";

export type TeachingAllocation = {
  id: string;
  subject: string;
  subjectCode: string;
  className: string;
  stream: string;
  learners: number;
  submissionRate: number;
};

export type StaffMember = {
  id: string;
  staffNumber: string;
  initials: string;
  firstName: string;
  middleName: string;
  lastName: string;
  signatureUrl: string;
  photoUrl?: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  department: string;
  accountStatus: AccountStatus;
  classes: number;
  subjects: string[];
  submissionRate: number;
  missingMarks: number;
  moderationPending: number;
  lastActive: string;
  allocations: TeachingAllocation[];
};

export const staffMembers: StaffMember[] = [];

export function findStaffMember(id: string): StaffMember | undefined {
  return staffMembers.find((member) => member.id === id);
}
