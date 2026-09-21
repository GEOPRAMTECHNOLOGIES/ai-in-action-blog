import { NextResponse } from "next/server";
import { payments } from "@/lib/db";
import { newAccessCode } from "@/lib/security";
import { sendPaymentEmails } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const stk = payload?.Body?.stkCallback;
    if (!stk?.CheckoutRequestID) return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });

    const collection = await payments();
    const payment = await collection.findOne({ checkoutRequestId: String(stk.CheckoutRequestID) });
    if (!payment) return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });

    const resultCode = Number(stk.ResultCode);
    const resultDesc = String(stk.ResultDesc || "");
    const now = new Date();

    if (resultCode !== 0) {
      const cancelled = resultCode === 1032 || /cancel/i.test(resultDesc);
      await collection.updateOne({ _id: payment._id }, { $set: { status: cancelled ? "CANCELLED" : "FAILED", resultCode, resultDesc, updatedAt: now } });
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    // Idempotent: a repeated successful callback never creates a second access code.
    if (payment.status === "SUCCESS" && payment.accessCode) return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });

    const items: any[] = stk.CallbackMetadata?.Item || [];
    const value = (name: string) => items.find(item => item.Name === name)?.Value;
    const receipt = value("MpesaReceiptNumber");
    const amount = value("Amount");
    const days = Math.max(1, Number(process.env.ACCESS_DAYS || 30));
    const expiresAt = new Date(now.getTime() + days * 86400000);
    const accessCode = newAccessCode();

    await collection.updateOne({ _id: payment._id }, { $set: {
      status: "SUCCESS", resultCode, resultDesc,
      mpesaReceiptNumber: receipt ? String(receipt) : undefined,
      amountKes: amount ? Number(amount) : payment.amountKes,
      accessCode, accessCreatedAt: now, expiresAt, updatedAt: now,
    }});

    try {
      await sendPaymentEmails({
        email: payment.email,
        phone: payment.phone,
        amountKes: amount ? Number(amount) : payment.amountKes,
        mpesaReceiptNumber: receipt ? String(receipt) : undefined,
        accessCode,
        expiresAt,
      });
      await collection.updateOne({ _id: payment._id }, { $set: { receiptSentAt: new Date(), updatedAt: new Date() } });
    } catch (mailError) {
      console.error("Receipt email failed", mailError);
    }
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error: any) {
    console.error("Callback processing error", error?.message || error);
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "geopram-mpesa-callback", status: "READY" });
}
