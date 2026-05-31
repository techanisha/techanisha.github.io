# NIVA Storefront

Public static launch for NIVA, a modern Nepali fashion boutique focused on women's dresses and sets.

## Live Store

The GitHub Pages release is published from this repository root.

## Order Flow

1. Customers browse products freely and add dresses or sets to the cart.
2. Checkout requires a secure NIVA customer account.
3. The Cloudflare Worker API calculates prices server-side and stores the order in D1.
4. Customers receive a receipt and send the NIVA order number to [@niva.creation_](https://www.instagram.com/niva.creation_/) for stock and delivery confirmation.
5. NCM tracking is shared only after the parcel is booked.

The protected administrator workspace is available at `/admin.html`. It requires a server-verified administrator account and does not expose an admin password in public JavaScript.

## Structure

```text
index.html
admin.html
niva-v2-assets/
  niva-logo-header.png
  products/
backend/
  src/index.js
  schema.sql
  wrangler.jsonc
```

Product photos are optimized website copies prepared from NIVA-provided assets.
