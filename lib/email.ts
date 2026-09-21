import nodemailer from "nodemailer";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c] as string));
}

export async function sendPaymentEmails(params: {
  email: string;
  phone: string;
  amountKes: number;
  mpesaReceiptNumber?: string;
  accessCode: string;
  expiresAt: Date;
}) {
  const transporter = nodemailer.createTransport({
    host: required("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: required("SMTP_USERNAME"),
      pass: required("SMTP_PASSWORD")
    }
  });

  const from = required("SMTP_FROM");
  const admin = required("ADMIN_EMAIL");
  const site = process.env.NEXT_PUBLIC_SITE_URL || "";
  const accessUrl = site ? `${site}/access/${encodeURIComponent(params.accessCode)}` : "";

  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:auto;color:#242424">
    <div style="padding:28px;background:linear-gradient(135deg,#0078d4,#5b2cff);color:white">
      <div style="font-size:24px;font-weight:700">GeoPram Technologies</div>
      <div style="margin-top:8px">AI See How — Payment Receipt</div>
    </div>
    <div style="padding:28px;border:1px solid #ddd">
      <h2 style="margin-top:0">Payment received</h2>
      <p>Thank you. Your payment has been confirmed.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px 0">Amount</td><td><b>KES ${params.amountKes}</b></td></tr>
        <tr><td style="padding:8px 0">M-Pesa receipt</td><td><b>${esc(params.mpesaReceiptNumber || "Pending")}</b></td></tr>
        <tr><td style="padding:8px 0">Phone</td><td>${esc(params.phone)}</td></tr>
        <tr><td style="padding:8px 0">Access expires</td><td>${esc(params.expiresAt.toISOString())}</td></tr>
      </table>
      <div style="margin:24px 0;padding:20px;background:#f5f5f5;border-radius:8px">
        <div style="font-size:13px;color:#666">Your access code</div>
        <div style="font-size:28px;font-weight:800;letter-spacing:3px">${esc(params.accessCode)}</div>
      </div>
      ${accessUrl ? `<p><a href="${accessUrl}" style="display:inline-block;padding:12px 18px;background:#0078d4;color:#fff;text-decoration:none;border-radius:4px">Open your AI content</a></p>` : ""}
      <p style="font-size:13px;color:#666">Access is valid for the configured access period. Keep this email for your records.</p>
      <p>Powered by <b>GeoPram Technologies</b>.</p>
    </div>
  </div>`;

  await Promise.all([
    transporter.sendMail({
      from,
      to: params.email,
      subject: "GeoPram Technologies — Payment Receipt & Access Code",
      html
    }),
    transporter.sendMail({
      from,
      to: admin,
      subject: `GeoPram — New AI access payment (${params.amountKes} KES)`,
      html: html.replace("Your access code", "Customer access code")
    })
  ]);
}
