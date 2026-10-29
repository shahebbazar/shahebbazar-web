#!/bin/sh
# Checks a site on the client's server from outside, as a visitor (docs/DEPLOY-CLIENT.md). The deploy
# only checks /api/health from the server itself, so a site that starts but can't render pages would
# otherwise go unnoticed. The deploy jobs in .github/workflows/ci.yml run it after each deploy:
#   sh deploy/client/check-site.sh https://staging.shahebbazar.com
set -eu

site=${1:?Usage: check-site.sh https://<host>}
fail() { echo "::error::$1"; exit 1; }
get() { curl -fsS --retry 5 --retry-delay 5 --retry-all-errors --max-time 30 "$site$1"; }

get /api/health | jq -e '.ok == true' > /dev/null || fail "$site/api/health doesn't report ok."
# grep without -q reads to the end: -q stops at the first match, so curl's write fails
# ("Failure writing output") and --retry-all-errors downloads the page again.
get / | grep 'Shahebbazar' > /dev/null || fail "The home page didn't load."
get /login | grep 'Log in to Shahebbazar' > /dev/null || fail "The login page didn't load."
slug=$(get '/api/businesses?limit=1' | jq -r '.results[0].vendor_slug // empty')
[ -n "$slug" ] || fail "/api/businesses returned no businesses."
get "/business/$slug" > /dev/null || fail "The business page /business/$slug didn't load."
echo "$site answers: /api/health, /, /login and /business/$slug."
