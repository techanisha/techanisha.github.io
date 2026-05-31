# NIVA API

Cloudflare Worker and D1 backend for the NIVA storefront.

## Security Model

- Passwords are hashed server-side with PBKDF2 and a per-user random salt.
- Login sessions use random bearer tokens; only SHA-256 token hashes are stored.
- Storefront totals are recalculated against a server-side catalog.
- Admin access is enforced by the `users.role` value in D1.
- Public tracking returns a restricted summary and requires the order number plus the customer's phone last four digits unless the signed-in customer owns the order.
- Admin bootstrap is one-time and requires the `ADMIN_BOOTSTRAP_CODE` Worker secret.

## Deploy

1. Install dependencies with `npm install`.
2. Authenticate Wrangler with `npx wrangler login`.
3. Create the database with `npx wrangler d1 create niva-orders`.
4. Replace `__NIVA_D1_DATABASE_ID__` in `wrangler.jsonc`.
5. Apply the schema with `npm run db:remote`.
6. Add a one-time bootstrap secret with `npx wrangler secret put ADMIN_BOOTSTRAP_CODE`.
7. Deploy with `npm run deploy`.
8. Connect the static site to the deployed Worker URL.

After the first administrator is created through `/admin.html`, the bootstrap endpoint refuses further administrator creation.

## Current Deployment

The GitHub Pages storefront is configured to use:

```text
https://niva-api.number6six060.workers.dev
```
