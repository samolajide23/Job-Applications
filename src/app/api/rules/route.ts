import { failureResponse, jsonError, parseRules, unauthorized } from "@/lib/api";
import { authorize } from "@/lib/auth";
import { readRules, writeRules } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await authorize(request))) return unauthorized();
  try {
    return Response.json({ rules: await readRules() });
  } catch (error) {
    return failureResponse(error);
  }
}

export async function PATCH(request: Request) {
  if (!(await authorize(request))) return unauthorized();
  try {
    const body = await request.json().catch(() => null);
    const rules = parseRules(body);
    if (typeof rules === "string") return jsonError(rules, 400);
    return Response.json({ ok: true, rules: await writeRules(rules) });
  } catch (error) {
    return failureResponse(error);
  }
}
