# SOMA REPORT ENGINE Linux VPS deployment

## Provision and deploy

Use Ubuntu Server LTS. Create a non-root deploy user with SSH-key access, disable password SSH and direct root login, enable unattended security updates, and allow only SSH, HTTP and HTTPS through UFW. Install Docker Engine, Compose, Nginx, Certbot, Git and curl from official repositories.

1. Clone the approved release and enter the repository.
2. Copy `.env.example` to `.env`, replace every placeholder and run `chmod 600 .env`. Never commit it.
3. Run `npm ci`, then `npx supabase link --project-ref PROJECT_REF` on the controlled deployment host.
4. Run `npx supabase db push`; stop if migration validation fails.
5. Run `docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build`.
6. Copy `deploy/nginx/ourschool.conf` to `/etc/nginx/sites-available/ourschool`, replace `YOUR_DOMAIN`, enable it, run `sudo nginx -t`, then reload Nginx.
7. Issue a certificate with Certbot and verify `/health`, `/health/live`, and `/health/ready` over HTTPS.
8. Smoke-test platform and school login, school registration, `/school/learners`, subjects, marks, reports, notifications, uploads and the MTN sandbox.

The web container provides SPA fallback for every documented deep link. Durable files must use school-scoped Supabase Storage; containers are read-only and hold no permanent uploads.

## Safe update and rollback

Verify a Supabase backup, record the Git revision and image digests, pull an approved tag, build, migrate, restart and run health/browser checks. If verification fails, redeploy the recorded application image. Reverse data migrations only through an explicitly tested recovery migration.

External setup still required: domain DNS, TLS certificate, Supabase keys, email/SMS provider, storage policies and MTN MoMo approval/credentials. Run `chmod +x scripts/*.sh` after cloning if executable bits were not preserved.
