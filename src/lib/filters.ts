import { isSeniorTitle } from "@/lib/statuses";
import type { Application, Eligibility, QueueRules, SeniorityFlag } from "@/lib/types";

export function matchesKeywords(application: Pick<Application, "title" | "company" | "tags" | "excerpt" | "location" | "notes">, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = [
    application.title,
    application.company,
    application.tags.join(" "),
    application.excerpt ?? "",
    application.location ?? "",
    application.notes ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.trim().toLowerCase()));
}

export function roleIsSenior(application: Pick<Application, "title" | "scoreBreakdown">): boolean {
  if (application.scoreBreakdown?.seniorityFlag === "senior_skip") return true;
  if (application.scoreBreakdown) return false;
  return isSeniorTitle(application.title);
}

export function withinPostedWindow(application: Application, days: number, now: Date = new Date()): boolean {
  if (days <= 0) return true;
  // Greenhouse boards only list currently open roles — first_published is not a cutoff.
  if (application.source === "Greenhouse") return true;
  const stamp = application.postedAt ?? application.discoveredAt ?? application.appliedAt;
  if (!stamp) return true;
  const age = now.getTime() - new Date(stamp).getTime();
  return age <= days * 86_400_000;
}

export function shouldAutoQueue(
  rules: QueueRules,
  input: {
    total: number;
    eligible: Eligibility;
    seniorityFlag: SeniorityFlag;
    haystack: string;
  },
): boolean {
  if (!rules.autoQueue) return false;
  if (input.total < rules.minScore) return false;
  if (rules.excludeSenior && input.seniorityFlag === "senior_skip") return false;
  // Keep blocked geos out of the apply queue; unknown (e.g. UK) can still be reviewed.
  if (rules.eligibleOnly && input.eligible === "ineligible") return false;
  if (rules.keywords.length > 0) {
    const haystack = input.haystack.toLowerCase();
    const matched = rules.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
    if (!matched) return false;
  }
  return true;
}
