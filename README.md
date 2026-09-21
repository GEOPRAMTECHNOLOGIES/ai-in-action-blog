# GeoPram Technologies — AI "See How" Landing Page

A Vercel-ready Next.js app with:

- Microsoft Fluent UI-inspired interface.
- Landing page containing the supplied blog graphic and:
  "The world is moving fast. AI is accelerating it."
- "SEE HOW" button.
- Terms acceptance before payment.
- Email format validation and Kenyan phone validation.
- Safaricom Daraja STK Push in KES.
- MongoDB payment/access records.
- Daraja callback at `/api/daraja/callback`.
- Successful payment creates a one-time access code valid for 30 days.
- The paid content displays the AI article and colorful text.
- Email receipt + access details to the customer.
- Copy of the receipt to the GeoPram admin email.
- Vercel deployment ready.

## IMPORTANT SECURITY NOTE

The credentials pasted into the chat were intentionally NOT placed into this ZIP.
Put them into Vercel Environment Variables instead. Because credentials were pasted into a chat,
rotate/revoke any live Daraja, MongoDB, or SMTP secrets before production use.

## 1. Install

```bash
npm install
npm run dev
```

## 2. Vercel environment variables

Open:

Vercel -> Project -> Settings -> Environment Variables

Copy every variable from `.env.example`.

For production, use:

- `DARAJA_CALLBACK_URL=https://YOUR-REAL-VERCEL-DOMAIN.vercel.app/api/daraja/callback`
- `NEXT_PUBLIC_SITE_URL=https://YOUR-REAL-VERCEL-DOMAIN.vercel.app`

Do not use the callback URL without `/api/daraja/callback`.

`PAYMENT_AMOUNT_KES` is the actual STK Push amount. `PAYMENT_AMOUNT_USD` is only a display/reference value.

For Gmail SMTP, use a Gmail App Password, not your normal Gmail password.

## 3. MongoDB

Create a database and set:

`MONGODB_URI`
`DATABASE_NAME`

The app creates a `payments` collection automatically.

## 4. Daraja

The STK request uses:

`POST {DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`

OAuth uses:

`GET {DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`

The callback route is:

`/api/daraja/callback`

The callback updates the payment by the stored `CheckoutRequestID`.

## 5. Production deployment

Push the project to GitHub, import it into Vercel, add environment variables, then deploy.

After deployment, test:

1. Landing page.
2. Terms acceptance.
3. Valid email and phone.
4. STK prompt.
5. Successful payment.
6. Callback reaches `/api/daraja/callback`.
7. Access page and email receipt.
8. Expiration after `ACCESS_DAYS`.

## 6. Important payment behavior

The browser polls the server for the payment state after STK initiation.
The browser does NOT mark a payment as successful.

Only the Daraja callback can move a payment from `PENDING` to `SUCCESS`.

A failed/cancelled STK request is recorded as `FAILED`.

## 7. Customization

The paid article is in:

`app/access/[code]/page.tsx`

The landing content is in:

`app/page.tsx`

The payment amount is controlled by:

`PAYMENT_AMOUNT_KES`

The access duration is controlled by:

`ACCESS_DAYS`

## Important M-Pesa setup for Till vs PayBill

The checkout supports both Daraja STK modes. Set `DARAJA_TRANSACTION_TYPE` to match the merchant account configured in your Safaricom Daraja production app:

- `CustomerPayBillOnline` → uses `DARAJA_SHORTCODE` as the business short code.
- `CustomerBuyGoodsOnline` → uses `DARAJA_TILL_NUMBER` as the business/till number.

The previous build always sent `CustomerPayBillOnline` and ignored the Till number. If your production account is meant to collect through the Till, that can cause Safaricom to reject the request or return a generic failure such as `Failed due to an unresolved reason type.`

The UI now translates generic Safaricom failures into a clearer customer message instead of exposing the raw gateway wording.

For a Till setup, use:

```env
DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline
DARAJA_TILL_NUMBER=YOUR_TILL_NUMBER
```

For a PayBill setup, use:

```env
DARAJA_TRANSACTION_TYPE=CustomerPayBillOnline
DARAJA_SHORTCODE=YOUR_PAYBILL_NUMBER
```

Verify the production values against the merchant account/app in the official Safaricom Daraja portal before going live.
