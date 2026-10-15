export class SubscriptionPaymentService {
    repository;
    providers;
    pdf;
    storage;
    email;
    constructor(repository, providers, pdf, storage, email) {
        this.repository = repository;
        this.providers = providers;
        this.pdf = pdf;
        this.storage = storage;
        this.email = email;
    }
    async verify(principal, command) {
        if (!principal.active || principal.role !== "PLATFORM_ADMIN")
            throw new Error("Active Platform Administrator authorization is required.");
        const prior = await this.repository.verifiedByIdempotencyKey(command.idempotencyKey);
        if (prior)
            return prior;
        const claim = await this.repository.claimForVerification(command.claimId);
        if (!claim)
            throw new Error("Payment claim was not found.");
        const invoice = await this.repository.invoice(claim.invoiceId);
        if (!invoice || invoice.schoolId !== claim.schoolId || invoice.status === "PAID")
            throw new Error("Invoice is unavailable for verification.");
        if (await this.repository.transactionUsed(claim.provider, command.providerTransactionReference))
            throw new Error("Provider transaction has already been used.");
        const provider = this.providers.get(claim.provider);
        if (!provider)
            throw new Error("The payment provider integration is not configured.");
        const verification = await provider.verifyPayment({ transactionReference: command.providerTransactionReference, invoiceReference: claim.invoiceReference });
        if (!verification.verified || verification.amount !== invoice.amountDue || verification.currency !== invoice.currency)
            throw new Error("Payment could not be verified against the invoice amount and currency.");
        const result = await this.repository.transaction(async () => {
            const payment = await this.repository.createVerifiedPayment({ schoolId: invoice.schoolId, invoiceId: invoice.id, claimId: claim.id, provider: claim.provider, providerTransactionReference: command.providerTransactionReference, amount: verification.amount, currency: verification.currency, idempotencyKey: command.idempotencyKey, verifiedBy: principal.id, providerVerifiedAt: verification.occurredAt });
            await this.repository.markInvoicePaid(invoice.id, verification.occurredAt);
            await this.repository.activateSubscription(invoice.id, verification.occurredAt);
            const receipt = await this.repository.createReceipt({ schoolId: invoice.schoolId, paymentId: payment.id, snapshot: { academicYear: invoice.academicYear, academicTerm: invoice.academicTerm, amount: verification.amount, currency: verification.currency, provider: claim.provider, providerReference: verification.providerReference } });
            await this.repository.createNotification({ schoolId: invoice.schoolId, eventType: "PAYMENT_CONFIRMED", entityType: "digital_receipt", entityId: receipt.id, idempotencyKey: `payment-confirmed:${payment.id}` });
            await this.repository.createNotification({ schoolId: invoice.schoolId, eventType: "RECEIPT_AVAILABLE", entityType: "digital_receipt", entityId: receipt.id, idempotencyKey: `receipt-available:${receipt.id}` });
            await this.repository.writeAudit({ action: "PAYMENT_VERIFIED", schoolId: invoice.schoolId, targetId: payment.id, actorId: principal.id });
            return receipt;
        });
        const document = await this.pdf.generate(result.snapshot);
        await this.storage.put(result.storageKey, document.bytes);
        const recipient = await this.repository.activeSchoolAdminEmail(invoice.schoolId);
        await this.email.queue({ receiptId: result.id, schoolId: invoice.schoolId, recipient, idempotencyKey: `receipt-email:${result.id}` });
        return { receiptId: result.id };
    }
}
