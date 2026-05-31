# NIVA Storefront

Public static launch for NIVA, a modern Nepali fashion boutique focused on women's dresses and sets.

## Live Store

The GitHub Pages release is published from this repository root.

## Current Order Flow

This launch is a catalog and manual-confirmation storefront:

1. Customers browse products, add items to the cart, and complete the required delivery fields.
2. The site creates a receipt draft and NIVA order number in the customer's browser.
3. Customers send that order number to [@niva.creation_](https://www.instagram.com/niva.creation_/) for stock and delivery confirmation.
4. NCM tracking is shared only after the parcel is booked.

The site intentionally does not include a browser-based admin panel or a public admin password. A secure backend is required before orders can sync across devices automatically.

## Structure

```text
index.html
niva-v2-assets/
  niva-logo-header.png
  products/
```

Product photos are optimized website copies prepared from NIVA-provided assets.

