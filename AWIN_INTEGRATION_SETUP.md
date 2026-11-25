# Awin integration setup

Northstar's Awin integration is server-side. Secrets are never returned to the browser.

## Existing read-only connection test

- `GET /api/awin/publishers` checks the authenticated Awin publisher account.
- Requires an authenticated Northstar session in `Authorization: Bearer <Northstar session>`.
- Reads the Awin Personal Access Token only from Cloudflare Worker secret `AWIN_API_TOKEN`.

## Product feed snapshot import

The product feed download uses a separate feed URL/key, not the Awin Personal Access Token.

- `POST /api/awin/catalog/refresh` downloads the configured feed and streams the compressed file into private Cloudflare R2.
- `GET /api/awin/catalog/status` reports whether a snapshot exists and its size/timestamp.
- Both endpoints require an authenticated Northstar session.
- R2 object key: `awin/catalog/latest.csv.gz`.
- The import does not yet parse, index, rank, or publish individual products. Those are separate stages and must not be represented as completed until implemented and tested.

## One-time Cloudflare setup

1. In Cloudflare R2, create a **private** bucket named `northstar-awin-catalog`.
2. In Workers & Pages, open Worker `northstar-image-generator` and add these secrets under Settings → Variables and Secrets:
   - `AWIN_API_TOKEN`: Awin Personal Access Token.
   - `AWIN_PRODUCT_FEED_URL`: complete HTTPS download URL copied from the newly generated Awin product feed.
3. Keep both values as **Secrets**, not plain variables. Never put them in GitHub, source code, browser JavaScript, screenshots, or chat.
4. Deploy the Worker configuration from `cloudflare-worker/wrangler.toml`, including the R2 binding `AWIN_CATALOG` to bucket `northstar-awin-catalog`.

If an Awin feed URL/key has been exposed in a screenshot or shared message, revoke/regenerate that feed credential before saving the replacement. Do not send the replacement URL to ChatGPT.

## Triggering the import

From the authenticated Northstar app, call:

```http
POST /api/awin/catalog/refresh
Authorization: Bearer <Northstar session token>
```

Then check:

```http
GET /api/awin/catalog/status
Authorization: Bearer <Northstar session token>
```

The refresh streams the compressed feed directly to R2 rather than buffering the full file in Worker memory. The current implementation stores one latest snapshot; it does not yet provide incremental product indexing, scheduled refresh, product ranking, or storefront publication.

## Awin documentation

- https://help.awin.com/apidocs/api-authentication
- https://help.awin.com/developers/docs/downloading-a-list-of-your-product-feeds
