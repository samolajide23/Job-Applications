import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "job_apps_session";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function passwordConfigured(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

export function sessionToken(password: string): string {
  return createHmac("sha256", password).update("job-applications-dashboard-v1").digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export function cookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function isAuthed(): Promise<boolean> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return false;
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  if (!value) return false;
  return safeEqual(value, sessionToken(password));
}

export type AuthKind = "session" | "sync" | "cron";

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return (request.headers.get("x-sync-token") ?? "").trim();
}

export async function authorize(request: Request): Promise<AuthKind | null> {
  const token = bearer(request);
  const sync = process.env.SYNC_TOKEN ?? "";
  const cron = process.env.CRON_SECRET ?? "";
  if (token && sync && safeEqual(token, sync)) return "sync";
  if (token && cron && safeEqual(token, cron)) return "cron";
  if (await isAuthed()) return "session";
  return null;
}
