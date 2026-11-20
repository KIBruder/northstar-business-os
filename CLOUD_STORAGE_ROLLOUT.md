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

## Worker API implementation
The Worker exposes `GET /api/sync?workspaceId=<id>` and `POST /api/sync` after the D1 binding and Cloudflare Access JWT settings are configured. The endpoint validates the RS256 Access assertion against the configured issuer, audience, expiry, and JWKS key, then derives the tenant key from the verified `sub` claim. The browser cannot choose or override the tenant identity.

- `GET` returns only live records belonging to the verified subject and requested workspace.
- `POST` accepts up to 500 records per batch, verifies workspace ownership, validates JSON payload size, and performs tenant-keyed upserts.
- The endpoint is deliberately unavailable until `DB`, `ACCESS_TEAM_DOMAIN`, and `ACCESS_AUD` are configured.
- No browser client sync is enabled in this phase. The local IndexedDB remains the active app data store until the login flow and cross-origin Access session are proven on iOS Safari and desktop browsers.

## Deploy commands (after creating D1)
Run from `cloudflare-worker/` in a trusted local terminal with Wrangler authenticated:
```sh
npx wrangler d1 create northstar-production
# Add the returned database_id to wrangler.toml under [[d1_databases]] with binding = "DB".
npx wrangler d1 migrations apply northstar-production --remote
npx wrangler secret put ACCESS_AUD
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler deploy
```
Set `ACCESS_AUD` to the Access application's audience tag. Set `ACCESS_TEAM_DOMAIN` to the exact Cloudflare Access team issuer origin, for example `https://<team-name>.cloudflareaccess.com` (no trailing slash). Configure the Access application to protect the Worker hostname and permit only the intended owner account. Do not paste secret values into GitHub, chat, or source files.

## Verification before client cutover
1. Anonymous GET/POST returns 401.
2. Authenticated owner can create and read a workspace.
3. A second identity cannot read or modify the first identity's rows.
4. A child record cannot be written into a workspace owned by another identity.
5. Invalid signature, wrong audience, expired token, and wrong issuer are rejected.
6. D1 backup/export and restore are tested.
7. Access cookies/session work from iOS Safari and desktop browser for the GitHub Pages origin.
