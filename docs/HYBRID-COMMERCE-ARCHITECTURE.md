# Northstar Hybrid Commerce Architecture

## Product decision
Northstar is one commerce operating system with two revenue engines:
1. Affiliate commerce: Awin, eBay Partner Network and Check24. The merchant remains seller of record and fulfils the order; Northstar earns the tracked commission.
2. Owned-store commerce: Shopify storefront plus approved suppliers and fulfilment. Northstar is responsible for storefront merchandising, customer journey, support workflows and contribution-margin monitoring. Supplier fulfilment is only activated after supplier, shipping, returns and product compliance are verified.

Both engines share a canonical offer/product record, scoring, content pipeline, campaign attribution and finance ledger.

## Current infrastructure (verified 2026-11-26)
- Frontend/PWA: GitHub Pages, https://kibruder.github.io/northstar-business-os/
- Repository: KIBruder/northstar-business-os
- API: Cloudflare Worker northstar-image-generator
- Database: Cloudflare D1 northstar-production
- Existing Awin publisher: Ai.Boxx (2069027); connected Awin API currently returns one joined programme, Steuertipps DE.
- Shopify connector currently sees store "Mein Shop 3", domain t0gviz-q4.myshopify.com, Germany, EUR, trial plan. Exact platform notice: "Plan: trial — you'll need to upgrade before you can start selling and unlock full features".
- Awin product-feed discovery is connected through the separate AWIN_DATAFEED_KEY secret. A feed list was retrieved, but the previous selected-feed import attempt failed because feed ID validation was faulty. Do not mark those products as imported until a successful D1 count verifies them.

## System topology
Browser PWA -> Cloudflare Worker API -> Cloudflare D1.
The Worker owns credentials and validates every action. The browser must never receive Awin, supplier, Shopify or signing secrets.
External connectors: Awin publisher API/datafeeds, eBay Partner Network (where authorised), Check24 (programme-specific access), Shopify Admin API/connector, supplier APIs or CSV feeds, social publishing APIs where available.

## Shared data domains
- commerce_channels: connected/planned networks and channels.
- supplier_programmes: advertiser/supplier discovery, terms, application status, commission details and review timestamps.
- awin_catalog_products: raw Awin catalogue source.
- commerce_offers: canonical normalized offers across affiliate and owned-shop sources.
- Existing products: workspace product records used by the current PWA.
- approval_requests: auditable approvals for applications, listing publication, pricing, orders, refunds and other sensitive actions.
- commerce_orders and commerce_order_items: Shopify order and cost/revenue ledger.
- campaign_performance: channel-level impressions, clicks, conversions, revenue, commission and spend.
- Existing agent_tasks, activities, posts, finance_transactions and settings: task queue, audit trail, content, finance and configuration.

All new business tables are scoped by owner_sub and workspace_id and reference the workspace.

## Agent responsibilities
1. Market Research Agent: discovers demand, competition, seasonality and category opportunities; records evidence and timestamp.
2. Partner & Supplier Agent: finds programmes/suppliers, scores fit, reads terms, drafts applications. It must not submit applications until the user approves the exact advertiser and application.
3. Product Intelligence Agent: normalizes feeds, validates product identifiers, checks stock/price freshness, computes landed cost and unit economics, and rejects poor data.
4. Merchandising Agent: chooses affiliate destination vs owned-shop candidate using margin, commission, fulfilment, return and compliance data.
5. Creative Agent: creates claims-safe copy, images and short-video briefs from verified product facts.
6. Publishing Agent: prepares channel-specific drafts and publishes only through supported, authorised integrations. Otherwise it creates a ready-to-post queue.
7. Sales & Finance Agent: imports orders and affiliate performance, reconciles commission, calculates contribution margin and flags anomalies.
8. Orchestrator: schedules jobs, handles retries/idempotency, sets budgets and moves work through approval gates.

## Product decision policy
A product is eligible for affiliate promotion only when the programme is joined/active, terms allow the intended channel, tracking link is valid and price/stock are fresh.
A product is eligible for owned-shop listing only when supplier identity, stock source, landed cost, delivery estimate, return address/process, warranty, product safety/compliance and image/content rights are documented.
Do not mix affiliate commission with shop gross margin. Report separate revenue streams and a combined net contribution view.
Do not invent commission rates, supplier costs, stock, delivery times or conversion data.

## Approval gates (mandatory)
- Partner applications: approval of advertiser, channel and prepared application text.
- Store listings: approval of supplier/product, retail price, shipping promise, return terms and claims.
- Pricing changes: auto-adjust only inside user-approved floor/ceiling and margin guardrails.
- Paid ads: explicit budget and campaign approval.
- Orders: supplier purchasing/fulfilment only after supplier API terms, customer order and payment state are verified; initially human approval.
- Refunds, cancellations and customer-facing legal commitments: human approval until reliable audited automation exists.

## Initial operating sequence
Phase 1 — Data foundation: complete Awin import validation, normalize offers, store provenance and timestamps, add supplier/programme status and approval queue.
Phase 2 — Partner pipeline: score German/EU programmes and draft applications; user approves submissions.
Phase 3 — Supplier pipeline: compare EU suppliers and dropshipping terms, verify product safety, delivery, returns and real landed cost.
Phase 4 — Store pilot: use Shopify only after plan upgrade and store configuration; launch a small, low-risk assortment with manual order approval.
Phase 5 — Content and distribution: create reusable product content and schedule posts through supported platform APIs; maintain a manual queue for channels without authorised publishing APIs.
Phase 6 — Optimization: evaluate actual sales, returns, chargebacks, commission validation, margin and content performance; scale only proven products.

## Operating guardrails
- Germany/EU compliance: verify product-specific GPSR, CE/other applicable conformity, REACH/WEEE/battery/packaging obligations, VAT, consumer withdrawal, warranty, price display and imprint/privacy obligations before listing. This is a checklist, not a legal determination.
- Avoid dropshipping offers with unclear EU importer/responsible person, no EU returns route, unverifiable stock or unrealistic delivery promises.
- Keep immutable source snapshots and audit logs for every product decision and external action.
- Enforce per-agent API/model budgets, rate limits, retries with idempotency keys, dead-letter handling and daily cost reporting.
- Use least-privilege credentials stored only as Worker secrets or secure connector authorisations.

## Definition of done for autonomy
An agent is not considered autonomous merely because a button exists. Each workflow must have: verified input source, deterministic state transitions, idempotent execution, retry/error handling, audit log, metrics, budget limits and a tested human override.
