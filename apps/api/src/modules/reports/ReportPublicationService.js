export class ReportAccessError extends Error {
}
export class ReportLayoutError extends Error {
    findings;
    constructor(findings) {
        super("REPORT_LAYOUT_REQUIRES_ATTENTION");
        this.findings = findings;
    }
}
export class ReportPublicationService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async publish(snapshotId, principal) {
        if (!principal.permissions.includes("reports.publish"))
            throw new ReportAccessError("Report publication permission is required.");
        const snapshot = await this.repository.reportSnapshotForSchool(snapshotId, principal.schoolId);
        if (!snapshot)
            throw new ReportAccessError("The report is unavailable in the authenticated school context.");
        if (!(await this.repository.learnerBelongsToSchool(snapshot.learnerId, principal.schoolId)))
            throw new ReportAccessError("Learner-school relationship validation failed.");
        if (snapshot.status !== "APPROVED")
            throw new ReportAccessError("Only an approved immutable snapshot can be published.");
        return this.repository.transaction(async () => {
            await this.repository.calculateAuthoritativeSnapshot(snapshot.id);
            const layout = await this.repository.validateSinglePageReport(snapshot.id);
            if (layout.pageCount !== 1 || layout.findings.length)
                throw new ReportLayoutError(layout.findings.length ? layout.findings : [{ code: "PAGE_COUNT", detail: `Expected one page; generated ${layout.pageCount}.` }]);
            const publication = await this.repository.publishImmutableSnapshot(snapshot.id, principal.userId);
            await this.repository.audit({ school_id: principal.schoolId, learner_id: snapshot.learnerId, report_snapshot_id: snapshot.id, actor_user_id: principal.userId, event_type: "REPORT_PUBLISHED", event_data: publication });
            return publication;
        });
    }
}
