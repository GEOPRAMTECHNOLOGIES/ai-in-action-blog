import { NextResponse } from "next/server";
import { payments } from "@/lib/db";
import { initiateStkPush } from "@/lib/daraja";
import { normalizeKenyanPhone, newPaymentId, validEmail } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = normalizeKenyanPhone(String(body.phone || ""));
    const termsAccepted = Boolean(body.termsAccepted);
    if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (!phone) return NextResponse.json({ error: "Enter a valid Kenyan mobile number." }, { status: 400 });
    if (!termsAccepted) return NextResponse.json({ error: "You must agree to the terms." }, { status: 400 });

    const amountKes = Math.round(Number(process.env.PAYMENT_AMOUNT_KES || 100));
    if (!Number.isFinite(amountKes) || amountKes < 1) return NextResponse.json({ error: "Payment amount is not configured correctly." }, { status: 500 });

    const paymentId = `GP-PAY-${newPaymentId().toUpperCase()}`;
    const collection = await payments();
    const now = new Date();
    const payment = {
      _id: paymentId,
      paymentId,
      email,
      phone,
      amountKes,
      currency: "KES",
      reference: paymentId,
      description: "GeoPram AI access",
      status: "PENDING" as const,
      termsAcceptedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    // No application-side index creation happens here. This is deliberately compatible
    // with the existing GLDC/GeoPram payments collection and its existing index names.
    await collection.insertOne(payment);

    try {
      const stk = await initiateStkPush({
        phone,
        amountKes,
        accountReference: paymentId,
        transactionDesc: "GeoPram AI",
      });
      const checkoutRequestId = stk.CheckoutRequestID;
      if (!checkoutRequestId) {
        await collection.updateOne({ _id: paymentId }, { $set: { status: "FAILED", resultDesc: stk.ResponseDescription || "No CheckoutRequestID", updatedAt: new Date() } });
        return NextResponse.json({ error: stk.ResponseDescription || "Could not start M-Pesa payment." }, { status: 502 });
      }
      await collection.updateOne({ _id: paymentId }, { $set: {
        merchantRequestId: stk.MerchantRequestID,
        checkoutRequestId,
        resultDesc: stk.CustomerMessage || stk.ResponseDescription || "STK request sent",
        updatedAt: new Date(),
      }});
      return NextResponse.json({ paymentId, amountKes, message: stk.CustomerMessage || "Check your phone and approve the M-Pesa prompt." });
    } catch (error: any) {
      await collection.updateOne({ _id: paymentId }, { $set: { status: "FAILED", resultDesc: error?.message || "STK initiation failed", updatedAt: new Date() } });
      console.error("STK request failed", error?.message || error);
      return NextResponse.json({ error: error?.message || "We could not start the M-Pesa payment." }, { status: 502 });
    }
  } catch (error: any) {
    console.error("Payment creation failed", error?.message || error);
    return NextResponse.json({ error: "We could not start the payment. Please try again." }, { status: 500 });
  }
}
