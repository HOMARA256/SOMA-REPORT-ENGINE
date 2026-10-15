export type AcademicTerm = "TERM_I" | "TERM_II" | "TERM_III";
export type RegistrationCommand = { school: { name: string; code: string; location: string; primaryContact: string; phone: string; email: string; programmes: string[] }; subscription: { academicYear: number; term: AcademicTerm; status: "TRIAL"|"ACTIVE"|"PAYMENT_DUE" }; administrator: { fullName: string; email: string; phone: string }; actorId: string };

export interface EmailService {
  sendSchoolAdminInvitation(message: { recipient: string; recipientName: string; schoolName: string; acceptUrl: string; expiresAt: Date }): Promise<{ providerReference: string }>;
  sendPaymentConfirmation(message: { recipient: string; schoolName: string; academicYear: number; term: AcademicTerm; amount: number; currency: "UGX" }): Promise<{ providerReference: string }>;
}

export interface PlatformProvisioningRepository {
  transaction<T>(work: () => Promise<T>): Promise<T>;
  assertSchoolCodeAvailable(code: string): Promise<void>;
  findIdentityByEmail(email: string): Promise<{ userId: string } | null>;
  createSchool(input: RegistrationCommand["school"]): Promise<{ id: string; name: string }>;
  activeSubscriptionPlan(code: "OURSCHOOL_TERMLY"): Promise<{ code: "OURSCHOOL_TERMLY"; amount: number; currency: "UGX"; billingPeriod: "ACADEMIC_TERM" }>;
  createTermlySubscription(input: { schoolId: string; planCode: "OURSCHOOL_TERMLY"; academicYear: number; term: AcademicTerm; amountSnapshot: number; currency: "UGX"; status: RegistrationCommand["subscription"]["status"] }): Promise<{ id: string }>;
  createInvitedMembership(input: { schoolId: string; existingUserId?: string; email: string; fullName: string; phone: string }): Promise<{ id: string }>;
  createInvitation(input: { schoolId: string; membershipId: string; tokenHash: string; expiresAt: Date; actorId: string }): Promise<{ id: string }>;
  markInvitationDelivery(input: { invitationId: string; status: "SENT"|"FAILED"; providerReference?: string; failureCategory?: string }): Promise<void>;
  setOnboardingState(schoolId: string, state: "REGISTERED"|"ADMIN_INVITED"): Promise<void>;
  writeAudit(event: Record<string, unknown>): Promise<void>;
}

export interface InvitationTokenService { issue(): Promise<{ rawToken: string; tokenHash: string; expiresAt: Date }> }

export class PlatformProvisioningService {
  constructor(private readonly repository: PlatformProvisioningRepository, private readonly email: EmailService, private readonly tokens: InvitationTokenService, private readonly invitationBaseUrl: string) {}

  async registerSchool(command: RegistrationCommand) {
    await this.repository.assertSchoolCodeAvailable(command.school.code);
    const plan = await this.repository.activeSubscriptionPlan("OURSCHOOL_TERMLY");
    const created = await this.repository.transaction(async () => {
      const school = await this.repository.createSchool(command.school);
      await this.repository.createTermlySubscription({ schoolId: school.id, planCode: plan.code, academicYear: command.subscription.academicYear, term: command.subscription.term, amountSnapshot: plan.amount, currency: plan.currency, status: command.subscription.status });
      const existing = await this.repository.findIdentityByEmail(command.administrator.email);
      const membership = await this.repository.createInvitedMembership({ schoolId: school.id, existingUserId: existing?.userId, email: command.administrator.email, fullName: command.administrator.fullName, phone: command.administrator.phone });
      const token = await this.tokens.issue();
      const invitation = await this.repository.createInvitation({ schoolId: school.id, membershipId: membership.id, tokenHash: token.tokenHash, expiresAt: token.expiresAt, actorId: command.actorId });
      await this.repository.setOnboardingState(school.id, "REGISTERED");
      await this.repository.writeAudit({ actor_id: command.actorId, school_id: school.id, action: "SCHOOL_REGISTERED", academic_year: command.subscription.academicYear, term: command.subscription.term, amount: plan.amount, currency: plan.currency });
      return { school, invitation, token };
    });

    try {
      const delivery = await this.email.sendSchoolAdminInvitation({ recipient: command.administrator.email, recipientName: command.administrator.fullName, schoolName: created.school.name, acceptUrl: `${this.invitationBaseUrl}/accept-invitation?token=${encodeURIComponent(created.token.rawToken)}`, expiresAt: created.token.expiresAt });
      await this.repository.markInvitationDelivery({ invitationId: created.invitation.id, status: "SENT", providerReference: delivery.providerReference });
      await this.repository.setOnboardingState(created.school.id, "ADMIN_INVITED");
      await this.repository.writeAudit({ actor_id: command.actorId, school_id: created.school.id, action: "SCHOOL_ADMIN_INVITATION_SENT", invitation_id: created.invitation.id });
      return { schoolId: created.school.id, invitationStatus: "SENT" as const };
    } catch {
      await this.repository.markInvitationDelivery({ invitationId: created.invitation.id, status: "FAILED", failureCategory: "DELIVERY_PROVIDER_ERROR" });
      await this.repository.writeAudit({ actor_id: command.actorId, school_id: created.school.id, action: "SCHOOL_ADMIN_INVITATION_FAILED", invitation_id: created.invitation.id });
      return { schoolId: created.school.id, invitationStatus: "FAILED" as const };
    }
  }
}
