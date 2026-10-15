# Backup and recovery

Use Supabase production backups or point-in-time recovery for PostgreSQL and versioned, school-scoped Supabase Storage for uploads. Keep encrypted copies in a separate account or region, restrict backup access, and follow the approved retention policy. The VPS filesystem is not an authoritative data store.

Daily automation must verify the newest database and storage backup, its age, size and checksum, and alert on failure. Quarterly, restore into an isolated Supabase project, apply pending migrations, verify RLS and tenant isolation, authenticate test users, retrieve a school logo, open a learner record and generate a report. Record recovery time and securely destroy test data.

Before releases, take a recoverable backup. During an incident, stop writes, preserve restricted logs, select the last verified recovery point, restore to isolation, verify it, and switch configuration only after approval. Never place credentials, tokens or learner data in backup logs.
