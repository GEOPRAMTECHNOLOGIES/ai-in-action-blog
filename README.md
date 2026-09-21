# GeoPram AI — Simple Vercel M-Pesa Site

This is a deliberately small Flask/Vercel version based on the working Daraja implementation in the supplied GLDC system.

## Vercel
Deploy the project root. Vercel uses `api/index.py` and `vercel.json`.

## Required environment variables
Set the values in Vercel Production:

- `APP_URL=https://ai-in-action-blog.vercel.app`
- `DARAJA_ENV=production`
- `DARAJA_CONSUMER_KEY`
- `DARAJA_CONSUMER_SECRET`
- `DARAJA_PASSKEY`
- `DARAJA_SHORTCODE`
- `DARAJA_TILL_NUMBER`
- `DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline` for a Buy Goods/Till setup
- `DARAJA_CALLBACK_URL=https://ai-in-action-blog.vercel.app/api/payments/callback`
- `MONGODB_URI`
- `DATABASE_NAME=geopram_ai`
- `PAYMENT_AMOUNT_KES=100`
- `ACCESS_DAYS=30`

If your Safaricom account is provisioned as PayBill instead, use `CustomerPayBillOnline` and configure the shortcode according to that Daraja setup.

## Important
The callback route is `/api/payments/callback`, matching the working system's pattern. Do not put secrets in source code.
