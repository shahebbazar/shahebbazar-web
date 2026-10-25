# [Sprint 2] Prepare VPS and Domain Handover Checklist

**Project:** Shaheb Bazar - COS40005 Group 23  
**Jira Task:** KAN-255  
**Task Owner:** Hiruna  
**Current Status:** Checklist prepared. Final production VPS/domain credentials are pending from the client.

## 1. Purpose and Scope

This checklist defines the information, credentials, access and ownership details required from the client before the Shaheb Bazar platform is connected to the final production VPS and domain. It is intended to reduce deployment delays, prevent missing credentials, and provide a clear production handover record.

> The current AWS test instance and automated CI/CD deployment can be used for validation, but this checklist is for the client's final production VPS/domain handover.

## 2. VPS / Server Access

- [ ] VPS provider confirmed.
- [ ] VPS public IP address received.
- [ ] Server operating system and version confirmed.
- [ ] SSH username received.
- [ ] SSH port confirmed.
- [ ] SSH key or temporary password received through a secure channel.
- [ ] sudo/administrator privileges confirmed.
- [ ] CPU, RAM and storage capacity confirmed.
- [ ] Server region/location confirmed.
- [ ] Firewall or cloud security-group management access confirmed.
- [ ] Ports 80 and 443 can be opened for HTTP/HTTPS.
- [ ] SSH access tested successfully.
- [ ] Server ownership/account holder confirmed.

## 3. Domain and DNS Handover

- [ ] Final production domain name confirmed.
- [ ] Domain registrar confirmed.
- [ ] Client confirms ownership of the domain.
- [ ] DNS management access provided.
- [ ] Current nameservers recorded.
- [ ] Permission to create or update DNS records confirmed.
- [ ] Root domain record can be pointed to the production VPS.
- [ ] www subdomain record can be configured.
- [ ] Domain renewal responsibility confirmed.
- [ ] Client recovery email/phone for the registrar confirmed.
- [ ] Permission to issue and renew HTTPS certificates confirmed.

## 4. Production Application Configuration

- [ ] Final production site URL confirmed.
- [ ] Production API origin confirmed.
- [ ] Production CORS origin confirmed.
- [ ] Production environment-variable values prepared.
- [ ] Production database connection details prepared.
- [ ] Secure OTP_HASH_SECRET prepared.
- [ ] Live SMS provider credentials available when the provider is selected.
- [ ] Production email/SMTP credentials available if required.
- [ ] Production sender name/email confirmed.
- [ ] Analytics/configuration secrets prepared.
- [ ] Production `.env` will be stored securely and excluded from Git.
- [ ] Demo login code and test-only settings will be disabled before production launch.

## 5. Database and Data

- [ ] Production PostgreSQL instance available.
- [ ] Production database name confirmed.
- [ ] Production database user created.
- [ ] Strong database password created.
- [ ] Database is not exposed publicly unless explicitly required.
- [ ] Current baseline and migrations can be applied.
- [ ] Production seed/reference-data requirements confirmed.
- [ ] Database verification procedure confirmed.
- [ ] Backup procedure prepared.
- [ ] Restore procedure documented and tested.
- [ ] Backup storage location confirmed.
- [ ] Backup retention period agreed.

## 6. Deployment and CI/CD

- [ ] GitHub repository access verified.
- [ ] `main` branch protection confirmed.
- [ ] Pull requests are required for changes to `main`.
- [ ] CI runs API tests, frontend checks and browser tests before merge.
- [ ] Successful merge to `main` triggers automatic deployment to the test/deployment environment.
- [ ] Deployment secrets are stored securely in the CI/CD environment.
- [ ] Deployment rollback/revert process documented.
- [ ] Deployment health-check process documented.
- [ ] Deployment logs are accessible to authorised team members.
- [ ] Server deployment instructions are documented in `docs/DEPLOY.md`.

## 7. HTTPS and Security

- [ ] DNS points to the production VPS.
- [ ] HTTPS certificate configured.
- [ ] HTTP redirects to HTTPS.
- [ ] Production session cookies use secure settings.
- [ ] CORS is restricted to the production domain.
- [ ] Database port is protected from unnecessary public access.
- [ ] Firewall/security-group rules reviewed.
- [ ] Only required inbound ports are open.
- [ ] SSH access is restricted to authorised users.
- [ ] Production secrets are not committed to the repository.
- [ ] Test/demo credentials are removed or disabled for production.
- [ ] Application logs do not expose passwords, session tokens or verification codes.

## 8. Client Handover Information

- [ ] VPS provider/account ownership confirmed.
- [ ] VPS IP address supplied.
- [ ] SSH access details supplied securely.
- [ ] Final production domain supplied.
- [ ] Domain registrar and DNS access supplied.
- [ ] Production SMS provider account supplied when selected.
- [ ] Production email/SMTP account supplied if required.
- [ ] Approved production contact details supplied.
- [ ] Backup ownership and retention expectations confirmed.
- [ ] People authorised to retain server/domain access after handover confirmed.

## 9. Final Verification Before Production Deployment

- [ ] VPS access verified.
- [ ] DNS access verified.
- [ ] Required credentials received securely.
- [ ] Production environment variables prepared.
- [ ] Database access verified.
- [ ] Backup and restore procedure available.
- [ ] CI/CD pipeline passing.
- [ ] Production build passes tests, lint, typecheck and build.
- [ ] Domain and HTTPS configuration ready.
- [ ] Client authorisation to proceed with production deployment received.

## 10. Current Project Status

| Area | Current Status | Next Action |
| --- | --- | --- |
| CI/CD | Available | Continue using PR -> CI -> main -> automatic deployment workflow. |
| AWS test instance | Available | Use for test validation and demo verification. |
| Final client VPS | Pending client | Receive access details and verify SSH/sudo access. |
| Final production domain | Pending client | Receive registrar/DNS access and configure records. |
| HTTPS production certificate | Pending final domain | Issue certificate after DNS points to the production server. |
| Live SMS provider | Pending provider/client details | Integrate once provider and credentials are confirmed. |

## 11. Completion Criteria for KAN-255

KAN-255 can be marked **Done** when this checklist is reviewed, stored as project evidence, and linked to the Jira child task. The actual receipt and verification of production credentials belongs to the follow-on deployment-access task and does not block completion of this checklist-preparation task.
