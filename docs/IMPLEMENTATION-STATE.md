# Northstar – Implementation State

Last checked: 2026-11-26

## Deployed data foundation
Cloudflare D1 database `northstar-production` contains the existing PWA sync tables plus these commerce domains:

- `awin_catalog_products`: raw Awin product-feed records.
- `commerce_channels`: channel/account registry.
- `supplier_programmes`: advertiser and supplier pipeline.
- `commerce_offers`: normalized offers shared by affiliate and shop.
- `approval_requests`: human approval queue.
- `commerce_orders`, `commerce_order_items`: owned-store order and item ledger.
- `campaign_performance`: attributed campaign results.
- `catalog_import_jobs`: durable feed-import job state and counts.
- `supplier_evidence`: source URLs, verification evidence and confidence.
- `offer_evaluations`: versioned product scores and reasons.

The new tables have been created and existence checked against D1. This does not mean that product rows or order rows have been imported.

## Integration facts
- Awin Publisher API connection was previously verified for publisher Ai.Boxx (2069027). It currently shows one joined advertiser, Steuertipps DE.
- Awin Data Feed key is configured as a Worker secret; the app successfully retrieved a feed list with 563 feeds. The previous eight-feed import attempt stored zero products and returned invalid feed ID errors. Treat import as blocked until a corrected run and D1 row count confirm success.
- The connected Shopify store is in Germany and uses EUR, but the Shopify connector reports a trial plan. It is not ready for live selling until upgraded and configured.
- The Awin connector returned an account-disabled error during the 2026-11-26 follow-up. Do not treat advertiser application or programme-term retrieval as currently available through that connector.

## Next engineering work
1. Correct Awin feed selection/import end-to-end; normalize the real CSV headers; persist job status; verify row counts, advertiser coverage and sample rows.
2. Populate supplier_programmes from verified programme discovery and store programme terms with retrieval timestamps.
3. Add a worker API for scoring, approval requests, offer normalization and supplier evidence.
4. Add UI screens for channel status, partner pipeline, supplier pipeline, offers, approval queue, order monitoring and contribution margin.
5. Connect Shopify catalog/order APIs after plan and store readiness are confirmed.
6. Add supported supplier fulfilment integrations only after supplier contracts, delivery SLAs, returns and product compliance are validated.

## Autonomy policy
Research, classification, drafts, data sync and reporting may be automated. Submitting partner applications, publishing listings, spending money, changing customer prices outside approved limits, purchasing supplier stock, refunds and legally binding customer commitments require explicit approval until reliable end-to-end controls are tested.
