# Deploying to the client's server (Identity Umbrella VPS)

The client hosts Shahebbazar on their own Linux server (145.223.23.210), run by Identity Umbrella
(technical supervisor: Mohammad Abdullah). Their rules are in *iBrella_VPS_Developer_Deployment_Guide.pdf*;
what has to be received from the client before going live is in
[KAN-255_VPS_Domain_Handover_Checklist.md](KAN-255_VPS_Domain_Handover_Checklist.md). This guide is
the technical part: how our stack runs there. The team test server on AWS is in [DEPLOY.md](DEPLOY.md).

## The three sites

The server runs three copies of the same stack, one per workspace. They share only Traefik: each has
its own containers, database, photos and secrets.

| Site | Workspace (`PROJECT`) | Address | Deployed (`DEPLOY_MODE`) |
| --- | --- | --- | --- |
| Staging | `/var/www/apps/shahebbazar` | staging.shahebbazar.com | `main`, by GitHub after each merge (`main`) |
| Test site | `/var/www/apps/shahebbazar-test` | test.shahebbazar.com | any branch, by GitHub from Run workflow (`branches`) |
| Live site | `/var/www/apps/shahebbazar-prod` | shahebbazar.com and its www | `main`, **by hand on the server only** (`manual`) |

The client asked that the live site is never deployed from GitHub. `deploy/client/deploy.sh` refuses
to deploy it over SSH, and there is no key or job for it.

## How it differs from the AWS test server

| Their server | What we do |
| --- | --- |
| Their **Traefik** serves HTTPS for every project and routes by container labels. No host ports. | No Caddy. `deploy/client/docker-compose.yml` labels the website, API and test inbox: `/api` and `/uploads` go to the API, `/mail` to the test inbox, the rest to the website. |
| Public containers join the shared network `traefik_public`; private traffic uses `net_<project>`. Both are created by their administrators. | Each site's database is on its own `net_<PROJECT>` only. Containers, routers and middlewares are all named `<PROJECT>-…` (`shahebbazar-api`, `shahebbazar-prod-api`) and reach each other by those names, because a plain `api` could be another project's or another site's container on the shared network. |
| Every service declares **resource limits**. | 0.5 CPU and 512 MB each for the website, API and database; 0.25 CPU and 128 MB for the test inbox. They use well under that. |
| Developers have **no Docker access**: only `sudo project-ctl build/up/restart/status/logs <workspace>`, for workspaces whose group they're in. | Nobody can run `load-db` or `psql` in the containers, so the API sets up its own database on start (`DB_AUTO_SETUP=true`, `backend/lib/setupDatabase.js`): an empty database gets the baseline schema and demo data, and every start applies migrations not yet recorded in `schema_migrations`. |
| A shared **MySQL** database (`global-db`). | Shahebbazar is PostgreSQL, so it runs its own PostgreSQL 16 container on the private network. **Needs Mohammad's agreement** (asked). |
| `project-ctl` runs the workspace's `docker-compose.yml`. | The repository is cloned into `app/` inside the workspace, and a short `docker-compose.yml` beside it includes the real file from the clone, so updating the clone updates it. |

A workspace on the server:

```
/var/www/apps/shahebbazar-test/
├── docker-compose.yml   # copied once from app/deploy/client/workspace-compose.yml
├── .env                 # the settings and secrets (chmod 600), from app/deploy/client/.env.example
└── app/                 # the repository
```

## Before the first deploy

Set up by the server's root user (done on 29 October for all three sites):

- [x] Your account exists and `ssh <username>@145.223.23.210` works.
- [x] The workspaces exist, owned by `root:shahebbazardevs` with mode `2770`.
- [x] `traefik_public`, `net_shahebbazar`, `net_shahebbazar-test` and `net_shahebbazar-prod` exist.
- [x] DNS in Cloudflare, **DNS only** (Traefik's certificates need a direct connection): `staging`,
  `@` and `www` (a CNAME to `shahebbazar.com`) point at 145.223.23.210.
- [ ] `test` points at 145.223.23.210. It points at the AWS test server until the test site is up.
- [ ] PostgreSQL in our own containers is agreed with Mohammad.

`project-ctl` needs nothing new for a site: it lets you run it for any workspace whose group you're in.

## First deploy

For the test site (the live site: see [Going live](#going-live-on-this-server) first):

```bash
ssh <username>@145.223.23.210
cd /var/www/apps/shahebbazar-test

git clone https://github.com/shahebbazar/shahebbazar-web.git app
cp app/deploy/client/workspace-compose.yml docker-compose.yml
cp app/deploy/client/.env.example .env
chmod 600 .env
nano .env
```

In `.env`:

- `PROJECT`: the workspace's name, `shahebbazar-test`. Staging leaves it out.
- `DEPLOY_MODE`: `branches` for the test site, `manual` for the live site. Staging leaves it out.
- `SITE_HOST`: the site's address, without `https://`.
- `PGPASSWORD`, `OTP_HASH_SECRET`, `UNSUBSCRIBE_SECRET`, `ANALYTICS_SALT`, `MAIL_UI_PASSWORD`: a
  different random value each, from `openssl rand -hex 32`. Never the same as another site's.
- `DEMO_LOGIN_CODE`: six digits, from `shuf -i 100000-999999 -n 1`. Until SMS works, every sign-in
  code is this code, and **anyone who knows it can sign in to any account, including admin**. Share it
  only with the team and the client.

Then build and start:

```bash
sudo project-ctl build shahebbazar-test      # first build takes a few minutes
sudo project-ctl up shahebbazar-test
sudo project-ctl status shahebbazar-test     # four containers, the database "healthy"
sudo project-ctl logs shahebbazar-test
```

On the first start, the API's log shows `Database setup: applied baseline/schema.sql`, `…seed.sql`,
`copied 19 seed images`, then `API running`. Later starts skip straight to `API running`.

**Check:**

- `https://<SITE_HOST>/api/health` shows `"ok":true`.
- The home page shows businesses and photos, with the **Test site** strip at the top.
- Log in as the demo business owner (01711-000005) with the demo code, send a campaign, and see it at
  `https://<SITE_HOST>/mail` (user `team` and `MAIL_UI_PASSWORD`).

## Updating

Staging and the test site update from GitHub (below). By hand, on the server, for any of the three:

```bash
sh /var/www/apps/<workspace>/app/deploy/client/deploy.sh            # the latest main
sh /var/www/apps/<workspace>/app/deploy/client/deploy.sh <commit>   # that commit
```

It fetches from GitHub, checks the commit is one the site takes (`DEPLOY_MODE`), checks it out,
rebuilds with `project-ctl` while the old containers keep serving, restarts, and waits for
`https://<SITE_HOST>/api/health` to answer. `sudo project-ctl logs <workspace>` shows what happened.

New files in `database/migrations/` are applied by the API as it starts, each once; the log lists them
(`Database setup: applied migration …`). If one fails, the API doesn't start and the log shows why:
fix it in a new pull request, merge, and update again.

**Rolling back:** run `deploy.sh` with the commit to go back to. By hand it deploys an older commit;
only GitHub's staging deploys skip one, so two quick merges can't arrive out of order. Migrations
aren't undone, so a rollback across a migration needs the database restored from a backup.

## Automatic deploys

GitHub reaches the server over SSH with one key per site, each of which the server lets run that
site's `deploy/client/deploy.sh` and nothing else, under a team member's account (until there's a
separate deploy user). The commit to deploy is the command GitHub sends.

| Site | GitHub job | Runs | Environment and secrets |
| --- | --- | --- | --- |
| Staging | Deploy to staging | once every check passes on `main` | `staging`: `STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY`, `STAGING_KNOWN_HOSTS` |
| Test site | Deploy to the test site | **Actions → CI → Run workflow** on a branch, with **test site** | `test-site`: `TEST_SITE_HOST`, `TEST_SITE_USER`, `TEST_SITE_SSH_KEY`, `TEST_SITE_KNOWN_HOSTS` |

Set up once per site (the test site shown; staging's key is set up already):

1. On your own computer, make a key just for this, pressing Enter twice for no passphrase:
   `ssh-keygen -t ed25519 -C "github-deploy-test-site" -f test_site_deploy`
   (On Windows PowerShell, `-N ""` doesn't work: PowerShell drops the empty value.)
2. On the server, add the public half to your `~/.ssh/authorized_keys` as **one line**, starting with
   the restriction, which names that site's workspace:

   ```text
   command="sh /var/www/apps/shahebbazar-test/app/deploy/client/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... github-deploy-test-site
   ```

3. On GitHub: **Settings → Environments → New environment** `test-site`, then add these environment
   secrets:
   - `TEST_SITE_HOST`: `145.223.23.210`
   - `TEST_SITE_USER`: the account from step 2
   - `TEST_SITE_SSH_KEY`: the private half (`test_site_deploy`, the file without `.pub`), pasted whole
   - `TEST_SITE_KNOWN_HOSTS`: the output of `ssh-keyscan 145.223.23.210`, run on the server (Windows'
     version can't negotiate with it)
4. Delete `test_site_deploy` and `test_site_deploy.pub` from your computer.

Until the secrets are set, the job notes that and passes. Each job ends by checking the site from
outside, as a visitor (`deploy/client/check-site.sh`): `/api/health`, the home page, the login page
and a business page.

The live site has no key and no job, and its `DEPLOY_MODE=manual` makes `deploy.sh` refuse to run over
SSH, so even a key pointed at it by mistake can't deploy it.

## What `project-ctl` can't do

Without Docker access these need Mohammad, or a change to how we run:

- **Reset the demo data.** A site's data lives in its `<PROJECT>_pgdata` volume (staging's is
  `shahebbazar_pgdata`); resetting means removing it, which only an administrator can do. Afterwards
  the API loads fresh demo data on its next start.
- **Backups.** `deploy/backup.sh` uses `docker compose exec`, so it can't run here. The live site's
  `shahebbazar-prod_pgdata` and `shahebbazar-prod_uploads` need a nightly backup run by root.
- **Looking inside the database.** Use the admin pages, or ask Mohammad.

## Going live on this server

The same stack in `/var/www/apps/shahebbazar-prod`, set up as in [First deploy](#first-deploy) and
then deployed with `deploy.sh` by hand, with these changes in its `.env`:

- `PROJECT=shahebbazar-prod` and `DEPLOY_MODE=manual`.
- `SITE_HOST=shahebbazar.com` and `WWW_HOST=www.shahebbazar.com`, which sends visitors on to
  shahebbazar.com.
- `TEST_BUILD=false` and `ROBOTS_HEADER=` (empty): no Test site strip, and search engines may index it.
- `DEMO_LOGIN_CODE=` (empty), once sign-in codes are sent by SMS.
- `SMS_PROVIDER=bulksmsbd`, `SMS_API_KEY` (from the BulkSMSBD panel) and `SMS_SENDER_ID=8809617634406`.
  If every code fails with BulkSMSBD code 1032 in the API log, whitelist the server's IP
  (145.223.23.210) in the BulkSMSBD panel. Codes are in Bangla for anyone using the site in Bangla or
  preferring it in My details, English otherwise.
- `SMTP_*` for the client's Hostinger mailbox, so campaign emails are delivered (checked on staging,
  27 October: delivered to a Gmail inbox, not spam, with SPF and DKIM passing for shahebbazar.com):

  ```text
  SMTP_HOST=smtp.hostinger.com
  SMTP_PORT=465
  SMTP_SECURE=true
  SMTP_USER=offers@shahebbazar.com
  SMTP_PASS='<the mailbox password>'
  MARKETING_EMAIL_FROM=offers@shahebbazar.com
  ```

  The domain's MX, SPF (`include:_spf.mail.hostinger.com`), DKIM (`hostingermail-a/b/c._domainkey`)
  and DMARC records are in Cloudflare, **DNS only**. Staging keeps these lines commented out, so its
  campaigns go to the test inbox; set them there only for a one-off delivery test to your own address.
- **The data.** An empty database is loaded with the demo data today, demo accounts included. The live
  site needs a reference-only seed (locations and categories) before its first start.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `404 page not found` in plain text | Traefik has no route for the address: check `SITE_HOST` in `.env` matches the address and DNS points at the server, then `project-ctl up` again. |
| `network net_… declared as external, but could not be found` | The site's private network is missing, or `PROJECT` in `.env` doesn't match the workspace's name. Root creates it with `docker network create net_<PROJECT>`. |
| A site shows another site's data, or `project-ctl up` replaces another site's containers | `PROJECT` is missing or wrong in that workspace's `.env`, so it took staging's default name. |
| `502 Bad Gateway` | A container isn't answering on its port (website 3000, API 4000, inbox 8025). `project-ctl status` and `logs`. |
| The API restarts over and over | Usually `Database setup failed` or a missing setting in the log: every required `.env` value must be set. |
| HTTPS certificate warning on the first visit | Traefik is still getting the certificate from Let's Encrypt; wait a minute. It needs DNS pointing at the server first. |
