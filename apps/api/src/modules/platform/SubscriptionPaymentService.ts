import type { PlatformPrincipal } from "./PlatformAdminService";

export type PaymentProviderCode = "MTN_MOMOPAY" | "AIRTEL_MONEY_MERCHANT";
export type VerifyPaymentCommand = { claimId: string; providerTransactionReference: string; idempotencyKey: string };
export interface PaymentProvider { readonly code: PaymentProviderCode; verifyPayment(input: { transactionReference: string; invoiceReference: string }): Promise<{ verified: boolean; amount: number; currency: string; occurredAt: Date; providerReference: string }>; }
export interface ReceiptPdfService { generate(receipt: Record<string, unknown>): Promise<{ bytes: Uint8Array; sha256: string }>; }
export interface PrivateReceiptStorage { put(key: string, bytes: Uint8Array): Promise<void>; }
export interface ReceiptEmailService { queue(input: { receiptId: string; schoolId: string; recipient: string; idempotencyKey: string }): Promise<void>; }

export interface SubscriptionPaymentRepository {
 transaction<T>(work: () => Promise<T>): Promise<T>; claimForVerification(claimId: string): Promise<{ id: string; schoolId: string; invoiceId: string; invoiceReference: string; provider: PaymentProviderCode; transactionReference: string; amountClaimed: number; currency: string } | null>;
 invoice(invoiceId: string): Promise<{ id: string; schoolId: string; amountDue: number; currency: string; status: string; academicYear: number; academicTerm: string } | null>;
 verifiedByIdempotencyKey(key: string): Promise<{ receiptId: string } | null>; transactionUsed(provider: PaymentProviderCode, reference: string): Promise<boolean>;
 createVerifiedPayment(input: Record<string, unknown>): Promise<{ id: string }>; markInvoicePaid(invoiceId: string, at: Date): Promise<void>; activateSubscription(invoiceId: string, at: Date): Promise<void>;
 createReceipt(input: Record<string, unknown>): Promise<{ id: string; receiptNumber: string; storageKey: string; snapshot: Record<string, unknown> }>;
 activeSchoolAdminEmail(schoolId: string): Promise<string>; createNotification(input: Record<string, unknown>): Promise<void>; writeAudit(input: Record<string, unknown>): Promise<void>;
}

export class SubscriptionPaymentService {
 constructor(private readonly repository: SubscriptionPaymentRepository, private readonly providers: Map<PaymentProviderCode, PaymentProvider>, private readonly pdf: ReceiptPdfService, private readonly storage: PrivateReceiptStorage, private readonly email: ReceiptEmailService) {}
 async verify(principal: PlatformPrincipal, command: VerifyPaymentCommand) {
  if (!principal.active || principal.role !== "PLATFORM_ADMIN") throw new Error("Active Platform Administrator authorization is required.");
  const prior = await this.repository.verifiedByIdempotencyKey(command.idempotencyKey); if (prior) return prior;
  const claim = await this.repository.claimForVerification(command.claimId); if (!claim) throw new Error("Payment claim was not found.");
  const invoice = await this.repository.invoice(claim.invoiceId); if (!invoice || invoice.schoolId !== claim.schoolId || invoice.status === "PAID") throw new Error("Invoice is unavailable for verification.");
  if (await this.repository.transactionUsed(claim.provider, command.providerTransactionReference)) throw new Error("Provider transaction has already been used.");
  const provider = this.providers.get(claim.provider); if (!provider) throw new Error("The payment provider integration is not configured.");
  const verification = await provider.verifyPayment({ transactionReference: command.providerTransactionReference, invoiceReference: claim.invoiceReference });
  if (!verification.verified || verification.amount !== invoice.amountDue || verification.currency !== invoice.currency) throw new Error("Payment could not be verified against the invoice amount and currency.");
  const result = await this.repository.transaction(async () => {
   const payment = await this.repository.createVerifiedPayment({ schoolId: invoice.schoolId, invoiceId: invoice.id, claimId: claim.id, provider: claim.provider, providerTransactionReference: command.providerTransactionReference, amount: verification.amount, currency: verification.currency, idempotencyKey: command.idempotencyKey, verifiedBy: principal.id, providerVerifiedAt: verification.occurredAt });
   await this.repository.markInvoicePaid(invoice.id, verification.occurredAt); await this.repository.activateSubscription(invoice.id, verification.occurredAt);
   const receipt = await this.repository.createReceipt({ schoolId: invoice.schoolId, paymentId: payment.id, snapshot: { academicYear: invoice.academicYear, academicTerm: invoice.academicTerm, amount: verification.amount, currency: verification.currency, provider: claim.provider, providerReference: verification.providerReference } });
   await this.repository.createNotification({ schoolId: invoice.schoolId, eventType: "PAYMENT_CONFIRMED", entityType: "digital_receipt", entityId: receipt.id, idempotencyKey: `payment-confirmed:${payment.id}` });
   await this.repository.createNotification({ schoolId: invoice.schoolId, eventType: "RECEIPT_AVAILABLE", entityType: "digital_receipt", entityId: receipt.id, idempotencyKey: `receipt-available:${receipt.id}` });
   await this.repository.writeAudit({ action: "PAYMENT_VERIFIED", schoolId: invoice.schoolId, targetId: payment.id, actorId: principal.id }); return receipt;
  });
  const document = await this.pdf.generate(result.snapshot); await this.storage.put(result.storageKey, document.bytes);
  const recipient = await this.repository.activeSchoolAdminEmail(invoice.schoolId); await this.email.queue({ receiptId: result.id, schoolId: invoice.schoolId, recipient, idempotencyKey: `receipt-email:${result.id}` });
  return { receiptId: result.id };
 }
}
