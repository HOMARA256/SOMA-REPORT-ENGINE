export type AuthenticatedIdentity = { userId: string; email?: string; mfaVerified: boolean };
export type PlatformAdminRecord = { id: string; userId: string; email: string; active: boolean; mfaRequired: boolean };

export interface PlatformAdminIdentityRepository {
  findActiveByUserId(userId: string): Promise<PlatformAdminRecord | null>;
  recordLogin(platformAdminId: string, occurredAt: Date): Promise<void>;
}

export class PlatformAuthenticationError extends Error {}

export class PlatformAuthService {
  constructor(private readonly repository: PlatformAdminIdentityRepository) {}

  async authorize(identity: AuthenticatedIdentity) {
    const administrator = await this.repository.findActiveByUserId(identity.userId);
    if (!administrator?.active) throw new PlatformAuthenticationError("Platform Administrator authorization is required.");
    if (administrator.mfaRequired && !identity.mfaVerified) throw new PlatformAuthenticationError("MFA verification is required.");
    await this.repository.recordLogin(administrator.id, new Date());
    return administrator;
  }
}
