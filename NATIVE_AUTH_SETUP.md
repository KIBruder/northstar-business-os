# Native Northstar account and sync setup

This replaces Cloudflare Access for the Northstar data-sync API. It does not replace the separate Worker AI access token used by image generation and product analysis.

## One-time Cloudflare setup

1. In the Cloudflare dashboard, open **Workers & Pages → northstar-image-generator → Settings → Variables and Secrets**.
2. Add `NORTHSTAR_AUTH_SECRET` as a **Secret** (not a plain-text variable). Use a randomly generated value with at least 32 characters. Do not commit it to GitHub or share it in chat.
3. Open the **northstar-production** D1 database and execute the SQL in `cloudflare-worker/migrations/0002_native_auth.sql` once. This creates the `users` table. Do not rerun a destructive migration; this one is safe to re-run.
4. Deploy the Worker from the repository's `main` branch after the PR is merged. Keep the existing `AI` and `db` bindings.

No Cloudflare Zero Trust enrollment is needed for this native account flow. The free Cloudflare Workers/D1 setup does not require adding a payment card for this feature, subject to the account's current service limits.

## First login

1. Open Northstar and go to **Einstellungen**.
2. Enter your email and create a password of at least 12 characters.
3. Use **Jetzt synchronisieren** to merge the local IndexedDB records with the D1 workspace records.

The password is never stored in the browser. The Worker stores a salted PBKDF2-SHA-256 password hash and issues a signed seven-day bearer session. The browser stores the session token locally. Logout removes it from that browser; the token itself remains valid until expiry.

## Important security and rollout notes

- Keep `NORTHSTAR_AUTH_SECRET` private. Rotating it invalidates existing sessions.
- The first account is not email-verified in this initial implementation. Use an email address you control and a unique password.
- Add rate limiting, email verification, session revocation, and password reset before opening registration to the public.
- Local IndexedDB remains the local copy. Cloud sync is manual and should be tested with non-critical sample data before relying on it as a backup.
- The AI image/product endpoints still use the existing `NORTHSTAR_ACCESS_TOKEN`. This auth change does not remove or replace that secret.
