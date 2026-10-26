# Deploying to the client's server (Identity Umbrella VPS)

The client hosts Shahebbazar on their own Linux server (145.223.23.210), run by Identity Umbrella
(technical supervisor: Mohammad Abdullah). Their rules are in *iBrella_VPS_Developer_Deployment_Guide.pdf*;
what has to be received from the client before going live is in
[KAN-255_VPS_Domain_Handover_Checklist.md](KAN-255_VPS_Domain_Handover_Checklist.md). This guide is
the technical part: how our stack runs there. The team test server on AWS is in [DEPLOY.md](DEPLOY.md).

## How it differs from the AWS test server

| Their server | What we do |
| --- | --- |
| Their **Traefik** serves HTTPS for every project and routes by container labels. No host ports. | No Caddy. `deploy/client/docker-compose.yml` labels the website, API and test inbox: `/api` and `/uploads` go to the API, `/mail` to the test inbox, the rest to the website. |
| Public containers join the shared network `traefik_public`; private traffic uses `net_shahebbazar`. Both are created by their administrators. | The database is on `net_shahebbazar` only. Containers and routers are all named `shahebbazar-…` and reach each other by those names, because a plain `api` could be another project's container on the shared network. |
| Every service declares **resource limits**. | 0.5 CPU and 512 MB each for the website, API and database; 0.25 CPU and 128 MB for the test inbox. They use well under that. |
| Developers have **no Docker access**: only `sudo project-ctl build/up/restart/status/logs shahebbazar`. | Nobody can run `load-db` or `psql` in the containers, so the API sets up its own database on start (`DB_AUTO_SETUP=true`, `backend/lib/setupDatabase.js`): an empty database gets the baseline schema and demo data, and every start applies migrations not yet recorded in `schema_migrations`. |
| A shared **MySQL** database (`global-db`). | Shahebbazar is PostgreSQL, so it runs its own PostgreSQL 16 container on the private network. **Needs Mohammad's agreement** (asked). |
| `project-ctl` runs the workspace's `docker-compose.yml`. | The repository is cloned into `app/` inside the workspace, and a two-line `docker-compose.yml` beside it includes the real file from the clone, so `git pull` updates it. |

The workspace on the server:

```
/var/www/apps/shahebbazar/
├── docker-compose.yml   # copied once from app/deploy/client/workspace-compose.yml
├── .env                 # the settings and secrets (chmod 600), from app/deploy/client/.env.example
└── app/                 # the repository
```

## Before the first deploy

From Mohammad (see the email of 25 October):

- [ ] Your account exists and `ssh <username>@145.223.23.210` works.
- [ ] PostgreSQL in our own container is agreed.
- [ ] The staging host name, for example `staging.shahebbazar.com`, and its DNS points at 145.223.23.210.
- [ ] `traefik_public` and `net_shahebbazar` exist, and the workspace is set up.

## First deploy

```bash
ssh <username>@145.223.23.210
cd /var/www/apps/shahebbazar

git clone https://github.com/shahebbazar/shahebbazar-web.git app
cp app/deploy/client/workspace-compose.yml docker-compose.yml
cp app/deploy/client/.env.example .env
chmod 600 .env
nano .env
```

In `.env`:

- `SITE_HOST`: the host name from Mohammad, without `https://`.
- `PGPASSWORD`, `OTP_HASH_SECRET`, `UNSUBSCRIBE_SECRET`, `ANALYTICS_SALT`, `MAIL_UI_PASSWORD`: a
  different random value each, from `openssl rand -hex 32`.
- `DEMO_LOGIN_CODE`: six digits, from `shuf -i 100000-999999 -n 1`. Until SMS works, every sign-in
  code is this code, and **anyone who knows it can sign in to any account, including admin**. Share it
  only with the team and the client.

Then build and start:

```bash
sudo project-ctl build shahebbazar      # first build takes a few minutes
sudo project-ctl up shahebbazar
sudo project-ctl status shahebbazar     # four containers, the database "healthy"
sudo project-ctl logs shahebbazar
```

On the first start, the API's log shows `Database setup: applied baseline/schema.sql`, `…seed.sql`,
`copied 19 seed images`, then `API running`. Later starts skip straight to `API running`.

**Check:**

- `https://<SITE_HOST>/api/health` shows `"ok":true`.
- The home page shows businesses and photos, with the **Test site** strip at the top.
- Log in as the demo business owner (01711-000005) with the demo code, send a campaign, and see it at
  `https://<SITE_HOST>/mail` (user `team` and `MAIL_UI_PASSWORD`).

## Updating

After changes are merged into `main`:

```bash
cd /var/www/apps/shahebbazar/app && git pull
cd .. && sudo project-ctl build shahebbazar && sudo project-ctl up shahebbazar
sudo project-ctl logs shahebbazar
```

New files in `database/migrations/` are applied by the API as it starts, each once; the log lists them
(`Database setup: applied migration …`). If one fails, the API doesn't start and the log shows why:
fix it in a new pull request, merge, and update again.

Or run `sh /var/www/apps/shahebbazar/app/deploy/client/deploy.sh`, which does the same and then
checks the site answers.

## Automatic deploys

Once every check passes on `main`, the **Deploy to staging** job in `.github/workflows/ci.yml` runs
`deploy/client/deploy.sh` on the server over SSH. It uses its own key, which the server lets run that
script and nothing else, under a team member's account (until there's a separate deploy user). Set up
once:

1. On your own computer, make a key just for this, pressing Enter twice for no passphrase:
   `ssh-keygen -t ed25519 -C "github-deploy-staging" -f staging_deploy`
   (On Windows PowerShell, `-N ""` doesn't work: PowerShell drops the empty value.)
2. On the server, add the public half to your `~/.ssh/authorized_keys` as **one line**, starting with
   the restriction:

   ```text
   command="sh /var/www/apps/shahebbazar/app/deploy/client/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... github-deploy-staging
   ```

3. On GitHub: **Settings → Environments → New environment** `staging`, then add these environment
   secrets:
   - `STAGING_HOST`: `145.223.23.210`
   - `STAGING_USER`: the account from step 2
   - `STAGING_SSH_KEY`: the private half (`staging_deploy`, the file without `.pub`), pasted whole
   - `STAGING_KNOWN_HOSTS`: the output of `ssh-keyscan 145.223.23.210`
4. Delete `staging_deploy` and `staging_deploy.pub` from your computer.

Until the secrets are set, the job notes that and passes. To check it: **Actions → CI → Run workflow**
on `main`. The **Deploy to staging** job ends with `Deployed: https://staging.shahebbazar.com is up.`

Production isn't deployed automatically: it will deploy only on a release, approved by hand.

## What `project-ctl` can't do

Without Docker access these need Mohammad, or a change to how we run:

- **Reset the demo data.** The data lives in the `shahebbazar_pgdata` volume; resetting means removing
  it, which only an administrator can do. Afterwards the API loads fresh demo data on its next start.
- **Backups.** `deploy/backup.sh` uses `docker compose exec`, so it can't run here. Agree with Mohammad
  how the database volume and `shahebbazar_uploads` are backed up.
- **Looking inside the database.** Use the admin pages, or ask Mohammad.

## Going live on this server

The same stack, with these changes in `.env`:

- `SITE_HOST=shahebbazar.com` (and its DNS).
- `TEST_BUILD=false` and `ROBOTS_HEADER=` (empty): no Test site strip, and search engines may index it.
- `DEMO_LOGIN_CODE=` (empty), once sign-in codes are sent by SMS.
- `SMS_PROVIDER=bulksmsbd`, `SMS_API_KEY` (from the BulkSMSBD panel) and `SMS_SENDER_ID=8809617634406`.
  If every code fails with BulkSMSBD code 1032 in the API log, whitelist the server's IP
  (145.223.23.210) in the BulkSMSBD panel. Codes are in Bangla for anyone using the site in Bangla or
  preferring it in My details, English otherwise.
- `SMTP_*` for the client's email provider, so campaign emails are delivered.
- **The data.** An empty database is loaded with the demo data today. The live site needs a
  reference-only seed (locations and categories) first, and a fresh database volume.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `404 page not found` in plain text | Traefik has no route for the address: check `SITE_HOST` in `.env` matches the address and DNS points at the server, then `project-ctl up` again. |
| `502 Bad Gateway` | A container isn't answering on its port (website 3000, API 4000, inbox 8025). `project-ctl status` and `logs`. |
| The API restarts over and over | Usually `Database setup failed` or a missing setting in the log: every required `.env` value must be set. |
| HTTPS certificate warning on the first visit | Traefik is still getting the certificate from Let's Encrypt; wait a minute. It needs DNS pointing at the server first. |
