import { nowNairobiStamp, stkPassword } from "./security";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function getDarajaToken(): Promise<string> {
  const production = (process.env.DARAJA_ENV || "production").toLowerCase() === "production";
  const base = (process.env.DARAJA_BASE_URL || (production ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke")).replace(/\/$/, "");
  const key = required("DARAJA_CONSUMER_KEY");
  const secret = required("DARAJA_CONSUMER_SECRET");
  const basic = Buffer.from(`${key}:${secret}`).toString("base64");

  const response = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` }, cache: "no-store"
  });
  const text = await response.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!response.ok || !data.access_token) {
    const msg = data.errorMessage || data.error_description || data.errorCode || text || `HTTP ${response.status}`;
    throw new Error(`DARAJA_TOKEN_FAILED: ${msg}`);
  }
  return data.access_token;
}

export async function initiateStkPush(params: {
  phone: string; amountKes: number; accountReference: string; transactionDesc: string;
}) {
  const production = (process.env.DARAJA_ENV || "production").toLowerCase() === "production";
  const base = (process.env.DARAJA_BASE_URL || (production ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke")).replace(/\/$/, "");
  const shortcode = required("DARAJA_SHORTCODE");
  const passkey = required("DARAJA_PASSKEY");
  const callbackUrl = required("DARAJA_CALLBACK_URL");
  const transactionType = (process.env.DARAJA_TRANSACTION_TYPE || "CustomerBuyGoodsOnline").trim();

  if (!["CustomerBuyGoodsOnline", "CustomerPayBillOnline"].includes(transactionType)) {
    throw new Error("DARAJA_TRANSACTION_TYPE must be CustomerBuyGoodsOnline or CustomerPayBillOnline");
  }

  const till = process.env.DARAJA_TILL_NUMBER?.trim() || "";
  if (transactionType === "CustomerBuyGoodsOnline" && !till) {
    throw new Error("DARAJA_TILL_NUMBER is required for CustomerBuyGoodsOnline");
  }

  // Match the supplied GLDC implementation exactly:
  // BusinessShortCode = business shortcode; PartyA = customer; PartyB = till for Buy Goods.
  const timestamp = nowNairobiStamp();
  const password = stkPassword(shortcode, passkey, timestamp);
  const token = await getDarajaToken();
  const amount = Math.max(1, Math.round(params.amountKes));

  const body = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: transactionType,
    Amount: amount,
    PartyA: params.phone,
    PartyB: transactionType === "CustomerBuyGoodsOnline" ? till : shortcode,
    PhoneNumber: params.phone,
    CallBackURL: callbackUrl,
    AccountReference: params.accountReference.slice(0, 12),
    TransactionDesc: params.transactionDesc.slice(0, 13),
  };

  const response = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), cache: "no-store"
  });

  const text = await response.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!response.ok || data.ResponseCode !== "0") {
    const msg = data.ResponseDescription || data.errorMessage || data.error_description || data.errorCode || text || `HTTP ${response.status}`;
    throw new Error(`DARAJA_STK_FAILED: ${msg}`);
  }
  return data;
}
