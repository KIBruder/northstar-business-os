# Northstar central storage rollout

## Decision
Use Cloudflare D1 as the canonical database, with the existing Cloudflare Worker as the only data API. GitHub Pages remains a static client. Browser IndexedDB remains a local cache/offline queue, not the source of truth.

## Data model
The migration in `migrations/0001_northstar_core.sql` creates tenant-scoped tables for workspaces, products, posts, activities, agent tasks, finance transactions, and settings. Each record retains its current application payload as validated JSON while indexing owner, workspace, timestamps, and soft deletion. This avoids a destructive schema rewrite of existing app records.

## Security requirements (must be completed before enabling sync)
- Protect the Worker data API with Cloudflare Access.
- Validate the Cloudflare Access JWT signature, issuer, audience, expiry, and subject in the Worker. Derive `owner_sub` only from the verified JWT; never accept it from the browser request body.
- Do not reuse or expose `NORTHSTAR_ACCESS_TOKEN` as a general database credential.
- Enforce owner and workspace scoping in every SQL statement.
- Use soft deletes and updated-at conflict checks; never silently overwrite newer server records.
- Restrict CORS to the published Northstar origin and use credentials only for the Access-protected API flow.

## Required Cloudflare setup
1. Create a D1 database named `northstar-production`.
2. Apply `migrations/0001_northstar_core.sql` to that database.
3. Add a D1 binding named `DB` to the `northstar-image-generator` Worker and set its database ID.
4. Create a Cloudflare Access self-hosted application for `northstar-image-generator.kibruder.workers.dev`, allowing only the owner's login identity.
5. Configure the Worker with the Access team issuer/domain and application audience tag. Do not place these values in public source.
6. Deploy the Worker and verify unauthenticated requests are rejected and the authenticated owner can only read/write their own rows.

## Cutover policy
- Do not import browser-local test products or test posts.
- Do not delete IndexedDB or local browser data during rollout.
- Enable cloud sync only after authenticated API tests, backup/restore tests, conflict handling, and cross-browser verification pass.
- On first login, initialize a clean cloud workspace. Local browser records remain isolated until the user explicitly chooses to import selected records.
