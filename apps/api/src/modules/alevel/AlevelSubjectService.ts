export type SchoolPrincipal = { userId: string; schoolId: string };
export type SubjectOfferingCommand = { academicYearId: string; systemSubjectId: string; curriculumVersionId: string | null; schoolCode?: string; displayName?: string; subjectLevel: "PRINCIPAL" | "SUBSIDIARY" | "GENERAL_PAPER" | "OTHER" };

export interface AlevelSubjectRepository {
  assertActiveMembership(principal: SchoolPrincipal): Promise<void>;
  assertPermission(userId: string, permission: "alevel.subjects.view" | "alevel.subjects.manage"): Promise<void>;
  assertAcademicYearBelongsToSchool(academicYearId: string, schoolId: string): Promise<void>;
  catalogueSubject(systemSubjectId: string): Promise<{ id: string; programme: string; active: boolean } | null>;
  curriculumVersion(versionId: string): Promise<{ id: string; systemSubjectId: string; status: string } | null>;
  schoolOfferings(schoolId: string, academicYearId: string): Promise<unknown[]>;
  schoolOfferingById(schoolId: string, offeringId: string): Promise<unknown | null>;
  createOrReactivateOffering(values: SubjectOfferingCommand & { schoolId: string }): Promise<{ id: string }>;
  offeringHasHistory(schoolId: string, offeringId: string): Promise<boolean>;
  setOfferingStatus(schoolId: string, offeringId: string, status: "INACTIVE" | "ARCHIVED", retiredAt: Date): Promise<void>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
  audit(event: { schoolId: string; actorUserId: string; type: string; targetId: string; detail: Record<string, unknown> }): Promise<void>;
}

export class AlevelSubjectValidationError extends Error { readonly statusCode = 422; }

export class AlevelSubjectService {
  constructor(private readonly repository: AlevelSubjectRepository) {}

  async list(principal: SchoolPrincipal, academicYearId: string) {
    await this.repository.assertActiveMembership(principal); await this.repository.assertPermission(principal.userId, "alevel.subjects.view"); await this.repository.assertAcademicYearBelongsToSchool(academicYearId, principal.schoolId);
    return this.repository.schoolOfferings(principal.schoolId, academicYearId);
  }

  async detail(principal: SchoolPrincipal, offeringId: string) {
    await this.repository.assertActiveMembership(principal); await this.repository.assertPermission(principal.userId, "alevel.subjects.view");
    return this.repository.schoolOfferingById(principal.schoolId, offeringId);
  }

  async enable(principal: SchoolPrincipal, command: SubjectOfferingCommand) {
    await this.repository.assertActiveMembership(principal); await this.repository.assertPermission(principal.userId, "alevel.subjects.manage"); await this.repository.assertAcademicYearBelongsToSchool(command.academicYearId, principal.schoolId);
    const subject = await this.repository.catalogueSubject(command.systemSubjectId);
    if (!subject?.active || subject.programme !== "A_LEVEL") throw new AlevelSubjectValidationError("Select an active A-Level system subject.");
    if (command.curriculumVersionId) { const version = await this.repository.curriculumVersion(command.curriculumVersionId); if (!version || version.systemSubjectId !== subject.id || version.status !== "ACTIVE") throw new AlevelSubjectValidationError("The selected curriculum version is not active for this subject."); }
    return this.repository.transaction(async () => { const offering = await this.repository.createOrReactivateOffering({ ...command, schoolId: principal.schoolId }); await this.repository.audit({ schoolId: principal.schoolId, actorUserId: principal.userId, type: "A_LEVEL_SUBJECT_OFFERING_ENABLED", targetId: offering.id, detail: { systemSubjectId: command.systemSubjectId, curriculumVersionId: command.curriculumVersionId } }); return offering; });
  }

  async retire(principal: SchoolPrincipal, offeringId: string) {
    await this.repository.assertActiveMembership(principal); await this.repository.assertPermission(principal.userId, "alevel.subjects.manage");
    if (!(await this.repository.schoolOfferingById(principal.schoolId, offeringId))) throw new AlevelSubjectValidationError("Subject offering was not found in this school.");
    const hasHistory = await this.repository.offeringHasHistory(principal.schoolId, offeringId); const status = hasHistory ? "ARCHIVED" : "INACTIVE";
    return this.repository.transaction(async () => { await this.repository.setOfferingStatus(principal.schoolId, offeringId, status, new Date()); await this.repository.audit({ schoolId: principal.schoolId, actorUserId: principal.userId, type: "A_LEVEL_SUBJECT_OFFERING_RETIRED", targetId: offeringId, detail: { status, historicalUsagePreserved: hasHistory } }); });
  }
}
