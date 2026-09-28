import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Password login is disabled — the dashboard is open. */
export async function POST() {
  return NextResponse.json({ ok: true, open: true });
}
