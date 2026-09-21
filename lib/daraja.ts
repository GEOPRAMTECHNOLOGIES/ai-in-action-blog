import { nowNairobiStamp, stkPassword } from "./security";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function getDarajaToken(): Promise<string> {
  const base = required("DARAJA_BASE_URL").replace(/\/$/, "");
  const key = required("DARAJA_CONSUMER_KEY");
  const secret = required("DARAJA_CONSUMER_SECRET");
  const basic = Buffer.from(`${key}:${secret}`).toString("base64");

  const response = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    method: "GET",
    headers: { Authorization: `Basic ${basic}` },
    cache: "no-store"
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Daraja OAuth failed: ${response.status} ${text}`);

  const data = JSON.parse(text);
  if (!data.access_token) throw new Error("Daraja did not return an access token");
  return data.access_token;
}

export async function initiateStkPush(params: {
  phone: string;
  amountKes: number;
  accountReference: string;
  transactionDesc: string;
}) {
  const base = required("DARAJA_BASE_URL").replace(/\/$/, "");
  const shortcode = required("DARAJA_SHORTCODE");
  const passkey = required("DARAJA_PASSKEY");
  const callbackUrl = required("DARAJA_CALLBACK_URL");
  const transactionType = (process.env.DARAJA_TRANSACTION_TYPE || "CustomerPayBillOnline") as
    | "CustomerPayBillOnline"
    | "CustomerBuyGoodsOnline";

  const isTill = transactionType === "CustomerBuyGoodsOnline";
  const till = process.env.DARAJA_TILL_NUMBER;
  if (isTill && !till) throw new Error("DARAJA_TILL_NUMBER is required for CustomerBuyGoodsOnline");

  const businessShortCode = Number(isTill ? till : shortcode);
  const partyB = businessShortCode;

  const timestamp = nowNairobiStamp();
  const password = stkPassword(shortcode, passkey, timestamp);
  const token = await getDarajaToken();

  const response = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      BusinessShortCode: businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: transactionType,
      Amount: Math.max(1, Math.round(params.amountKes)),
      PartyA: params.phone,
      PartyB: partyB,
      PhoneNumber: params.phone,
      CallBackURL: callbackUrl,
      AccountReference: params.accountReference.slice(0, 12),
      TransactionDesc: params.transactionDesc.slice(0, 13)
    }),
    cache: "no-store"
  });

  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!response.ok) throw new Error(`Daraja STK Push failed: ${response.status} ${text}`);
  return data;
}
