import { randomUUID } from "node:crypto";
import { failureResponse, jsonError, parseUpsertBody, unauthorized } from "@/lib/api";
import { authorize } from "@/lib/auth";
import { applicationByUrl, createOrUpdate, loadDashboard } from "@/lib/db";
import type { NewApplication } from "@/lib/repository";
import { isTrackerStatus } from "@/lib/statuses";
import { computeStats } from "@/lib/stats";
import type { Origin } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await authorize(request))) return unauthorized();
  try {
    const { applications, rules } = await loadDashboard();
    return Response.json({
      applications,
      rules,
      stats: computeStats(applications),
    });
  } catch (error) {
    return failureResponse(error);
  }
}

export async function POST(request: Request) {
  if (!(await authorize(request))) return unauthorized();
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    const items = normalizeBatch(body);
    if (typeof items === "string") return jsonError(items, 400);
    if (items.length === 0) return jsonError("No applications to upsert.", 400);

    const results = [];
    for (const item of items) {
      const parsed = parseUpsertBody(item, "import");
      if (typeof parsed === "string") return jsonError(parsed, 400);
      const existing = await applicationByUrl(parsed.url);
      if (!existing && (!parsed.company || !parsed.title || !parsed.source || !parsed.fields.status)) {
        return jsonError("New rows need company, title, source, and status.", 400);
      }
      const origin = readOrigin(item) ?? (existing ? existing.origin : "import");
      const appliedAt =
        parsed.appliedAt ??
        (!existing && isTrackerStatus(parsed.status) ? new Date().toISOString() : null);
      const row: NewApplication = {
        id: randomUUID(),
        url: parsed.url,
        company: parsed.company || existing?.company || "",
        title: parsed.title || existing?.title || "",
        source: parsed.source || existing?.source || "",
        status: parsed.fields.status ? parsed.status : (existing?.status ?? parsed.status),
        score: parsed.score,
        scoreBreakdown: null,
        location: parsed.location,
        notes: parsed.notes,
        excerpt: parsed.excerpt,
        tags: parsed.tags,
        postedAt: parsed.postedAt,
        appliedAt,
        discoveredAt: null,
        origin,
      };
      const saved = await createOrUpdate(row, parsed.fields);
      results.push(saved);
    }

    if (results.length === 1) {
      return Response.json({
        ok: true,
        created: results[0].created,
        application: results[0].application,
      });
    }
    return Response.json({
      ok: true,
      upserted: results.length,
      created: results.filter((result) => result.created).length,
      updated: results.filter((result) => !result.created).length,
      applications: results.map((result) => result.application),
    });
  } catch (error) {
    return failureResponse(error);
  }
}

function normalizeBatch(body: unknown): Record<string, unknown>[] | string {
  if (Array.isArray(body)) {
    return body.filter((item): item is Record<string, unknown> => isRecord(item));
  }
  if (!isRecord(body)) return "Expected a JSON object or array.";
  if (Array.isArray(body.applications)) {
    return body.applications.filter((item): item is Record<string, unknown> => isRecord(item));
  }
  return [body];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readOrigin(body: Record<string, unknown>): Origin | null {
  const value = body.origin;
  if (value === "seed" || value === "import" || value === "discovery" || value === "manual") return value;
  return null;
}
