import type { Application, Eligibility, ScoreBreakdown, SeniorityFlag } from "@/lib/types";

const EXCERPT_MAX = 280;
const TAG_MAX = 8;

/** Drop heavy scoring payloads before sending lists to the browser. */
export function slimApplication(application: Application): Application {
  const isDiscovered = application.status === "discovered";
  const isPreApply =
    isDiscovered || application.status === "queued" || application.status === "dismissed";

  return {
    ...application,
    // Find jobs needs a short excerpt for keyword filters; tracker/queue do not.
    excerpt: isDiscovered ? truncate(application.excerpt, EXCERPT_MAX) : null,
    // Notes matter after apply; skip them on discovery/queue rows.
    notes: isPreApply ? null : application.notes,
    tags: isDiscovered ? application.tags.slice(0, TAG_MAX) : [],
    // Only Find jobs filters on eligibility / seniority flags.
    scoreBreakdown: isDiscovered ? slimBreakdown(application.scoreBreakdown) : null,
  };
}

export function slimApplications(applications: Application[]): Application[] {
  return applications.map(slimApplication);
}

function slimBreakdown(breakdown: ScoreBreakdown | null): ScoreBreakdown | null {
  if (!breakdown) return null;
  return {
    location: 0,
    skills: 0,
    seniority: 0,
    aiPython: 0,
    projects: 0,
    salary: 0,
    company: 0,
    practicality: 0,
    total: breakdown.total,
    eligible: breakdown.eligible as Eligibility,
    seniorityFlag: breakdown.seniorityFlag as SeniorityFlag,
    reasons: breakdown.reasons.slice(0, 1),
  };
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}
