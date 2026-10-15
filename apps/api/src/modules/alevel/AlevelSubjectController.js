export class AlevelSubjectController {
    service;
    constructor(service) {
        this.service = service;
    }
    /** GET /api/v1/school/alevel/subjects?academicYearId=... */
    list(request) {
        if (!request.query.academicYearId)
            throw new Error("academicYearId is required.");
        return this.service.list(request.principal, request.query.academicYearId);
    }
    /** GET /api/v1/school/alevel/subjects/:offeringId */
    detail(request) {
        return this.service.detail(request.principal, request.params.offeringId);
    }
    /** POST /api/v1/school/alevel/subjects */
    enable(request) {
        return this.service.enable(request.principal, request.body);
    }
    /** POST /api/v1/school/alevel/subjects/:offeringId/retire */
    retire(request) {
        return this.service.retire(request.principal, request.params.offeringId);
    }
}
