import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const amountKes = Number(process.env.PAYMENT_AMOUNT_KES || 0);
  return NextResponse.json({ amountKes: Number.isFinite(amountKes) ? Math.round(amountKes) : 0 }, { headers: { "Cache-Control": "no-store" } });
}
