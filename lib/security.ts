import crypto from "crypto";

export function normalizeKenyanPhone(input: string): string | null {
  const raw = input.trim().replace(/[^\d+]/g, "");
  let digits = raw.replace(/\D/g, "");

  if (raw.startsWith("+254")) {
    digits = raw.slice(1).replace(/\D/g, "");
  } else if (raw.startsWith("254")) {
    digits = raw.replace(/\D/g, "");
  } else if (raw.startsWith("07") || raw.startsWith("01")) {
    digits = "254" + raw.slice(1).replace(/\D/g, "");
  }

  if (/^254(7|1)\d{8}$/.test(digits)) return digits;
  return null;
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim());
}

export function newAccessCode(): string {
  return crypto.randomBytes(8).toString("hex").toUpperCase();
}

export function newPaymentId(): string {
  return crypto.randomBytes(12).toString("hex");
}

export function nowNairobiStamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`;
}

export function stkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}
