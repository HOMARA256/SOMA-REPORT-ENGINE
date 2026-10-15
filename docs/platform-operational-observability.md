# Platform operational observability

This change intentionally separates recorded evidence from inferred health.

## Deployment order

1. From Windows, run `./scripts/push-platform-operational-observability.ps1` for a dry run. It rejects any pending migration other than `20261014230000_platform_operational_observability.sql`. Rerun with `-Apply` and type `APPLY` to push only the expected migration. The function is read-only to active Platform Administrators; the heartbeat table is writable only with the service role.
2. Transfer an approved release containing this change to the Linux VPS. From its repository root, run `sh scripts/deploy-platform-operational-observability.sh` and type `DEPLOY`. It rebuilds and restarts only the web and worker services, then checks both. This step does not push migrations.
3. The worker requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the host. A heartbeat should appear within one minute. Never put the service-role key in the web build.
4. Confirm that a Platform Admin can read the aggregate status and that a School Admin/Teacher cannot execute `get_platform_operational_status()`.

## What the screen does and does not prove

- The notification ledger and school-initiated teacher recovery ledger report *recorded attempts in the past 24 hours*. `SENT` is provider submission, not proof of inbox delivery. No recipient email or recovery link is returned.
- Supabase Auth self-service recovery, teacher activation email, SMS, and other sends without a delivery record remain unmonitored. A zero count means *no records*, not successful delivery.
- The API worker publishes `HEARTBEAT_AND_SCHOOL_MESSAGE_NOTICES` after the School–Teacher Message Centre migration and worker release. It runs the school-message notification outbox retry. A fresh heartbeat still does **not** prove individual notices reached recipients or that invoicing, backups, or other planned jobs ran. The `/health/ready` endpoint requires a recent published heartbeat.
- Backup snapshots, retention, storage usage, restore tests, and security alerts remain explicitly unverified in the UI. Connect provider-backed evidence before presenting any of them as healthy.
