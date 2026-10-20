## What and why

<!-- Jira key and one or two sentences, e.g. "KAN-283: admins can give a business a Marketing pass." -->

## How it was tested

<!-- Tests added or changed, and anything checked by hand in the browser. -->

## Checklist

- [ ] Branch is up to date with `main`, and the title starts with the Jira key
- [ ] `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` pass locally (CI runs them too)
- [ ] New API routes are in the access tests and use the access matrix (`backend/lib/access.js`)
- [ ] Schema changes have a file in `database/migrations/` **and** are in `database/baseline/`
- [ ] README or docs updated if setup, commands or behaviour changed
- [ ] No `.env` files, sign-in codes, tokens or uploaded photos committed
