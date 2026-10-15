export class PlatformAuthorizationError extends Error {
}
export class PlatformAdminService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async authorize(context, operation, requireReason = false) {
        if (!context.principal.active || context.principal.role !== "PLATFORM_ADMIN")
            throw new PlatformAuthorizationError("Active Platform Administrator authorization is required.");
        if (!context.schoolId || !(await this.repository.schoolExists(context.schoolId)))
            throw new PlatformAuthorizationError("A valid selected school target is required.");
        if (requireReason && !context.reason?.trim())
            throw new PlatformAuthorizationError(`A reason is required for ${operation}.`);
    }
    async changeSchoolStatus(context, status) {
        await this.authorize(context, "school status change", true);
        return this.repository.transaction(async () => {
            const state = await this.repository.updateSchoolStatus(context.schoolId, status);
            await this.audit(context, `SCHOOL_${status}`, "school", context.schoolId, state);
            return state.current;
        });
    }
    async confirmPayment(context, paymentId) {
        await this.authorize(context, "payment confirmation");
        return this.repository.transaction(async () => {
            const state = await this.repository.confirmPayment(context.schoolId, paymentId, context.principal.id);
            await this.repository.renewSubscriptionForConfirmedPayment(context.schoolId, paymentId);
            await this.audit(context, "PAYMENT_CONFIRMED", "subscription_payment", paymentId, state);
            return state.current;
        });
    }
    async changeFeature(context, featureKey, state) {
        await this.authorize(context, "feature override", true);
        return this.repository.transaction(async () => {
            const changed = await this.repository.setFeatureOverride(context.schoolId, featureKey, state, context.principal.id, context.reason);
            await this.audit(context, "FEATURE_OVERRIDE_CHANGED", "feature", featureKey, changed);
            return changed.current;
        });
    }
    async retryJob(context, jobId) {
        await this.authorize(context, "job retry");
        await this.repository.retryIdempotentJob(context.schoolId, jobId);
        await this.audit(context, "SAFE_JOB_RETRIED", "system_job", jobId, {});
    }
    audit(context, action, targetType, targetId, state) {
        return this.repository.writeAudit({ platform_admin_id: context.principal.id, school_id: context.schoolId, action, target_type: targetType, target_id: targetId, previous_state: state.previous, new_state: state.current, reason: context.reason, session_metadata: context.sessionMetadata ?? {} });
    }
}
