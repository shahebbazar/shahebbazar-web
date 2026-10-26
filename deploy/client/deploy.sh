#!/bin/sh
# Deploys a commit of main to the staging site on the client's server (docs/DEPLOY-CLIENT.md).
# GitHub Actions runs it over SSH once CI passes on main (the "Deploy to staging" job in
# .github/workflows/ci.yml), with a key that can run nothing but this script. By hand, on the server:
#   sh /var/www/apps/shahebbazar/app/deploy/client/deploy.sh            the latest main
#   sh /var/www/apps/shahebbazar/app/deploy/client/deploy.sh <commit>   a commit of main
#
# Their rules: no Docker access, only `sudo project-ctl`. So it updates the code, rebuilds with
# project-ctl while the old containers keep serving, restarts, and checks the site answers. The API
# applies any new migrations itself as it starts (DB_AUTO_SETUP). Everything runs inside main(), so
# the shell has read the whole script before git updates this file.
set -eu

PROJECT=shahebbazar

main() {
    app="$(cd "$(dirname "$0")/../.." && pwd)"
    workspace="$(dirname "$app")"
    cd "$app"

    # Over SSH, the commit is the command GitHub sent.
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
    current=$(git rev-parse HEAD)
    if [ "$target" != "$current" ] && git merge-base --is-ancestor "$target" "$current"; then
        echo "Staging already runs a newer commit, $(git log -1 --format='%h %s'). Nothing to do."
        exit 0
    fi
    git checkout --quiet main
    git merge --quiet --ff-only "$target"
    echo "Deploying $(git log -1 --format='%h %s')"

    sudo -n project-ctl build "$PROJECT"
    sudo -n project-ctl up "$PROJECT"

    # The site as a visitor reaches it, through their Traefik.
    host=$(sed -n 's/^SITE_HOST=//p' "$workspace/.env")
    tries=0
    until curl -fsS -o /dev/null "https://$host/api/health"; do
        tries=$((tries + 1))
        if [ "$tries" -ge 24 ]; then
            echo "https://$host/api/health didn't answer within 2 minutes. sudo project-ctl logs $PROJECT shows why." >&2
            exit 1
        fi
        sleep 5
    done
    echo "Deployed: https://$host is up."
}

main "$@"
