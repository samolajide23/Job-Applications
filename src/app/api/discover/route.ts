import { randomUUID } from "node:crypto";
import { failureResponse, unauthorized } from "@/lib/api";
import { authorize } from "@/lib/auth";
import { pullBoards } from "@/lib/boards";
import { prepareDiscovery } from "@/lib/discover";
import { collapseAliases, insertNew, promoteQueueMatches, readRules } from "@/lib/db";
import type { NewApplication } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function runDiscovery() {
  const rules = await readRules();
  const boards = await pullBoards({ postedWithinDays: rules.postedWithinDays });
  const prepared = prepareDiscovery(
    boards.flatMap((board) => board.jobs),
    rules,
  );
  const rows: NewApplication[] = prepared.accepted.map((job) => ({
    id: randomUUID(),
    url: job.url,
    company: job.company,
    title: job.title,
    source: job.source,
    status: job.status,
    score: job.score,
    scoreBreakdown: job.scoreBreakdown,
    location: job.location,
    notes: null,
    excerpt: job.excerpt,
    tags: job.tags,
    postedAt: job.postedAt,
    appliedAt: null,
    discoveredAt: new Date().toISOString(),
    origin: "discovery",
  }));
  const collapsed = await collapseAliases();
  const inserted = new Set(await insertNew(rows));
  const added = prepared.accepted.filter((job) => inserted.has(job.url));
  const promoted = await promoteQueueMatches();
  const autoQueuedNew = added.filter((job) => job.status === "queued").length;
  return {
    ok: true,
    sources: boards.map((board) => ({
      source: board.source,
      fetched: board.fetched,
      error: board.error,
      ms: board.ms,
    })),
    pulled: prepared.pulled,
    applicable: prepared.accepted.length,
    added: added.length,
    alreadyTracked: prepared.accepted.length - added.length,
    collapsedAliases: collapsed,
    skipped: {
      ineligible: prepared.ineligible,
      notSoftware: prepared.notSoftware,
      tooOld: prepared.tooOld,
      senior: prepared.senior,
      noKeyword: prepared.noKeyword,
    },
    ineligible: prepared.ineligible,
    notSoftware: prepared.notSoftware,
    tooOld: prepared.tooOld,
    senior: prepared.senior,
    noKeyword: prepared.noKeyword,
    autoQueued: autoQueuedNew + promoted,
    promoted,
  };
}

export async function GET(request: Request) {
  if (!(await authorize(request))) return unauthorized();
  try {
    return Response.json(await runDiscovery());
  } catch (error) {
    return failureResponse(error);
  }
}

export async function POST(request: Request) {
  if (!(await authorize(request))) return unauthorized();
  try {
    return Response.json(await runDiscovery());
  } catch (error) {
    return failureResponse(error);
  }
}
