# GeoPram AI — simple Vercel M-Pesa app

This app is intentionally small and follows the M-Pesa/Daraja payment pattern used in the supplied GLDC system.

## Important Daraja setup

For a Safaricom **Buy Goods / Till** setup use:

```env
DARAJA_ENV=production
DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline
DARAJA_SHORTCODE=YOUR_BUSINESS_SHORTCODE
DARAJA_TILL_NUMBER=YOUR_TILL_NUMBER
DARAJA_PASSKEY=YOUR_PASSKEY
DARAJA_CALLBACK_URL=https://ai-in-action-blog.vercel.app/api/payments/callback
```

The key payment fields follow the GLDC implementation:

- `BusinessShortCode` = `DARAJA_SHORTCODE`
- `PartyA` = customer's normalized `2547XXXXXXXX` / `2541XXXXXXXX` phone
- `PartyB` = `DARAJA_TILL_NUMBER` for `CustomerBuyGoodsOnline`
- password = base64(`DARAJA_SHORTCODE + DARAJA_PASSKEY + timestamp`)
- callback = `/api/payments/callback`

For a PayBill configuration use `CustomerPayBillOnline`; `PartyB` becomes the shortcode and a till number is not required.

## MongoDB

Set:

```env
MONGODB_URI=...
DATABASE_NAME=geopram_ai
```

This version uses `paymentId`, not the old `id` field. On first connection it removes an obsolete unique `id_1` payment index if it exists, which prevents the `E11000 duplicate key: { id: null }` error from the older GeoPram build.

## Payment flow

1. Customer enters email and Kenyan M-Pesa phone.
2. `/api/pay` creates a pending payment.
3. Daraja STK Push is sent.
4. Safaricom calls `/api/payments/callback`.
5. `ResultCode = 0` marks payment successful.
6. A unique access code is created for 30 days.
7. Optional SMTP sends the access code by email.
8. Browser polls `/api/payment-status` for confirmation.

## Vercel

Deploy the project root containing `vercel.json`, `app.py`, `api/index.py`, `templates/`, and `requirements.txt`.

Set all environment variables in **Vercel → Settings → Environment Variables → Production**, then redeploy.

Never put Daraja consumer secrets, passkeys, MongoDB passwords, or SMTP passwords in source code.
