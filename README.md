# NIVA Storefront

Public static launch for NIVA, a modern Nepali fashion boutique focused on women's dresses and sets.

## Live Store

The GitHub Pages release is published from this repository root.

## Current Order Flow

This launch is a catalog and manual-confirmation storefront:

1. Customers browse products freely and add dresses or sets to the cart.
2. Checkout requires a NIVA customer account. The current static release keeps the account on the customer's browser and stores only a one-way password hash.
3. The site creates a receipt and NIVA order number in the customer's browser.
4. Customers send that order number to [@niva.creation_](https://www.instagram.com/niva.creation_/) for stock and delivery confirmation.
5. NCM tracking is shared only after the parcel is booked.

The site intentionally does not include a browser-based admin panel or a public admin password. A secure backend is required before accounts and orders can sync across devices automatically.

## Structure

```text
index.html
niva-v2-assets/
  niva-logo-header.png
  products/
```

Product photos are optimized website copies prepared from NIVA-provided assets.
