export type ImportValidationStatus = "READY" | "WARNING" | "ERROR" | "UNCHANGED" | "CONFLICT";
export type MarkImportState = "PRESENT" | "MISSING" | "ABSENT" | "EXEMPT";

export type MarksImportContext = {
  schoolId: string; academicYearId: string; termId: string; classId: string; streamId: string | null;
  subjectOfferingId: string; assessmentId: string; teacherUserId: string; templateId: string; templateVersion: number;
};

export type MarksImportRow = {
  rowNumber: number; learnerId: string; admissionNumber: string; componentKey: string;
  mark: number | null; state: MarkImportState; baseRecordVersion: string;
};

export type ValidatedImportRow = MarksImportRow & { status: ImportValidationStatus; errors: string[]; warnings: string[]; currentMark: number | null; currentVersion: string };

export interface ImportRepository {
  assertActiveMembership(userId: string, schoolId: string): Promise<void>;
  assertPermission(userId: string, capability: string): Promise<void>;
  assertTeacherAllocation(context: MarksImportContext): Promise<void>;
  assertAssessmentOpen(context: MarksImportContext): Promise<void>;
  loadEligibleLearners(context: MarksImportContext): Promise<Map<string, { admissionNumber: string }>>;
  loadCurrentMark(context: MarksImportContext, learnerId: string, componentKey: string): Promise<{ mark: number | null; state: MarkImportState; version: string }>;
  inTransaction<T>(work: () => Promise<T>): Promise<T>;
  writeMark(context: MarksImportContext, row: ValidatedImportRow): Promise<void>;
  writeAudit(event: { schoolId: string; userId: string; type: string; affected: number; context: object }): Promise<void>;
}

export class ImportValidationService {
  validateState(mark: number | null, state: MarkImportState, maximum: number) {
    const errors: string[] = [];
    if (state === "PRESENT" && mark === null) errors.push("PRESENT requires a numeric mark.");
    if (state !== "PRESENT" && mark !== null) errors.push(`${state} requires a blank mark.`);
    if (mark !== null && (mark < 0 || mark > maximum)) errors.push(`Mark ${mark} is outside the permitted range 0-${maximum}.`);
    return errors;
  }
}

export class MarksImportService {
  constructor(private readonly repository: ImportRepository, private readonly validation = new ImportValidationService()) {}

  async validate(userId: string, context: MarksImportContext, rows: MarksImportRow[], maximumByComponent: Record<string, number>): Promise<ValidatedImportRow[]> {
    await this.repository.assertActiveMembership(userId, context.schoolId);
    await this.repository.assertPermission(userId, "imports.marks");
    await this.repository.assertTeacherAllocation(context);
    await this.repository.assertAssessmentOpen(context);
    const eligible = await this.repository.loadEligibleLearners(context); const seen = new Set<string>(); const validated: ValidatedImportRow[] = [];
    for (const row of rows) {
      const current = await this.repository.loadCurrentMark(context, row.learnerId, row.componentKey); const errors = this.validation.validateState(row.mark, row.state, maximumByComponent[row.componentKey] ?? 0); const warnings: string[] = [];
      if (!eligible.has(row.learnerId)) errors.push("Learner is not enrolled in the selected class and stream.");
      else if (eligible.get(row.learnerId)?.admissionNumber !== row.admissionNumber) errors.push("Admission number does not match the learner reference.");
      if (seen.has(`${row.learnerId}:${row.componentKey}`)) errors.push("Duplicate learner/component row."); seen.add(`${row.learnerId}:${row.componentKey}`);
      const conflict = current.version !== row.baseRecordVersion;
      if (conflict) errors.push("CONFLICT: the current mark changed after this template was generated.");
      const unchanged = current.mark === row.mark && current.state === row.state;
      if (!unchanged && current.mark !== null && !conflict) warnings.push(`Current mark ${current.mark} will change to ${row.mark ?? row.state}.`);
      validated.push({ ...row, currentMark: current.mark, currentVersion: current.version, errors, warnings, status: errors.length ? conflict ? "CONFLICT" : "ERROR" : unchanged ? "UNCHANGED" : warnings.length ? "WARNING" : "READY" });
    }
    return validated;
  }

  async commit(userId: string, context: MarksImportContext, rows: ValidatedImportRow[]) {
    if (rows.some((row) => row.status === "ERROR" || row.status === "CONFLICT")) throw new Error("Import contains blocking validation errors.");
    return this.repository.inTransaction(async () => {
      await this.repository.assertActiveMembership(userId, context.schoolId); await this.repository.assertPermission(userId, "imports.marks"); await this.repository.assertTeacherAllocation(context); await this.repository.assertAssessmentOpen(context);
      let affected = 0;
      for (const row of rows) { if (row.status === "UNCHANGED") continue; const current = await this.repository.loadCurrentMark(context, row.learnerId, row.componentKey); if (current.version !== row.currentVersion) throw new Error(`Concurrent change detected at row ${row.rowNumber}.`); await this.repository.writeMark(context, row); affected += 1; }
      await this.repository.writeAudit({ schoolId: context.schoolId, userId, type: "MARKS_IMPORTED", affected, context }); return affected;
    });
  }
}

export class TemplateService { constructor(private readonly repository: ImportRepository) {} }
export class ImportService { constructor(private readonly repository: ImportRepository) {} }
export class ExportService { constructor(private readonly repository: ImportRepository) {} }

