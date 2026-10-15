export class AlevelSubjectValidationError extends Error {
    statusCode = 422;
}
export class AlevelSubjectService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async list(principal, academicYearId) {
        await this.repository.assertActiveMembership(principal);
        await this.repository.assertPermission(principal.userId, "alevel.subjects.view");
        await this.repository.assertAcademicYearBelongsToSchool(academicYearId, principal.schoolId);
        return this.repository.schoolOfferings(principal.schoolId, academicYearId);
    }
    async detail(principal, offeringId) {
        await this.repository.assertActiveMembership(principal);
        await this.repository.assertPermission(principal.userId, "alevel.subjects.view");
        return this.repository.schoolOfferingById(principal.schoolId, offeringId);
    }
    async enable(principal, command) {
        await this.repository.assertActiveMembership(principal);
        await this.repository.assertPermission(principal.userId, "alevel.subjects.manage");
        await this.repository.assertAcademicYearBelongsToSchool(command.academicYearId, principal.schoolId);
        const subject = await this.repository.catalogueSubject(command.systemSubjectId);
        if (!subject?.active || subject.programme !== "A_LEVEL")
            throw new AlevelSubjectValidationError("Select an active A-Level system subject.");
        if (command.curriculumVersionId) {
            const version = await this.repository.curriculumVersion(command.curriculumVersionId);
            if (!version || version.systemSubjectId !== subject.id || version.status !== "ACTIVE")
                throw new AlevelSubjectValidationError("The selected curriculum version is not active for this subject.");
        }
        return this.repository.transaction(async () => { const offering = await this.repository.createOrReactivateOffering({ ...command, schoolId: principal.schoolId }); await this.repository.audit({ schoolId: principal.schoolId, actorUserId: principal.userId, type: "A_LEVEL_SUBJECT_OFFERING_ENABLED", targetId: offering.id, detail: { systemSubjectId: command.systemSubjectId, curriculumVersionId: command.curriculumVersionId } }); return offering; });
    }
    async retire(principal, offeringId) {
        await this.repository.assertActiveMembership(principal);
        await this.repository.assertPermission(principal.userId, "alevel.subjects.manage");
        if (!(await this.repository.schoolOfferingById(principal.schoolId, offeringId)))
            throw new AlevelSubjectValidationError("Subject offering was not found in this school.");
        const hasHistory = await this.repository.offeringHasHistory(principal.schoolId, offeringId);
        const status = hasHistory ? "ARCHIVED" : "INACTIVE";
        return this.repository.transaction(async () => { await this.repository.setOfferingStatus(principal.schoolId, offeringId, status, new Date()); await this.repository.audit({ schoolId: principal.schoolId, actorUserId: principal.userId, type: "A_LEVEL_SUBJECT_OFFERING_RETIRED", targetId: offeringId, detail: { status, historicalUsagePreserved: hasHistory } }); });
    }
}
