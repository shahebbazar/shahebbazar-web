#!/bin/sh
# Deploys a commit to one of the sites on the client's server (docs/DEPLOY-CLIENT.md): the site whose
# workspace holds this clone, for example /var/www/apps/shahebbazar-test/app.
#   sh /var/www/apps/<site>/app/deploy/client/deploy.sh            the latest main
#   sh /var/www/apps/<site>/app/deploy/client/deploy.sh <commit>   that commit
#
# DEPLOY_MODE in the workspace's .env says what the site takes:
#   main     (staging, the default)  commits of main; GitHub Actions runs it over SSH once CI passes
#   branches (the test site)         a commit of any branch, from Run workflow
#   manual   (the live site)         commits of main, by hand on the server only: never from GitHub
# GitHub reaches it with a key that can run nothing but this script, one key per site.
#
# Their rules: no Docker access, only `sudo project-ctl`. So it updates the code, rebuilds with
# project-ctl while the old containers keep serving, restarts, and checks the site answers. The API
# applies any new migrations itself as it starts (DB_AUTO_SETUP). Everything runs inside main(), so
# the shell has read the whole script before git updates this file.
set -eu

main() {
    app="$(cd "$(dirname "$0")/../.." && pwd)"
    workspace="$(dirname "$app")"
    # project-ctl knows a site by its workspace's name.
    project="$(basename "$workspace")"
    mode=$(sed -n 's/^DEPLOY_MODE=//p' "$workspace/.env")
    mode=${mode:-main}
    cd "$app"

    # Over SSH, the commit is the command GitHub sent.
    over_ssh=${SSH_ORIGINAL_COMMAND:+yes}
    if [ "$mode" = manual ] && [ -n "$over_ssh" ]; then
        echo "$project is deployed by hand on the server only." >&2
        exit 1
    fi
    target=${1:-${SSH_ORIGINAL_COMMAND:-}}
    git fetch --quiet --prune origin
    [ -n "$target" ] || target=$(git rev-parse origin/main)
    case $target in
        *[!0-9a-f]*) echo "Not a commit id: $target" >&2; exit 1 ;;
    esac
    asked=$target
    target=$(git rev-parse --verify --quiet "$asked^{commit}") || { echo "Unknown commit: $asked" >&2; exit 1; }
    case $mode in
        main|manual)
            if ! git merge-base --is-ancestor "$target" origin/main; then
                echo "$target isn't on main, so it isn't deployed to $project." >&2
                exit 1
            fi ;;
        branches)
            if [ -z "$(git branch -r --contains "$target")" ]; then
                echo "$target isn't on any branch on GitHub." >&2
                exit 1
            fi ;;
        *) echo "DEPLOY_MODE=$mode in $workspace/.env isn't main, branches or manual." >&2; exit 1 ;;
    esac
    # Two merges in quick succession can reach staging out of order. By hand, going back is a rollback.
    current=$(git rev-parse HEAD)
    if [ "$mode" = main ] && [ -n "$over_ssh" ] && [ "$target" != "$current" ] &&
        git merge-base --is-ancestor "$target" "$current"; then
        echo "$project already runs a newer commit, $(git log -1 --format='%h %s'). Nothing to do."
        exit 0
    fi
    git checkout --quiet --detach "$target"
    echo "Deploying $(git log -1 --format='%h %s') to $project"

    sudo -n project-ctl build "$project"
    sudo -n project-ctl up "$project"

    # The site as a visitor reaches it, through their Traefik.
    host=$(sed -n 's/^SITE_HOST=//p' "$workspace/.env")
    tries=0
    until curl -fsS -o /dev/null "https://$host/api/health"; do
        tries=$((tries + 1))
        if [ "$tries" -ge 24 ]; then
            echo "https://$host/api/health didn't answer within 2 minutes. sudo project-ctl logs $project shows why." >&2
            exit 1
        fi
        sleep 5
    done
    echo "Deployed: https://$host is up."
}

main "$@"
