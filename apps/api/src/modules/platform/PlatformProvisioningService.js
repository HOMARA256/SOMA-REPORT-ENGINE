export class PlatformProvisioningService {
    repository;
    email;
    tokens;
    invitationBaseUrl;
    constructor(repository, email, tokens, invitationBaseUrl) {
        this.repository = repository;
        this.email = email;
        this.tokens = tokens;
        this.invitationBaseUrl = invitationBaseUrl;
    }
    async registerSchool(command) {
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
            return { schoolId: created.school.id, invitationStatus: "SENT" };
        }
        catch {
            await this.repository.markInvitationDelivery({ invitationId: created.invitation.id, status: "FAILED", failureCategory: "DELIVERY_PROVIDER_ERROR" });
            await this.repository.writeAudit({ actor_id: command.actorId, school_id: created.school.id, action: "SCHOOL_ADMIN_INVITATION_FAILED", invitation_id: created.invitation.id });
            return { schoolId: created.school.id, invitationStatus: "FAILED" };
        }
    }
}
