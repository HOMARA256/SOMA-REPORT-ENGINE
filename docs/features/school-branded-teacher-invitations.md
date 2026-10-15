# School-branded teacher invitations

## Release steps

1. From the repository root, run `.\scripts\push-school-teacher-invitations.ps1` for a dry run only. It asks for the database password in a hidden prompt and refuses to continue unless the only pending migration is `20261013110000_school_scoped_teacher_invitations.sql`.
2. After reviewing the dry run, run `.\scripts\push-school-teacher-invitations.ps1 -ApplyMigration` to apply only that migration. To explicitly authorize both the migration and the two function deployments in one checked run, add `-DeployFunctions` as well.
3. Configure Edge Function secrets `PUBLIC_APP_URL`, `RESEND_API_KEY`, and `SCHOOL_INVITATION_FROM_EMAIL`. The sender address must be verified with the email provider. Do not commit secret values.
4. Confirm the Supabase Auth redirect allow-list includes the selected app origin and `/teacher-invitation/accept` route. In the current local-only stage, use the exact configured localhost origin.
5. In a test school, create invitations for (a) an email with no existing account and (b) an existing account. Accept both only using the invited email, confirm the new account creates a password, and verify role and configured allocations after refresh.
6. With two test schools, verify invitations, allocation lists, membership switching, and data visibility remain school-scoped. Try a revoked/expired link and a wrong-email session; both must be rejected.

The invitation is seven-day, single-use, and bound to the invited email. Without the Resend secrets, the function returns a one-time secure link for the School Admin to share manually; automatic branded email delivery is not available until the provider is configured. No password is sent by email.

Existing Auth identities are reused, not duplicated. The school membership is activated only when the invitee accepts. Teacher permissions continue to come from the existing Teacher role; class/subject assignments use the established school offerings and teacher allocation records.
