# Northstar: self-funded autonomous business model

## Owner mandate

The owner contributes **one initial seed amount of EUR 20.00**. No later owner top-ups are part of the operating model. Northstar's objective is to earn legitimate revenue, pay its own operating costs, preserve a cash reserve, and reinvest a controlled share of realized surplus.

This is a target architecture and operating contract. It does not claim that the current static PWA already performs autonomous work or earns revenue.

## Non-negotiable financial invariants

1. The seed contribution is owner-provided capital, not revenue, profit, or an affiliate commission.
2. Only realized and evidenced affiliate payouts count as earned revenue. Clicks, views, pending commissions, estimates, and unapproved attribution are not cash.
3. The system must never authorize spending above cleared available funds.
4. The system must reserve enough cash for already committed liabilities before allocating a discretionary budget.
5. If funds are insufficient, paid model calls and other discretionary paid services stop. Free/local workflows may continue.
6. No borrowing, credit, overdraft, owner top-up, paid subscription, or external purchase may be initiated without an explicit owner authorization.
7. Affiliate publishing, account access, and promotional claims must comply with each platform's current terms and disclosure requirements.
8. A ledger entry is not a bank balance. Real cash must be reconciled against provider statements and payment accounts.

## Operating cash model

Maintain separate balances and event types:

- **Seed capital:** the one-time owner contribution (EUR 20.00 in the initial scenario).
- **Realized revenue:** settled affiliate payouts supported by a statement or payout reference.
- **Operating expenses:** actual charges, including model/API usage, domains, infrastructure, and production services.
- **Committed spend:** approved but not yet settled obligations; these reduce spendable cash.
- **Operating reserve:** funds protected against upcoming obligations and minimum continuity needs.
- **Reinvestment allocation:** a budget decision, not a cash transfer and not an expense until money is actually spent.

Spendable cash must be calculated as:

`cleared cash + settled revenue - settled expenses - committed spend - protected reserve`

The system must not count the same amount both as available operating cash and as a reserve allocation.

## Autonomous operating cycle

1. **Discover:** identify products and affiliate programs that are actually eligible and relevant.
2. **Validate:** verify product facts, current price, availability, merchant, commission rules, link validity, and source timestamps.
3. **Select:** rank opportunities by expected contribution margin, evidence quality, production effort, and compliance risk. Estimates must be labelled as estimates.
4. **Produce:** create copy and media using the lowest-cost adequate workflow.
5. **Quality gate:** reject unsupported claims, stale prices, broken links, missing affiliate disclosures, rights issues, and low-quality creative.
6. **Publish or queue:** publish only through officially supported integrations and only within owner-approved channel permissions. Until those exist, prepare a review queue.
7. **Measure:** collect views, clicks, conversions, cancellations, and settled commissions where data access is authorized.
8. **Reconcile:** compare reported commissions with actual payout statements.
9. **Reinvest:** allocate only realized surplus after expenses and reserve requirements.
10. **Learn:** stop unprofitable activities and prioritize workflows with positive verified contribution.

## Agent responsibilities

- **Orchestrator / CEO:** plans work, delegates tasks, enforces budgets and gates, and reports exceptions.
- **Product research:** sources opportunities and records evidence and timestamps.
- **Affiliate/compliance:** checks program eligibility, terms, disclosure, and link rules.
- **Content:** creates platform-specific drafts and creative briefs.
- **Media:** generates or edits assets using approved free or budgeted services.
- **Quality assurance:** checks product fidelity, factual claims, links, disclosure, and output quality.
- **Distribution:** schedules or publishes only through permitted integrations.
- **Analytics:** measures funnel performance and identifies winners/losers.
- **Finance:** maintains the ledger, reconciles payouts, calculates runway, and controls budgets.

An agent role is not an autonomous agent until it has a real model/tool execution path, persisted state, bounded permissions, and observable outcomes.

## Budget policy for the EUR 20 seed

- Start in **survival mode**: prioritize free infrastructure and low-cost text models.
- Use a configurable hard monthly and per-run API budget.
- Set a per-provider spend ceiling and global spend ceiling.
- Require a preflight cost estimate before every paid call.
- Refuse paid calls if price metadata is unavailable, the balance is stale, or the call would exceed a limit.
- Log provider, model, purpose, input/output usage, estimated cost, actual cost, task ID, and timestamp.
- Disable paid calls automatically at the hard limit.
- Never use all available cash for model tokens; retain a protected reserve.
- Recalculate budgets only after reconciled cash events.

## Autonomy and owner controls

The owner can set the initial mandate and approved operating envelope once. The system may make routine decisions inside that envelope. Owner approval remains mandatory for:
- new paid subscriptions or recurring commitments;
- changing the total hard spending ceiling;
- account credentials, legal identity, tax, or payout changes;
- publishing through a new account or channel;
- actions that create legal, financial, or contractual obligations;
- any action outside the configured mandate.

The owner must be able to pause all agents, revoke provider credentials, export the ledger, and inspect a complete action log.

## Current implementation gap

The current Northstar codebase is a static, browser-local PWA. It has IndexedDB task and finance stores, manually entered ledger records, and role-based task queues. It does **not** yet have:
- a server-side orchestrator or scheduled worker;
- real LLM agent execution and tool permissions;
- secure server-side secret storage and metered provider proxy;
- a cash-aware spending gate;
- affiliate account/payout integrations;
- autonomous distribution or publishing;
- multi-device synchronization, backups, or tamper-resistant finance reconciliation.

The browser-local database must not be treated as a secure financial authority or as a place to store provider secrets.

## Delivery roadmap

### Phase 0 — Contract and safeguards
- Adopt this operating model as the product requirement.
- Define seed capital, realized cash, liabilities, reserve, and spendable cash as separate ledger concepts.
- Keep all paid execution disabled until the budget gate is implemented.

### Phase 1 — Financial control plane
- Add one-time seed-capital onboarding.
- Add a cash ledger with immutable event records and evidence references.
- Calculate cleared cash, committed spend, protected reserve, and spendable cash.
- Add global, monthly, per-provider, and per-task spending limits.
- Add fail-closed budget authorization tests.

### Phase 2 — Secure execution backend
- Introduce a server-side orchestrator and scheduler.
- Store secrets only server-side; never expose API keys in the PWA.
- Implement metered provider adapters, idempotency, retries, timeouts, and audit logs.
- Keep paid execution off by default until the owner configures a provider and limits.

### Phase 3 — Revenue operations
- Add authorized affiliate data imports and payout reconciliation.
- Build research, content, media, QA, analytics, and finance agent workflows.
- Add platform-compliant review/publishing integrations where officially supported.

### Phase 4 — Self-financing optimization
- Calculate contribution margin by product, channel, and campaign.
- Automatically pause loss-making paid workflows.
- Reinvest only realized surplus above reserve and liability requirements.
- Report runway, break-even, unit economics, and cashflow.

## Acceptance criteria for self-financing

Northstar is not considered self-financing until it can demonstrate all of the following with auditable evidence:
- initial owner capital recorded once and never misclassified as revenue;
- no owner top-ups required after the initial seed;
- paid execution blocked when spendable cash is insufficient;
- provider usage and charges reconciled to the ledger;
- affiliate payouts reconciled to actual cash receipts;
- positive operating cashflow over a defined measurement period;
- reserve and liability requirements met;
- owner can pause, inspect, and export the system at any time.
