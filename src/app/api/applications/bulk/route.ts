import { failureResponse, jsonError, unauthorized } from "@/lib/api";
import { authorize } from "@/lib/auth";
import { updateMany } from "@/lib/db";
import { isStatus } from "@/lib/statuses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await authorize(request))) return unauthorized();
  try {
    const body = (await request.json().catch(() => null)) as { ids?: unknown; status?: unknown } | null;
    const status = typeof body?.status === "string" ? body.status.trim().toLowerCase() : "";
    if (!isStatus(status)) return jsonError("A valid status is required.", 400);
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0).slice(0, 200)
      : [];
    if (ids.length === 0) return jsonError("Choose at least one application.", 400);
    const updated = await updateMany(ids, status);
    return Response.json({ ok: true, updated });
  } catch (error) {
    return failureResponse(error);
  }
}
