export class AlevelCombinationService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async list(principal, academicYearId) { await this.repository.authorise(principal, "alevel.combinations.view"); await this.repository.validateYear(principal.schoolId, academicYearId); return this.repository.list(principal.schoolId, academicYearId); }
    async save(principal, command) {
        await this.repository.authorise(principal, "alevel.combinations.manage");
        await this.repository.validateYear(principal.schoolId, command.academicYearId);
        const code = command.code.trim().toUpperCase();
        const name = command.name.trim();
        if (!code || !name)
            throw new Error("Combination code and name are required.");
        if (command.principalOfferingIds.length !== 3)
            throw new Error("Select all three principal subjects.");
        if (new Set(command.principalOfferingIds).size !== 3)
            throw new Error("Each principal subject must be different.");
        if (!command.subsidiaryOfferingId)
            throw new Error("Select one subsidiary subject.");
        await this.repository.validateClassifiedOfferings(principal.schoolId, command.academicYearId, command.principalOfferingIds, "PRINCIPAL");
        await this.repository.validateClassifiedOfferings(principal.schoolId, command.academicYearId, [command.subsidiaryOfferingId], "SUBSIDIARY");
        const generalPaper = await this.repository.activeGeneralPaperOffering(principal.schoolId, command.academicYearId);
        if (!generalPaper && command.status === "ACTIVE")
            throw new Error("General Paper must be enabled in A-Level Subject Offerings before this combination can be activated.");
        const relationships = [
            ...command.principalOfferingIds.map((schoolSubjectOfferingId, index) => ({ schoolSubjectOfferingId, role: "PRINCIPAL", principalPosition: (index + 1), displayOrder: index + 1 })),
            ...(generalPaper ? [{ schoolSubjectOfferingId: generalPaper.id, role: "GENERAL_PAPER", displayOrder: 4 }] : []),
            { schoolSubjectOfferingId: command.subsidiaryOfferingId, role: "SUBSIDIARY", displayOrder: 5 },
        ];
        return this.repository.transaction(async () => { const record = await this.repository.upsertCombination(principal.schoolId, { ...command, code, name }); await this.repository.replaceSubjects(record.id, relationships); await this.repository.audit({ schoolId: principal.schoolId, actorUserId: principal.userId, type: "A_LEVEL_COMBINATION_SAVED", targetId: record.id, detail: { code, principalOfferingIds: command.principalOfferingIds, generalPaperOfferingId: generalPaper?.id, subsidiaryOfferingId: command.subsidiaryOfferingId } }); return { ...record, subjects: relationships }; });
    }
    async assign(principal, command) {
        await this.repository.authorise(principal, "alevel.combinations.manage");
        await this.repository.validateLearnerClass(principal.schoolId, command.learnerId, command.classId);
        if (!(await this.repository.combinationIsActiveAndComplete(principal.schoolId, command.combinationId)))
            throw new Error("Select an active combination with three principals, General Paper and one subsidiary.");
        return this.repository.transaction(async () => { const record = await this.repository.assignLearner(principal.schoolId, command); await this.repository.audit({ schoolId: principal.schoolId, actorUserId: principal.userId, type: "A_LEVEL_LEARNER_ASSIGNED", targetId: record.id, detail: command }); return record; });
    }
}
