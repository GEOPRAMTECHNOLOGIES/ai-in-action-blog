# Production deployment

Deploy this folder as a Next.js project on Vercel.

Set the environment variables in Vercel under **Production**. The non-secret values are already represented in `.env.example`.

Required production values:

- `DARAJA_ENV=production`
- `DARAJA_BASE_URL=https://api.safaricom.co.ke`
- `DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline`
- `DARAJA_SHORTCODE=4574727`
- `DARAJA_TILL_NUMBER=5367886`
- `DARAJA_CALLBACK_URL=https://new-ai-in-action-blog.vercel.app/api/payments/callback`
- `DATABASE_NAME=AIInAction`
- `PAYMENT_AMOUNT_KES=100`
- `ACCESS_DAYS=30`
- `NEXT_PUBLIC_SITE_URL=https://new-ai-in-action-blog.vercel.app`

Enter the Daraja credentials, MongoDB URI, Gmail app password, and APP_SECRET as Vercel environment variables. Do not commit real secrets to the repository.

The payment amount is controlled only by `PAYMENT_AMOUNT_KES`. There is no `NEXT_PUBLIC_PAYMENT_AMOUNT_KES` variable in this version.

For Buy Goods/Till STK, the app sends:

- `BusinessShortCode = DARAJA_SHORTCODE`
- `PartyA = customer phone`
- `PartyB = DARAJA_TILL_NUMBER`
- `TransactionType = CustomerBuyGoodsOnline`

Confirm that this matches the merchant configuration provisioned by Safaricom before production use.
