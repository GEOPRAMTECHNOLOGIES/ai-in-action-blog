import { NextResponse } from "next/server";
import { payments } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing payment id." }, { status: 400 });

  try {
    const collection = await payments();
    const payment = await collection.findOne({ _id: id });

    if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

    return NextResponse.json({
      status: payment.status,
      resultCode: payment.resultCode ?? null,
      resultDesc: payment.resultDesc || null,
      accessCode: payment.status === "SUCCESS" ? payment.accessCode : null,
      expiresAt: payment.status === "SUCCESS" ? payment.expiresAt : null
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not read payment status." }, { status: 500 });
  }
}
