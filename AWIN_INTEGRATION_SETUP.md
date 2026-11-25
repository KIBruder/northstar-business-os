# Awin integration setup

Northstar now includes a server-side Awin connection check endpoint:

- `GET /api/awin/publishers`
- Requires an authenticated Northstar session in `Authorization: Bearer <Northstar session>`.
- Reads the Awin Personal Access Token only from the Cloudflare Worker secret `AWIN_API_TOKEN`.
- Calls Awin's official `GET https://api.awin.com/publishers` endpoint.
- Never returns or logs the Awin token.

## One-time Cloudflare setup

From the Cloudflare dashboard, open Workers & Pages, select the Northstar Worker (currently configured as `northstar-image-generator`), then Settings → Variables and Secrets → Add → Secret.

Name: `AWIN_API_TOKEN`

Value: paste the Awin Personal Access Token. Save and deploy/redeploy the Worker if Cloudflare requests it.

Do not put the token in GitHub, source code, browser local storage, screenshots, chat messages, or a normal `[vars]` entry in wrangler.toml. If the token has ever been exposed, revoke it in Awin and create a replacement.

## Test

After setting the secret and deploying, call the endpoint from an authenticated Northstar session:

```http
GET /api/awin/publishers
Authorization: Bearer <Northstar session token>
```

A successful response has `ok: true`, `connected: true`, and the publisher account data returned by Awin. A 503 with `AWIN_API_TOKEN` missing means the Cloudflare secret is not configured. A 401 from Awin indicates an invalid, expired, or insufficiently authorized Awin token.

## Scope and limitations

This first integration is deliberately read-only. It verifies Awin authentication and retrieves publisher account identity. It does not create affiliate links, download product feeds, import products, or publish a storefront yet.

Awin product-feed downloads use a separate data-feed key, not the Publisher API token. The product-feed list/download workflow must be configured separately. See Awin's official documentation:
- https://help.awin.com/apidocs/api-authentication
- https://help.awin.com/developers/docs/downloading-a-list-of-your-product-feeds

Awin API calls must remain server-side. Do not expose the secret to client-side JavaScript.
