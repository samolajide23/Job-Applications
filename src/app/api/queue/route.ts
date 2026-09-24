import { failureResponse, unauthorized } from "@/lib/api";
import { authorize } from "@/lib/auth";
import { loadQueue } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await authorize(request))) return unauthorized();
  try {
    const jobs = await loadQueue();
    return Response.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        url: job.url,
        company: job.company,
        title: job.title,
        source: job.source,
        location: job.location,
        score: job.score,
        scoreBreakdown: job.scoreBreakdown,
        status: job.status,
        notes: job.notes,
        tags: job.tags,
        postedAt: job.postedAt,
        excerpt: job.excerpt,
      })),
    });
  } catch (error) {
    return failureResponse(error);
  }
}
