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

    if (!validEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ error: "Enter a valid Kenyan mobile number." }, { status: 400 });
    }
    if (!termsAccepted) {
      return NextResponse.json({ error: "You must agree to the terms." }, { status: 400 });
    }

    const amountKes = Number(process.env.PAYMENT_AMOUNT_KES || 100);
    if (!Number.isFinite(amountKes) || amountKes < 1) {
      return NextResponse.json({ error: "Payment amount is not configured correctly." }, { status: 500 });
    }

    const paymentId = newPaymentId();
    const collection = await payments();
    const now = new Date();

    await collection.insertOne({
      _id: paymentId,
      email,
      phone,
      amountKes: Math.round(amountKes),
      status: "PENDING",
      termsAcceptedAt: now,
      createdAt: now,
      updatedAt: now
    });

    try {
      const stk = await initiateStkPush({
        phone,
        amountKes,
        accountReference: `AI${paymentId.slice(0, 8)}`,
        transactionDesc: "GeoPram AI Access"
      });

      if (!stk.CheckoutRequestID) {
        await collection.updateOne(
          { _id: paymentId },
          { $set: { status: "FAILED", resultDesc: stk.ResponseDescription || "No CheckoutRequestID", updatedAt: new Date() } }
        );
        return NextResponse.json({ error: stk.ResponseDescription || "Could not start M-Pesa payment." }, { status: 502 });
      }

      await collection.updateOne(
        { _id: paymentId },
        {
          $set: {
            merchantRequestID: stk.MerchantRequestID,
            checkoutRequestID: stk.CheckoutRequestID,
            resultDesc: stk.CustomerMessage || stk.ResponseDescription,
            updatedAt: new Date()
          }
        }
      );

      return NextResponse.json({
        paymentId,
        message: stk.CustomerMessage || "Check your phone and enter your M-Pesa PIN."
      });
    } catch (error: any) {
      await collection.updateOne(
        { _id: paymentId },
        { $set: { status: "FAILED", resultDesc: error?.message || "STK initiation failed", updatedAt: new Date() } }
      );
      throw error;
    }
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: "We could not start the payment. Please try again." },
      { status: 500 }
    );
  }
}
