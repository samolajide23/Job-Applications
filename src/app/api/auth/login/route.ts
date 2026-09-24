import { NextResponse } from "next/server";
import { cookieOptions, passwordConfigured, safeEqual, SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!passwordConfigured()) {
    return jsonError("Dashboard password is not configured. Set DASHBOARD_PASSWORD and restart.", 503);
  }
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const expected = process.env.DASHBOARD_PASSWORD ?? "";
  if (!password || !safeEqual(password, expected)) {
    return jsonError("That password doesn't match.", 401);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, sessionToken(expected), cookieOptions());
  return response;
}
