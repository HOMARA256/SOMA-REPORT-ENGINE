export type NotificationAudience = { userId: string; schoolId?: string; platformAdmin: boolean };
export type NotificationCategory = "ACADEMIC" | "MARKS" | "MODERATION" | "REPORTS" | "SUBSCRIPTION" | "PAYMENTS" | "SECURITY" | "SYSTEM" | "BILLING" | "SCHOOLS" | "OPERATIONS";

export interface NotificationRepository {
  assertActiveIdentity(audience: NotificationAudience): Promise<void>;
  listForRecipient(input: { userId: string; schoolId?: string; platformAdmin: boolean; category?: NotificationCategory; unreadOnly?: boolean; limit: number; cursor?: string }): Promise<{ items: unknown[]; nextCursor?: string }>;
  recipientOwns(notificationId: string, userId: string, schoolId?: string, platformAdmin?: boolean): Promise<boolean>;
  markRead(notificationId: string, userId: string, at: Date): Promise<void>;
  markAllRead(userId: string, schoolId: string | undefined, platformAdmin: boolean, at: Date): Promise<number>;
  unreadCount(userId: string, schoolId?: string, platformAdmin?: boolean): Promise<number>;
  audit(event: Record<string, unknown>): Promise<void>;
  createEventNotification(input: { schoolId?: string; recipientUserId: string; category: NotificationCategory; eventType: string; title: string; message: string; entityType?: string; entityId?: string; idempotencyKey: string }): Promise<{ id: string; created: boolean }>;
}

export class NotificationEventService {
  constructor(private readonly repository: NotificationRepository) {}
  async marksReturned(input: { schoolId: string; teacherUserId: string; batchId: string }) { return this.create({ schoolId: input.schoolId, recipientUserId: input.teacherUserId, category: "MARKS", eventType: "MARKS_RETURNED_FOR_CORRECTION", title: "Marks returned for correction", message: "A submitted marks batch requires correction.", entityType: "marks_batch", entityId: input.batchId, idempotencyKey: `marks-returned:${input.batchId}` }); }
  async marksSubmitted(input: { schoolId: string; reviewerUserId: string; batchId: string }) { return this.create({ schoolId: input.schoolId, recipientUserId: input.reviewerUserId, category: "MODERATION", eventType: "MARKS_SUBMITTED_FOR_REVIEW", title: "Marks submitted for review", message: "A marks batch is ready for moderation.", entityType: "marks_batch", entityId: input.batchId, idempotencyKey: `marks-submitted:${input.batchId}` }); }
  async reportPublished(input: { schoolId: string; recipientUserId: string; reportId: string }) { return this.create({ schoolId: input.schoolId, recipientUserId: input.recipientUserId, category: "REPORTS", eventType: "REPORT_PUBLISHED", title: "Report published", message: "An authorised report is now available.", entityType: "report_publication", entityId: input.reportId, idempotencyKey: `report-published:${input.reportId}:${input.recipientUserId}` }); }
  async invoiceIssued(input: { schoolId: string; schoolAdminUserId: string; invoiceId: string }) { return this.create({ schoolId: input.schoolId, recipientUserId: input.schoolAdminUserId, category: "SUBSCRIPTION", eventType: "SUBSCRIPTION_INVOICE_ISSUED", title: "Subscription invoice issued", message: "A new academic-term subscription invoice is available.", entityType: "subscription_invoice", entityId: input.invoiceId, idempotencyKey: `invoice-issued:${input.invoiceId}:${input.schoolAdminUserId}` }); }
  private async create(input: Parameters<NotificationRepository["createEventNotification"]>[0]) { const result = await this.repository.createEventNotification(input); if (result.created) await this.repository.audit({ action: "NOTIFICATION_CREATED", schoolId: input.schoolId, recipientUserId: input.recipientUserId, notificationId: result.id, eventType: input.eventType }); return result; }
}

export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}
  async list(audience: NotificationAudience, query: { category?: NotificationCategory; unreadOnly?: boolean; limit?: number; cursor?: string } = {}) {
    await this.repository.assertActiveIdentity(audience);
    return this.repository.listForRecipient({ ...audience, ...query, limit: Math.min(Math.max(query.limit ?? 30, 1), 100) });
  }
  async unreadCount(audience: NotificationAudience) { await this.repository.assertActiveIdentity(audience); return this.repository.unreadCount(audience.userId, audience.schoolId, audience.platformAdmin); }
  async markRead(audience: NotificationAudience, notificationId: string) {
    await this.repository.assertActiveIdentity(audience);
    if (!(await this.repository.recipientOwns(notificationId, audience.userId, audience.schoolId, audience.platformAdmin))) throw new Error("Notification is unavailable to this recipient.");
    const at = new Date(); await this.repository.markRead(notificationId, audience.userId, at); await this.repository.audit({ action: "NOTIFICATION_READ", actorUserId: audience.userId, schoolId: audience.schoolId, notificationId, at });
  }
  async markAllRead(audience: NotificationAudience) { await this.repository.assertActiveIdentity(audience); const at = new Date(); return this.repository.markAllRead(audience.userId, audience.schoolId, audience.platformAdmin, at); }
}
