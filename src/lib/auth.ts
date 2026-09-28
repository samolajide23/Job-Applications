export const SESSION_COOKIE = "job_apps_session";

export type AuthKind = "public" | "sync" | "cron";

/** Dashboard password gate is disabled — the UI is open. */
export function passwordConfigured(): boolean {
  return false;
}

export async function isAuthed(): Promise<boolean> {
  return true;
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return (request.headers.get("x-sync-token") ?? "").trim();
}

function safeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

/**
 * Browser access is open. SYNC_TOKEN / CRON_SECRET still identify the apply agent and cron.
 */
export async function authorize(request: Request): Promise<AuthKind | null> {
  const token = bearer(request);
  const sync = process.env.SYNC_TOKEN ?? "";
  const cron = process.env.CRON_SECRET ?? "";
  if (token && sync && safeEqual(token, sync)) return "sync";
  if (token && cron && safeEqual(token, cron)) return "cron";
  return "public";
}
