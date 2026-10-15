export class ImportValidationService {
    validateState(mark, state, maximum) {
        const errors = [];
        if (state === "PRESENT" && mark === null)
            errors.push("PRESENT requires a numeric mark.");
        if (state !== "PRESENT" && mark !== null)
            errors.push(`${state} requires a blank mark.`);
        if (mark !== null && (mark < 0 || mark > maximum))
            errors.push(`Mark ${mark} is outside the permitted range 0-${maximum}.`);
        return errors;
    }
}
export class MarksImportService {
    repository;
    validation;
    constructor(repository, validation = new ImportValidationService()) {
        this.repository = repository;
        this.validation = validation;
    }
    async validate(userId, context, rows, maximumByComponent) {
        await this.repository.assertActiveMembership(userId, context.schoolId);
        await this.repository.assertPermission(userId, "imports.marks");
        await this.repository.assertTeacherAllocation(context);
        await this.repository.assertAssessmentOpen(context);
        const eligible = await this.repository.loadEligibleLearners(context);
        const seen = new Set();
        const validated = [];
        for (const row of rows) {
            const current = await this.repository.loadCurrentMark(context, row.learnerId, row.componentKey);
            const errors = this.validation.validateState(row.mark, row.state, maximumByComponent[row.componentKey] ?? 0);
            const warnings = [];
            if (!eligible.has(row.learnerId))
                errors.push("Learner is not enrolled in the selected class and stream.");
            else if (eligible.get(row.learnerId)?.admissionNumber !== row.admissionNumber)
                errors.push("Admission number does not match the learner reference.");
            if (seen.has(`${row.learnerId}:${row.componentKey}`))
                errors.push("Duplicate learner/component row.");
            seen.add(`${row.learnerId}:${row.componentKey}`);
            const conflict = current.version !== row.baseRecordVersion;
            if (conflict)
                errors.push("CONFLICT: the current mark changed after this template was generated.");
            const unchanged = current.mark === row.mark && current.state === row.state;
            if (!unchanged && current.mark !== null && !conflict)
                warnings.push(`Current mark ${current.mark} will change to ${row.mark ?? row.state}.`);
            validated.push({ ...row, currentMark: current.mark, currentVersion: current.version, errors, warnings, status: errors.length ? conflict ? "CONFLICT" : "ERROR" : unchanged ? "UNCHANGED" : warnings.length ? "WARNING" : "READY" });
        }
        return validated;
    }
    async commit(userId, context, rows) {
        if (rows.some((row) => row.status === "ERROR" || row.status === "CONFLICT"))
            throw new Error("Import contains blocking validation errors.");
        return this.repository.inTransaction(async () => {
            await this.repository.assertActiveMembership(userId, context.schoolId);
            await this.repository.assertPermission(userId, "imports.marks");
            await this.repository.assertTeacherAllocation(context);
            await this.repository.assertAssessmentOpen(context);
            let affected = 0;
            for (const row of rows) {
                if (row.status === "UNCHANGED")
                    continue;
                const current = await this.repository.loadCurrentMark(context, row.learnerId, row.componentKey);
                if (current.version !== row.currentVersion)
                    throw new Error(`Concurrent change detected at row ${row.rowNumber}.`);
                await this.repository.writeMark(context, row);
                affected += 1;
            }
            await this.repository.writeAudit({ schoolId: context.schoolId, userId, type: "MARKS_IMPORTED", affected, context });
            return affected;
        });
    }
}
export class TemplateService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
}
export class ImportService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
}
export class ExportService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
}
