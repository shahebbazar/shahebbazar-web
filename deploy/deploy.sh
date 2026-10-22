#!/bin/sh
# Deploys a commit of main to this server. GitHub Actions runs it over SSH once CI passes on main
# (the Deploy job in .github/workflows/ci.yml; set up in docs/DEPLOY.md). By hand:
#   sh deploy/deploy.sh            the latest main
#   sh deploy/deploy.sh <commit>   a commit of main
#
# Builds the new images while the old containers keep serving, backs up and applies any migrations
# the update adds or changes (they are safe to run more than once), restarts what changed, then
# checks the site answers. Everything runs inside main(), so the shell has read the whole script
# before git updates this file.
set -eu

main() {
    cd "$(dirname "$0")/.."
    compose="docker compose -f deploy/docker-compose.yml"

    # Over SSH, the commit is the command GitHub sent. The deploy key can run nothing but this script.
    target=${1:-${SSH_ORIGINAL_COMMAND:-}}
    git fetch --quiet origin main
    [ -n "$target" ] || target=$(git rev-parse origin/main)
    case $target in
        *[!0-9a-f]*) echo "Not a commit id: $target" >&2; exit 1 ;;
    esac
    asked=$target
    target=$(git rev-parse --verify --quiet "$asked^{commit}") || { echo "Unknown commit: $asked" >&2; exit 1; }
    if ! git merge-base --is-ancestor "$target" origin/main; then
        echo "$target isn't on main, so it isn't deployed." >&2
        exit 1
    fi

    # Migrations are worked out from the last deploy that finished, so a retry after a failed one
    # still applies them.
    current=$(git rev-parse HEAD)
    [ -f deploy/.deployed ] || echo "$current" > deploy/.deployed
    deployed=$(cat deploy/.deployed)
    if [ "$target" != "$current" ] && git merge-base --is-ancestor "$target" "$current"; then
        echo "The server already runs a newer commit, $(git log -1 --format='%h %s'). Nothing to do."
        exit 0
    fi
    git checkout --quiet main
    git merge --quiet --ff-only "$target"
    echo "Deploying $(git log -1 --format='%h %s')"

    $compose build

    migrations=$(git diff --name-only --diff-filter=AM "$deployed" "$target" -- database/migrations | sort)
    if [ -n "$migrations" ]; then
        sh deploy/backup.sh
        for file in $migrations; do
            echo "Applying $file"
            $compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$file"
        done
    fi

    $compose up -d --remove-orphans

    # The site through Caddy, as a visitor reaches it.
    host=$(sed -n 's/^SITE_ADDRESS=//p' deploy/.env)
    tries=0
    until curl -fsS -o /dev/null --resolve "$host:443:127.0.0.1" "https://$host/api/health" &&
          curl -fsS -o /dev/null --resolve "$host:443:127.0.0.1" "https://$host/"; do
        tries=$((tries + 1))
        if [ "$tries" -ge 30 ]; then
            echo "The site isn't answering after the update. See: $compose logs --tail 50" >&2
            exit 1
        fi
        sleep 2
    done

    # Old images and build cache, so the disk doesn't fill up over many deploys.
    docker image prune -f > /dev/null
    docker builder prune -f --filter until=168h > /dev/null

    echo "$target" > deploy/.deployed
    echo "Deployed $(git log -1 --format='%h') and the site is answering at https://$host"
}

main "$@"
exit
