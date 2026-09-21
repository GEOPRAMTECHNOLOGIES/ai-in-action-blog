# GeoPram AI Blog + M-Pesa Access

This is the cleaned Next.js version of the `ai-in-action-blog` site. The blog/homepage is preserved; the unused Flask/Python duplicate payment app has been removed.

## Payment setup (GLDC-compatible Daraja flow)

For Buy Goods / Till, set:

```env
DARAJA_ENV=production
DARAJA_BASE_URL=https://api.safaricom.co.ke
DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline
DARAJA_SHORTCODE=YOUR_BUSINESS_SHORTCODE
DARAJA_TILL_NUMBER=YOUR_TILL_NUMBER
DARAJA_PASSKEY=YOUR_PASSKEY
DARAJA_CONSUMER_KEY=YOUR_CONSUMER_KEY
DARAJA_CONSUMER_SECRET=YOUR_CONSUMER_SECRET
DARAJA_CALLBACK_URL=https://ai-in-action-blog.vercel.app/api/payments/callback

MONGODB_URI=YOUR_MONGODB_URI
DATABASE_NAME=geopram_ai
PAYMENT_AMOUNT_KES=100
ACCESS_DAYS=30

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=YOUR_SMTP_USERNAME
SMTP_PASSWORD=YOUR_SMTP_APP_PASSWORD
SMTP_FROM=no-reply@example.com
ADMIN_EMAIL=YOUR_ADMIN_EMAIL
NEXT_PUBLIC_SITE_URL=https://ai-in-action-blog.vercel.app
```

### Daraja fields
The STK request follows the payment pattern from the supplied GLDC app:
- `BusinessShortCode` = `DARAJA_SHORTCODE`
- `PartyA` = normalized customer phone (`2547...` / `2541...`)
- `PartyB` = `DARAJA_TILL_NUMBER` for `CustomerBuyGoodsOnline`
- password = base64(`shortcode + passkey + timestamp`)
- callback = `/api/payments/callback`

For PayBill use `CustomerPayBillOnline`; `PartyB` becomes the shortcode.

## MongoDB compatibility

The payment code does **not** create indexes during every request. It only removes the obsolete legacy `id_1` index if that exact index exists. Existing indexes such as `checkout_request_unique` are left untouched, so MongoDB cannot fail with `IndexOptionsConflict` just because an index has another name.

New payment records use `_id` and `paymentId`, with GLDC-compatible `checkoutRequestId` naming.

## Vercel

Deploy this folder as a normal Next.js project. Vercel detects Next.js automatically. Put all secrets in Vercel Environment Variables for Production, then redeploy.
