# GeoPram AI — Simple Vercel M-Pesa App

This is the simplified version of the GeoPram AI checkout. It uses Flask on Vercel, Daraja STK Push, and MongoDB.

## Important database fix

This version fixes the MongoDB error:

`E11000 duplicate key error ... index: id_1 dup key: { id: null }`

The app removes the old non-sparse `id` index created by earlier deployments and replaces it with a sparse unique index. This allows legacy payment records that do not contain `id` to remain in the collection.

## Vercel environment variables

```env
APP_URL=https://ai-in-action-blog.vercel.app
DARAJA_ENV=production
DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline
DARAJA_CALLBACK_URL=https://ai-in-action-blog.vercel.app/api/payments/callback
DARAJA_CONSUMER_KEY=...
DARAJA_CONSUMER_SECRET=...
DARAJA_PASSKEY=...
DARAJA_SHORTCODE=...
DARAJA_TILL_NUMBER=...
MONGODB_URI=...
DATABASE_NAME=geopram_ai
PAYMENT_AMOUNT_KES=100
ACCESS_DAYS=30
```

If the Safaricom account is a PayBill instead of a Till, set `DARAJA_TRANSACTION_TYPE=CustomerPayBillOnline` and use the provisioned PayBill shortcode.

Deploy the `geopram-simple` directory as the Vercel project root.
