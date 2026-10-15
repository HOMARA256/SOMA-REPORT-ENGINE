export type ExchangeDirection = "IMPORT" | "EXPORT" | "TEMPLATE";
export type ExchangeScope = "OWN" | "ASSIGNMENT" | "CLASS" | "DEPARTMENT" | "SCHOOL";

export type ExchangeRequest = {
  userId: string; schoolId: string; operationCode: string; direction: ExchangeDirection;
  requiredCapability: string; requestedScope: ExchangeScope; rowCount?: number; byteSize?: number; format?: string;
  academicContext?: { programme?: string; classId?: string; subjectOfferingId?: string; assessmentId?: string; paperId?: string };
};

export type EffectiveExchangePolicy = {
  platformAllowed: boolean; subscriptionAllowed: boolean; schoolEnabled: boolean; approvalRequired: boolean;
  allowedRoles: string[]; maximumScope: ExchangeScope; maximumRows?: number; maximumBytes?: number; allowedFormats: string[];
};

export interface ImportExportAuthorizationRepository {
  activeMembership(userId: string, schoolId: string): Promise<{ role: string } | null>;
  effectivePolicy(schoolId: string, operationCode: string): Promise<EffectiveExchangePolicy | null>;
  hasCapability(userId: string, capability: string): Promise<boolean>;
  hasAcademicScope(request: ExchangeRequest): Promise<boolean>;
  workflowAllows(request: ExchangeRequest): Promise<boolean>;
}

export class ExchangeAuthorizationError extends Error { readonly statusCode = 403; }

const scopeRank: Record<ExchangeScope, number> = { OWN: 1, ASSIGNMENT: 2, CLASS: 3, DEPARTMENT: 4, SCHOOL: 5 };

export class ImportExportAuthorizationService {
  constructor(private readonly repository: ImportExportAuthorizationRepository) {}

  async authorize(request: ExchangeRequest) {
    const membership = await this.repository.activeMembership(request.userId, request.schoolId);
    if (!membership) throw new ExchangeAuthorizationError("Active school membership is required.");
    const policy = await this.repository.effectivePolicy(request.schoolId, request.operationCode);
    if (!policy?.platformAllowed) throw new ExchangeAuthorizationError("Disabled by Platform Policy.");
    if (!policy.subscriptionAllowed) throw new ExchangeAuthorizationError("This operation is not available under the current subscription.");
    if (!policy.schoolEnabled) throw new ExchangeAuthorizationError("Not permitted by school policy.");
    if (!policy.allowedRoles.includes(membership.role)) throw new ExchangeAuthorizationError("Your school role is not permitted to perform this operation.");
    if (!(await this.repository.hasCapability(request.userId, request.requiredCapability))) throw new ExchangeAuthorizationError("Required capability is missing.");
    if (scopeRank[request.requestedScope] > scopeRank[policy.maximumScope]) throw new ExchangeAuthorizationError("Requested data scope exceeds the authorised scope.");
    if (request.rowCount !== undefined && policy.maximumRows !== undefined && request.rowCount > policy.maximumRows) throw new ExchangeAuthorizationError(`The operation exceeds the ${policy.maximumRows}-row limit.`);
    if (request.byteSize !== undefined && policy.maximumBytes !== undefined && request.byteSize > policy.maximumBytes) throw new ExchangeAuthorizationError("The file exceeds the authorised size limit.");
    if (request.format && !policy.allowedFormats.includes(request.format.toUpperCase())) throw new ExchangeAuthorizationError("The requested file format is not permitted.");
    if (!(await this.repository.hasAcademicScope(request))) throw new ExchangeAuthorizationError("The selected academic records are outside your assignment scope.");
    if (!(await this.repository.workflowAllows(request))) throw new ExchangeAuthorizationError("The current academic workflow state does not allow this operation.");
    return { approvalRequired: policy.approvalRequired, policySnapshot: policy };
  }
}
