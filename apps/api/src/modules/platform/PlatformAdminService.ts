export type PlatformPrincipal = { id: string; role: "PLATFORM_ADMIN"; active: boolean };
export type PlatformActionContext = { principal: PlatformPrincipal; schoolId?: string; reason?: string; sessionMetadata?: Record<string, unknown> };

export interface PlatformRepository {
  schoolExists(schoolId: string): Promise<boolean>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
  updateSchoolStatus(schoolId: string, status: string): Promise<{ previous: unknown; current: unknown }>;
  confirmPayment(schoolId: string, paymentId: string, administratorId: string): Promise<{ previous: unknown; current: unknown }>;
  renewSubscriptionForConfirmedPayment(schoolId: string, paymentId: string): Promise<void>;
  setFeatureOverride(schoolId: string, featureKey: string, state: "DEFAULT"|"ENABLED"|"DISABLED", administratorId: string, reason: string): Promise<{ previous: unknown; current: unknown }>;
  retryIdempotentJob(schoolId: string, jobId: string): Promise<void>;
  writeAudit(event: Record<string, unknown>): Promise<void>;
}

export class PlatformAuthorizationError extends Error {}

export class PlatformAdminService {
  constructor(private readonly repository: PlatformRepository) {}

  private async authorize(context: PlatformActionContext, operation: string, requireReason = false) {
    if (!context.principal.active || context.principal.role !== "PLATFORM_ADMIN") throw new PlatformAuthorizationError("Active Platform Administrator authorization is required.");
    if (!context.schoolId || !(await this.repository.schoolExists(context.schoolId))) throw new PlatformAuthorizationError("A valid selected school target is required.");
    if (requireReason && !context.reason?.trim()) throw new PlatformAuthorizationError(`A reason is required for ${operation}.`);
  }

  async changeSchoolStatus(context: PlatformActionContext, status: "ACTIVE"|"SUSPENDED"|"ARCHIVED") {
    await this.authorize(context, "school status change", true);
    return this.repository.transaction(async () => {
      const state = await this.repository.updateSchoolStatus(context.schoolId!, status);
      await this.audit(context, `SCHOOL_${status}`, "school", context.schoolId!, state);
      return state.current;
    });
  }

  async confirmPayment(context: PlatformActionContext, paymentId: string) {
    await this.authorize(context, "payment confirmation");
    return this.repository.transaction(async () => {
      const state = await this.repository.confirmPayment(context.schoolId!, paymentId, context.principal.id);
      await this.repository.renewSubscriptionForConfirmedPayment(context.schoolId!, paymentId);
      await this.audit(context, "PAYMENT_CONFIRMED", "subscription_payment", paymentId, state);
      return state.current;
    });
  }

  async changeFeature(context: PlatformActionContext, featureKey: string, state: "DEFAULT"|"ENABLED"|"DISABLED") {
    await this.authorize(context, "feature override", true);
    return this.repository.transaction(async () => {
      const changed = await this.repository.setFeatureOverride(context.schoolId!, featureKey, state, context.principal.id, context.reason!);
      await this.audit(context, "FEATURE_OVERRIDE_CHANGED", "feature", featureKey, changed);
      return changed.current;
    });
  }

  async retryJob(context: PlatformActionContext, jobId: string) {
    await this.authorize(context, "job retry");
    await this.repository.retryIdempotentJob(context.schoolId!, jobId);
    await this.audit(context, "SAFE_JOB_RETRIED", "system_job", jobId, {});
  }

  private audit(context: PlatformActionContext, action: string, targetType: string, targetId: string, state: { previous?: unknown; current?: unknown }) {
    return this.repository.writeAudit({ platform_admin_id: context.principal.id, school_id: context.schoolId, action, target_type: targetType, target_id: targetId, previous_state: state.previous, new_state: state.current, reason: context.reason, session_metadata: context.sessionMetadata ?? {} });
  }
}
