import { failureResponse, jsonError, unauthorized } from "@/lib/api";
import { authorize } from "@/lib/auth";
import { updateApplication } from "@/lib/db";
import type { Patch } from "@/lib/repository";
import { isStatus } from "@/lib/statuses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await authorize(request))) return unauthorized();
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return jsonError("Expected a JSON object.", 400);
    const patch: Patch = {};
    if (typeof body.status === "string") {
      const status = body.status.trim().toLowerCase();
      if (!isStatus(status)) return jsonError(`Unknown status “${status}”.`, 400);
      patch.status = status;
    }
    if ("notes" in body) {
      if (body.notes !== null && typeof body.notes !== "string") return jsonError("Notes must be a string.", 400);
      patch.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 4000) : null;
    }
    if ("score" in body) {
      if (body.score === null || body.score === "") patch.score = null;
      else {
        const score = Number(body.score);
        if (!Number.isInteger(score) || score < 0 || score > 100) {
          return jsonError("Score must be a whole number from 0 to 100.", 400);
        }
        patch.score = score;
      }
    }
    if ("location" in body) {
      if (body.location !== null && typeof body.location !== "string") {
        return jsonError("Location must be a string.", 400);
      }
      patch.location = typeof body.location === "string" && body.location.trim() ? body.location.trim().slice(0, 200) : null;
    }
    if (typeof body.company === "string" && body.company.trim()) patch.company = body.company.trim().slice(0, 200);
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 300);
    if (typeof body.source === "string" && body.source.trim()) patch.source = body.source.trim().slice(0, 80);
    if (Object.keys(patch).length === 0) return jsonError("No fields to update.", 400);
    const application = await updateApplication(id, patch);
    if (!application) return jsonError("Application not found.", 404);
    return Response.json({ ok: true, application });
  } catch (error) {
    return failureResponse(error);
  }
}
