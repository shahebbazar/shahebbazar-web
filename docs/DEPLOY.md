# Deploying Shahebbazar to a server

The whole site runs on one Linux server with Docker Compose (`deploy/docker-compose.yml`):

| Container | What it does |
| --- | --- |
| `caddy` | The only part reachable from the internet (ports 80 and 443). Gets and renews the HTTPS certificate, compresses responses, sends `/api` and `/uploads` to the API and everything else to the website, and serves the test inbox at `/mail`. |
| `web` | The Next.js website (`frontend/shahebbazar/Dockerfile`). |
| `api` | The Express API (`backend/Dockerfile`). Uploaded photos are kept in the `uploads` volume. |
| `db` | PostgreSQL 16, in Dhaka time. No published port: only the API can reach it. |
| `mailpit` | The test inbox. Campaign emails land here instead of being delivered, until the client's email provider is set up. Password-protected. |

Because the browser reaches the site and the API through one address, sign-in cookies work without
any cross-site settings.

This guide sets up the **team test server** on AWS EC2. The same steps work on the client's server:
only `deploy/.env` changes (see [Moving to the client's server](#moving-to-the-clients-server)).

## 1. Create the server (AWS console)

1. **Budget first.** Billing → Budgets → *Create budget* → a monthly cost budget of, say, US$20 with
   an email alert. Credits cover the server, but the alert catches anything left running by mistake.
2. EC2 → choose a region near the users, for example **Asia Pacific (Singapore) ap-southeast-1**.
3. **Launch instance**:
   - Name: `shahebbazar-test`
   - Image: **Ubuntu Server 24.04 LTS** (64-bit x86)
   - Type: **t3.small** (2 GB memory). Building the website needs about 2 GB; step 2 adds swap.
   - Key pair: create one (`shahebbazar-test`, `.pem`) and keep the file safe. It is the only way in.
   - Network: create a security group allowing **SSH (22) from My IP**, and **HTTP (80)** and
     **HTTPS (443) from anywhere**.
   - Storage: **30 GB gp3**.
4. **Elastic IP**: EC2 → Elastic IPs → *Allocate*, then *Associate* it with the instance, so the
   address doesn't change when the server restarts. Note it, for example `13.55.1.2`.

The site's address is that IP with dashes plus `.sslip.io`, for example
`https://13-55-1-2.sslip.io`. sslip.io is a free DNS service that points such names at the IP, so
there is no domain to buy, and Caddy gets a real HTTPS certificate for it.

## 2. Prepare the server

Connect from your computer (PowerShell or Git Bash):

```bash
ssh -i path/to/shahebbazar-test.pem ubuntu@13.55.1.2
```

Then, on the server:

```bash
# Updates, and 2 GB of swap so the website build has room.
sudo apt-get update && sudo apt-get upgrade -y
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker and Docker Compose.
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit    # log out and back in so the docker group applies
```

## 3. Get the code

The repository is public, so clone it over HTTPS. No key or GitHub login is needed:

```bash
git clone https://github.com/shahebbazar/shahebbazar-web.git
cd shahebbazar-web
```

If the repository is ever made private, give the server a read-only **deploy key** instead:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

On GitHub: the repository → *Settings* → *Deploy keys* → *Add deploy key*, paste the key, leave
*Allow write access* off. (This needs a repository admin.) Then:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github_deploy\n' >> ~/.ssh/config
git clone git@github.com:shahebbazar/shahebbazar-web.git
cd shahebbazar-web
```

## 4. Settings

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```

- `SITE_ADDRESS` and `SITE_URL`: from your Elastic IP, for example `13-55-1-2.sslip.io` and
  `https://13-55-1-2.sslip.io`.
- `PGPASSWORD`, `OTP_HASH_SECRET`, `UNSUBSCRIBE_SECRET`, `ANALYTICS_SALT`, `MAIL_UI_PASSWORD`: a
  different random value each. Make one with `openssl rand -hex 32`.
- `DEMO_LOGIN_CODE`: six digits, for example from `shuf -i 100000-999999 -n 1`. There is no SMS yet,
  so every sign-in code is this code. **Anyone who knows it can sign in to any account, including
  admin**, so share it only with the team and the people at the demo. Empty it once SMS works.

`deploy/.env` holds secrets and is never committed.

## 5. Start it

```bash
docker compose -f deploy/docker-compose.yml up -d --build      # first build takes about 5 minutes
docker compose -f deploy/docker-compose.yml exec api node scripts/load-db.js --yes
```

The second command creates the tables, loads the demo data and copies the seed photos. Then open
`https://13-55-1-2.sslip.io` (your address). The first visit can take a few seconds while Caddy gets
the certificate.

**Check:**

- `https://<address>/api/health` shows `"ok":true`.
- The home page shows businesses and photos, with the **Test site** strip at the top.
- Log in as the demo business owner (01711-000005) with the demo code, send a campaign, and see the
  emails at `https://<address>/mail` (user `team` and `MAIL_UI_PASSWORD`).

## 6. Automatic deploys from GitHub

Once set up, every merge into `main` updates the server by itself. After the API tests, frontend
checks and browser tests pass on `main`, the **Deploy to the test server** job in
`.github/workflows/ci.yml` connects over SSH and runs `deploy/deploy.sh`, which:

1. updates the code to the commit that passed (never an older one, never one that isn't on `main`);
2. builds the new images while the old containers keep serving;
3. if the update adds or changes files in `database/migrations/`, backs up and applies them;
4. restarts what changed and checks the site answers, failing the job (and emailing whoever merged)
   if it doesn't.

The key GitHub uses can run nothing but that script. Setup, once:

1. **Let GitHub reach SSH.** GitHub's machines have changing addresses, so in EC2 → Security Groups
   → the server's group → *Edit inbound rules*, set the SSH rule's source to **Anywhere-IPv4**. The
   server only accepts keys, never passwords.
2. **Make the deploy key**, on the server:

   ```bash
   ssh-keygen -t ed25519 -f ~/github-deploy -N "" -C github-actions-deploy
   echo "command=\"sh /home/ubuntu/shahebbazar-web/deploy/deploy.sh\",restrict $(cat ~/github-deploy.pub)" >> ~/.ssh/authorized_keys
   base64 -w0 ~/github-deploy; echo                      # the private key as one line, for DEPLOY_SSH_KEY
   echo "$(curl -s https://checkip.amazonaws.com) $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"   # for DEPLOY_KNOWN_HOSTS
   ```

3. **On GitHub** (needs a repository admin): *Settings* → *Environments* → *New environment*
   `test-server`. Under *Deployment branches and tags*, choose *Selected branches* and add `main`.
   Then add:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Secret | `DEPLOY_HOST` | The Elastic IP, for example `13.55.1.2` |
   | Secret | `DEPLOY_SSH_KEY` | The one long line from `base64 -w0` (the key pasted as is, `BEGIN` to `END`, also works) |
   | Secret | `DEPLOY_KNOWN_HOSTS` | The line from the last command, so GitHub knows it reached the real server |
   | Variable | `TEST_SERVER_URL` | `https://13-55-1-2.sslip.io` (shown as the deployment link) |

4. **Remove the private key from the server:** `rm ~/github-deploy` (GitHub has it now).
5. **Try it:** *Actions* → *CI* → *Run workflow* on `main`. The checks run, then the deploy; its log
   shows the build and ends with "Deployed … and the site is answering".

Until the secrets are set, the deploy job only notes that and passes. To undo a bad change, revert
its pull request: the revert deploys like any other merge. To stop automatic deploys, delete the
`DEPLOY_HOST` secret.

## Everyday use

All commands run from `~/shahebbazar-web` on the server.

| Task | Command |
| --- | --- |
| Deploy the latest `main` | Automatic after each merge (step 6). By hand: `sh deploy/deploy.sh` |
| See what's running | `docker compose -f deploy/docker-compose.yml ps` |
| Follow the API's log | `docker compose -f deploy/docker-compose.yml logs -f api` |
| Restart everything | `docker compose -f deploy/docker-compose.yml restart` |
| Reset the demo data (deletes everything) | `docker compose -f deploy/docker-compose.yml exec api node scripts/load-db.js --reset --yes` |
| Apply a migration by hand (deploys apply new ones) | `docker compose -f deploy/docker-compose.yml exec -T db psql -U postgres -d shahebbazar < database/migrations/<file>.sql` |
| Stop it (keeps the data) | `docker compose -f deploy/docker-compose.yml down` |

## Backups

`deploy/backup.sh` saves the database and the uploaded photos together, into
`deploy/backups/<date>/`, and keeps a week. Run it nightly:

```bash
chmod +x deploy/backup.sh
crontab -e
# add:
15 3 * * * /home/ubuntu/shahebbazar-web/deploy/backup.sh >> /home/ubuntu/backup.log 2>&1
```

To keep a copy off the server, download a backup now and then:
`scp -i shahebbazar-test.pem -r ubuntu@13.55.1.2:shahebbazar-web/deploy/backups ./`.

Restore, if needed (this replaces the current data):

```bash
gzip -dc deploy/backups/<date>/database.sql.gz | docker compose -f deploy/docker-compose.yml exec -T db psql -U postgres -d shahebbazar
docker compose -f deploy/docker-compose.yml exec -T api tar -xzf - -C /data < deploy/backups/<date>/uploads.tar.gz
```

Restore into an empty database: reset the schema first, or restore onto a fresh server.

## Costs and switching off

A t3.small with 30 GB of storage and an Elastic IP comes to roughly US$20–25 a month, which the
credits cover. When the test server is no longer needed:

- **Stop** the instance to pause compute charges (storage and the Elastic IP still cost a little).
- **Terminate** it and **release** the Elastic IP to stop all charges. Download a backup first.

## Moving to the client's server

The client's server (Identity Umbrella) runs its own Traefik and gives developers no Docker access, so
it has its own compose file and guide: [DEPLOY-CLIENT.md](DEPLOY-CLIENT.md).

For a server like this one instead (a plain Linux server with Docker), the same steps work with these
settings in `deploy/.env`:

- `SITE_ADDRESS` / `SITE_URL`: the real domain, for example `shahebbazar.com` and
  `https://shahebbazar.com`, with its DNS A record pointing at the server.
- `TEST_BUILD=false`: removes the Test site strip and lets search engines index it. Also remove the
  `X-Robots-Tag` line from `deploy/Caddyfile`.
- `DEMO_LOGIN_CODE` empty, once sign-in codes are sent by SMS.
- `SMTP_*`: the client's email provider, so campaign emails are delivered instead of caught.
- Load the live data rather than the demo data: the seed is demo data today, so the live site needs
  a reference-only seed (locations and categories) first.

## Security notes

- Only ports 22, 80 and 443 are open. SSH is key-only: from your IP only, or from anywhere once
  automatic deploys are on (step 6), where GitHub's key can only run `deploy/deploy.sh`. Without
  automatic deploys, if your IP changes, update the security group.
- The database is not reachable from outside the server.
- Uploads are checked by type and size in the API; Caddy also limits requests to 50 MB.
- Secrets live only in `deploy/.env` on the server, and the deploy key only in the GitHub
  environment `test-server`, which only `main` can use.
