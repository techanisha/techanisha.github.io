# NIVA Store Owner Guide

## Free Services Used

- Website hosting: GitHub Pages free tier
- API hosting: Cloudflare Workers free tier
- Database: Cloudflare D1 free tier
- AI assistant: Gemini API free tier after you add your own key

## Open The Admin Panel

Visit:

`https://techanisha.github.io/admin.html`

The first time only, choose **First-time setup** and create your admin account using the private bootstrap code. After that, sign in normally.

## Edit A Price Or Stock

1. Sign in to the admin panel.
2. Open **Products & stock**.
3. Select **Edit** beside a product.
4. Change the price or stock number.
5. Select **Save product**.

Set stock to `0` to show **Sold out**. Customers can still view the style but cannot add it to their bag.

Turn off **Visible in shop** when you want to hide a style completely.

## Add A New Product

1. Put optimized JPG or WebP images in:

   `niva-v2-assets/products/your-product-name/`

2. Commit and push those images to GitHub.
3. Open the admin panel and select **Products & stock**.
4. Select **Add product**.
5. Enter name, NPR price, stock, category, sizes, image path, gallery paths, and fit notes.
6. Select **Save product**.

Example main image path:

`niva-v2-assets/products/your-product-name/front.jpg`

Example gallery:

`niva-v2-assets/products/your-product-name/front.jpg, niva-v2-assets/products/your-product-name/side.jpg`

Keep folder and file names lowercase, short, and separated with hyphens.

## Product Switches

- **Visible in shop**: controls whether customers see the product.
- **Featured**: places the product in the Featured Styles row.
- **New arrival**: places the product in the New Arrivals section.

## Orders And NCM Tracking

1. Open an order from the admin dashboard.
2. Confirm customer details and stock.
3. Book the parcel with NCM.
4. Add the NCM tracking number only after booking.
5. Change status to **Booked with NCM** and save.

Customers see their NIVA order number immediately. NCM tracking appears only after you add it.

## Gemini Assistant Setup

Never paste an API key into `index.html` or commit it to GitHub.

1. Create a free Gemini API key in Google AI Studio.
2. Open PowerShell in:

   `C:\Users\User\Desktop\codexfolder\site\backend`

3. Run:

   `npx wrangler secret put GEMINI_API_KEY`

4. Paste the key only into Wrangler's private prompt.

The assistant uses the server-side secret and the current live catalog. The key is never exposed to website visitors.

## Publish Frontend Changes

From `C:\Users\User\Desktop\codexfolder\site`:

```powershell
git add .
git commit -m "Update NIVA storefront"
git push origin main
```

GitHub Pages updates automatically after the push.

## Publish Backend Code Changes

You do not need these commands for normal price, stock, or product edits in the admin panel. Use them only when the Worker code or database schema changes.

From `C:\Users\User\Desktop\codexfolder\site\backend`:

```powershell
npm install
npm run db:remote
npm run deploy
```

Keep API keys private. Use `npx wrangler secret put SECRET_NAME` for secrets instead of writing them into code.
