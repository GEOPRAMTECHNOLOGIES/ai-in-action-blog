import { NextResponse } from "next/server";
import { payments } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Missing payment id." }, { status: 400 });
  try {
    const payment = await (await payments()).findOne({ _id: id });
    if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    return NextResponse.json({
      status: payment.status,
      resultCode: payment.resultCode ?? null,
      resultDesc: payment.resultDesc || null,
      accessCode: payment.status === "SUCCESS" ? payment.accessCode : null,
      expiresAt: payment.status === "SUCCESS" ? payment.expiresAt : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("Payment status failed", error?.message || error);
    return NextResponse.json({ error: "Could not read payment status." }, { status: 500 });
  }
}
