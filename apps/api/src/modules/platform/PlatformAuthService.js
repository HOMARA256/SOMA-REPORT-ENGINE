export class PlatformAuthenticationError extends Error {
}
export class PlatformAuthService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async authorize(identity) {
        const administrator = await this.repository.findActiveByUserId(identity.userId);
        if (!administrator?.active)
            throw new PlatformAuthenticationError("Platform Administrator authorization is required.");
        if (administrator.mfaRequired && !identity.mfaVerified)
            throw new PlatformAuthenticationError("MFA verification is required.");
        await this.repository.recordLogin(administrator.id, new Date());
        return administrator;
    }
}
