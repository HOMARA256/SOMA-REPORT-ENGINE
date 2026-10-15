export class NotificationEventService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async marksReturned(input) { return this.create({ schoolId: input.schoolId, recipientUserId: input.teacherUserId, category: "MARKS", eventType: "MARKS_RETURNED_FOR_CORRECTION", title: "Marks returned for correction", message: "A submitted marks batch requires correction.", entityType: "marks_batch", entityId: input.batchId, idempotencyKey: `marks-returned:${input.batchId}` }); }
    async marksSubmitted(input) { return this.create({ schoolId: input.schoolId, recipientUserId: input.reviewerUserId, category: "MODERATION", eventType: "MARKS_SUBMITTED_FOR_REVIEW", title: "Marks submitted for review", message: "A marks batch is ready for moderation.", entityType: "marks_batch", entityId: input.batchId, idempotencyKey: `marks-submitted:${input.batchId}` }); }
    async reportPublished(input) { return this.create({ schoolId: input.schoolId, recipientUserId: input.recipientUserId, category: "REPORTS", eventType: "REPORT_PUBLISHED", title: "Report published", message: "An authorised report is now available.", entityType: "report_publication", entityId: input.reportId, idempotencyKey: `report-published:${input.reportId}:${input.recipientUserId}` }); }
    async invoiceIssued(input) { return this.create({ schoolId: input.schoolId, recipientUserId: input.schoolAdminUserId, category: "SUBSCRIPTION", eventType: "SUBSCRIPTION_INVOICE_ISSUED", title: "Subscription invoice issued", message: "A new academic-term subscription invoice is available.", entityType: "subscription_invoice", entityId: input.invoiceId, idempotencyKey: `invoice-issued:${input.invoiceId}:${input.schoolAdminUserId}` }); }
    async create(input) { const result = await this.repository.createEventNotification(input); if (result.created)
        await this.repository.audit({ action: "NOTIFICATION_CREATED", schoolId: input.schoolId, recipientUserId: input.recipientUserId, notificationId: result.id, eventType: input.eventType }); return result; }
}
export class NotificationService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async list(audience, query = {}) {
        await this.repository.assertActiveIdentity(audience);
        return this.repository.listForRecipient({ ...audience, ...query, limit: Math.min(Math.max(query.limit ?? 30, 1), 100) });
    }
    async unreadCount(audience) { await this.repository.assertActiveIdentity(audience); return this.repository.unreadCount(audience.userId, audience.schoolId, audience.platformAdmin); }
    async markRead(audience, notificationId) {
        await this.repository.assertActiveIdentity(audience);
        if (!(await this.repository.recipientOwns(notificationId, audience.userId, audience.schoolId, audience.platformAdmin)))
            throw new Error("Notification is unavailable to this recipient.");
        const at = new Date();
        await this.repository.markRead(notificationId, audience.userId, at);
        await this.repository.audit({ action: "NOTIFICATION_READ", actorUserId: audience.userId, schoolId: audience.schoolId, notificationId, at });
    }
    async markAllRead(audience) { await this.repository.assertActiveIdentity(audience); const at = new Date(); return this.repository.markAllRead(audience.userId, audience.schoolId, audience.platformAdmin, at); }
}
