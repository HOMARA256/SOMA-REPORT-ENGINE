import { AlevelSubjectService, type SchoolPrincipal, type SubjectOfferingCommand } from "./AlevelSubjectService";

export type AuthenticatedSchoolRequest<T = unknown> = { principal: SchoolPrincipal; params: Record<string, string>; query: Record<string, string | undefined>; body: T };

export class AlevelSubjectController {
  constructor(private readonly service: AlevelSubjectService) {}

  /** GET /api/v1/school/alevel/subjects?academicYearId=... */
  list(request: AuthenticatedSchoolRequest) {
    if (!request.query.academicYearId) throw new Error("academicYearId is required.");
    return this.service.list(request.principal, request.query.academicYearId);
  }

  /** GET /api/v1/school/alevel/subjects/:offeringId */
  detail(request: AuthenticatedSchoolRequest) {
    return this.service.detail(request.principal, request.params.offeringId);
  }

  /** POST /api/v1/school/alevel/subjects */
  enable(request: AuthenticatedSchoolRequest<SubjectOfferingCommand>) {
    return this.service.enable(request.principal, request.body);
  }

  /** POST /api/v1/school/alevel/subjects/:offeringId/retire */
  retire(request: AuthenticatedSchoolRequest) {
    return this.service.retire(request.principal, request.params.offeringId);
  }
}
