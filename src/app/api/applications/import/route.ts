import { randomUUID } from "node:crypto";
import { failureResponse, jsonError, unauthorized } from "@/lib/api";
import { authorize } from "@/lib/auth";
import { parseHistoryCsv } from "@/lib/csv";
import { createOrUpdate } from "@/lib/db";
import { historyToRow } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await authorize(request))) return unauthorized();
  try {
    const body = (await request.json().catch(() => null)) as { csv?: unknown } | null;
    const csv = typeof body?.csv === "string" ? body.csv : "";
    if (!csv.trim()) return jsonError("Paste CSV text to import.", 400);
    const { records, errors } = parseHistoryCsv(csv);
    let created = 0;
    let updated = 0;
    for (const record of records) {
      const row = historyToRow(record, "import");
      row.id = randomUUID();
      const saved = await createOrUpdate(row, {
        company: true,
        title: true,
        source: true,
        status: true,
        score: record.hasScore,
        location: record.hasLocation,
        notes: record.hasNotes,
        appliedAt: true,
        excerpt: false,
        tags: false,
      });
      if (saved.created) created += 1;
      else updated += 1;
    }
    return Response.json({
      ok: true,
      received: records.length + errors.length,
      imported: records.length,
      created,
      updated,
      errors,
    });
  } catch (error) {
    return failureResponse(error);
  }
}
