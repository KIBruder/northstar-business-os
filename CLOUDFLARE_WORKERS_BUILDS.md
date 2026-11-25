# Cloudflare Workers Builds – Northstar

This connects the existing Worker to this repository so commits to `main` deploy automatically.

## Connect the existing Worker

1. Open the Cloudflare dashboard: https://dash.cloudflare.com/
2. Go to **Workers & Pages** and open the existing Worker **northstar-image-generator**.
3. Open **Settings → Builds** and select **Connect**.
4. Authorize the Cloudflare GitHub App for the GitHub account that owns this repository.
5. Select repository **KIBruder/northstar-business-os** and branch **main**.
6. Set **Root directory** to `cloudflare-worker`.
7. Leave **Build command** empty.
8. Set **Deploy command** to `npx wrangler deploy`.
9. Keep the Worker name as `northstar-image-generator` (it must match `cloudflare-worker/wrangler.toml`).
10. Save the configuration.

Cloudflare Workers Builds can create its own deployment API token during setup. Do not paste API tokens or runtime secrets into GitHub or this document.

## Runtime settings that must remain on the Worker

The existing production Worker uses these settings/bindings from `cloudflare-worker/wrangler.toml`:
- Workers AI binding: `AI`
- D1 binding: `db`, database `northstar-production`
- Variable: `ALLOWED_ORIGIN`

Runtime secrets must remain configured in **Worker → Settings → Variables and Secrets**. In particular:
- `AWIN_API_TOKEN`
- `NORTHSTAR_AUTH_SECRET`
- `NORTHSTAR_ACCESS_TOKEN` (if used by the legacy image endpoints)

Do not delete or replace existing secrets when connecting the repository. Confirm the production environment is selected.

## Verify

After saving, a new commit to `main` should trigger a build. Check the build result in the Worker’s **Deployments** or **Builds** view. The deployed Worker version should contain the latest code from the repository.

Cloudflare's official guide: https://developers.cloudflare.com/workers/ci-cd/builds/
