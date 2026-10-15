# SOMA REPORT ENGINE: Jubilee Linux VPS production runbook

This runbook deploys the application to a Linux Cloud VPS behind Nginx. The VPS holds application containers and operational logs only. Supabase remains the protected system of record for tenant data, authentication and school-scoped Storage.

## 1. Before provisioning

- Use an Ubuntu Server LTS Cloud VPS with a public IPv4 address and a DNS name such as `app.yourdomain.ug`.
- In DNS, add one `A` record for the application hostname pointing to the VPS public IPv4 address. Wait for DNS resolution before requesting TLS.
- Keep the Supabase project, email provider and MTN/Airtel merchant production credentials under the platform owner’s control. Do not put service-role keys, mobile-money secrets or SMTP credentials in browser variables.
- Confirm Supabase Authentication has the production site URL and permitted redirect URLs. Configure the same public hostname for password recovery and invitations.

## 2. Harden the VPS

Run these commands as the initial VPS administrator, then use the deploy account for ordinary work:

```bash
sudo adduser soma
sudo usermod -aG sudo,docker soma
sudo install -d -m 700 -o soma -g soma /home/soma/.ssh
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Install Docker Engine with the official Docker installation steps for the chosen Ubuntu LTS release, then install Nginx, Certbot, Git, curl and `logrotate`. Configure SSH to accept keys only and to refuse direct root login. Enable automated security updates. Do not expose Docker ports `8080`, `3000`, or `3001` publicly: Compose binds them only to `127.0.0.1` and Nginx is the sole public entry point.

## 3. First deployment

```bash
sudo mkdir -p /opt/soma-report-engine
sudo chown soma:soma /opt/soma-report-engine
sudo -u soma git clone <YOUR_PRIVATE_REPOSITORY_URL> /opt/soma-report-engine
cd /opt/soma-report-engine
cp .env.example .env
chmod 600 .env
```

Edit `.env` only on the VPS. At minimum provide a real `SOMA_DOMAIN`, matching `APP_URL` and `API_URL`, production Supabase values, a 32+ character `SESSION_SECRET`, a configured transactional `EMAIL_PROVIDER` and sender address, and `HEALTHCHECK_URL=https://<domain>/health/ready`. The `VITE_*` values are public browser configuration; all other secrets must remain server-only.

Set `BACKUP_CHECK_COMMAND` to a trusted, non-interactive verification command for the latest encrypted Supabase database and Storage backup. It must return exit code `0` only when recovery evidence is current. This prevents a deployment when backup evidence is missing.

Run the release:

```bash
chmod +x scripts/*.sh
./scripts/deploy.sh
```

The release script validates the environment without printing secrets, verifies backups, builds immutable containers, applies versioned migrations, waits for container health and records the deployed Git revision in ignored `var/releases/current`.

## 4. Publish Nginx and TLS

```bash
sudo ./scripts/render-nginx-config.sh /etc/nginx/sites-available/soma-report-engine
sudo ln -s /etc/nginx/sites-available/soma-report-engine /etc/nginx/sites-enabled/soma-report-engine
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo ./scripts/enable-tls.sh
sudo nginx -t
sudo systemctl reload nginx
```

Install log rotation:

```bash
sudo install -m 0644 deploy/logrotate/soma-report-engine /etc/logrotate.d/soma-report-engine
sudo logrotate -d /etc/logrotate.d/soma-report-engine
```

After DNS and TLS are live, verify `https://<domain>/health/live` and `https://<domain>/health/ready`. The latter must not expose private configuration or school data.

## 5. Monitoring and recovery

Install the host timers:

```bash
sudo ./scripts/install-vps-timers.sh
systemctl list-timers --all 'soma-*'
```

The health timer checks all three containers (`web`, `api`, `worker`) and the public HTTPS readiness endpoint every five minutes. The backup timer checks recovery evidence daily. If `ALERT_WEBHOOK_URL` is set, only a short operational failure status is sent; no credentials, learner records, payment numbers or message contents are sent.

Useful operator commands:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail=100 api worker
./scripts/vps-healthcheck.sh
./scripts/backup-check.sh
```

To roll back an application release, deploy the previously recorded Git revision/image only after confirming that any applied database migration remains compatible. Do not delete or reverse production academic, payment or audit data as a shortcut. Restore data only through a rehearsed Supabase recovery procedure.

## 6. Required external completion checks

- Configure Supabase Auth redirect URLs, RLS policies, Storage policies and leaked-password protection.
- Complete live MTN MoMo and Airtel Money merchant onboarding, signed callbacks, reconciliation and settlement verification before enabling live collection. Sandbox mode must remain visibly non-live.
- Configure transactional email domain verification, SPF, DKIM and DMARC so invitations, reset links and receipts arrive reliably.
- Configure an external uptime monitor for the HTTPS readiness URL and an alert destination for operational failures.
- Rehearse a tenant-safe backup restore before public launch.
