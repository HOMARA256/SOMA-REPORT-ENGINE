export class PlatformAuthController {
    identityProvider;
    authorization;
    constructor(identityProvider, authorization) {
        this.identityProvider = identityProvider;
        this.authorization = authorization;
    }
    /** HTTP adapter target for POST /api/v1/platform/auth/login. */
    async login(body) {
        if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email.trim() || !body.password) {
            return { status: 400, body: { authorized: false, error: "Email and password are required." } };
        }
        try {
            const identity = await this.identityProvider.authenticateWithPassword(body.email.trim(), body.password);
            const administrator = await this.authorization.authorize(identity);
            const session = await this.identityProvider.createServerSession(identity);
            return { status: 200, body: { authorized: true, platformAdminId: administrator.id }, sessionCookie: session.sessionCookie };
        }
        catch {
            return { status: 401, body: { authorized: false, error: "Authentication failed." } };
        }
    }
}
