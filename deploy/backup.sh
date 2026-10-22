#!/bin/sh
# Backs up the database and the uploaded photos together, into deploy/backups/<date>/, and keeps the
# last 7 days. Run nightly from cron (docs/DEPLOY.md):
#   15 3 * * * /home/ubuntu/shahebbazar-web/deploy/backup.sh >> /home/ubuntu/backup.log 2>&1
set -eu

cd "$(dirname "$0")"
compose="docker compose -f docker-compose.yml"
day=$(date +%Y-%m-%d)
out="backups/$day"
mkdir -p "$out"

# The database, as SQL that psql can load back.
$compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "$out/database.sql.gz"

# The uploads volume, read through the API container.
$compose exec -T api tar -czf - -C /data uploads > "$out/uploads.tar.gz"

# Keep a week.
find backups -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +

echo "$(date -Iseconds) backup saved to $out"
