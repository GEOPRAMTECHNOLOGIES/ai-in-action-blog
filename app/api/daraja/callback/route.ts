import { NextResponse } from "next/server";
import { payments } from "@/lib/db";
import { newAccessCode } from "@/lib/security";
import { sendPaymentEmails } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log("Daraja callback received");

    const stk = payload?.Body?.stkCallback;
    if (!stk?.CheckoutRequestID) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const collection = await payments();
    const payment = await collection.findOne({ checkoutRequestID: stk.CheckoutRequestID });

    // Ignore callbacks we did not initiate. Return 200 so Daraja is not forced to retry.
    if (!payment) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const resultCode = Number(stk.ResultCode);
    const resultDesc = String(stk.ResultDesc || "");
    const now = new Date();

    if (resultCode !== 0) {
      await collection.updateOne(
        { _id: payment._id },
        { $set: { status: "FAILED", resultCode, resultDesc, updatedAt: now } }
      );
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const metadata: any[] = stk.CallbackMetadata?.Item || [];
    const getItem = (name: string) => metadata.find(item => item.Name === name)?.Value;

    const receipt = getItem("MpesaReceiptNumber");
    const amount = getItem("Amount");

    // Idempotency: if already successful, do not issue a second code or email.
    if (payment.status === "SUCCESS" && payment.accessCode) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const accessCode = newAccessCode();
    const days = Math.max(1, Number(process.env.ACCESS_DAYS || 30));
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    await collection.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: "SUCCESS",
          resultCode,
          resultDesc,
          mpesaReceiptNumber: receipt ? String(receipt) : undefined,
          amountKes: amount ? Number(amount) : payment.amountKes,
          accessCode,
          accessCreatedAt: now,
          expiresAt,
          updatedAt: now
        }
      }
    );

    try {
      await sendPaymentEmails({
        email: payment.email,
        phone: payment.phone,
        amountKes: amount ? Number(amount) : payment.amountKes,
        mpesaReceiptNumber: receipt ? String(receipt) : undefined,
        accessCode,
        expiresAt
      });

      await collection.updateOne(
        { _id: payment._id },
        { $set: { receiptSentAt: new Date(), updatedAt: new Date() } }
      );
    } catch (mailError) {
      // Payment/access is already valid. Log email failure for operational follow-up.
      console.error("Receipt email failed", mailError);
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("Callback processing error", error);
    // Always acknowledge Daraja after parsing a callback to avoid an endless retry loop.
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "GeoPram Daraja callback endpoint" });
}
