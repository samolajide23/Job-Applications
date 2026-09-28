import { isSeniorTitle } from "@/lib/statuses";
import type { Application, Eligibility, QueueRules, SeniorityFlag } from "@/lib/types";

function normalizeKeywordText(value: string): string {
  return value.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function matchesKeywords(application: Pick<Application, "title" | "company" | "tags" | "excerpt" | "location" | "notes">, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = normalizeKeywordText(
    [
      application.title,
      application.company,
      application.tags.join(" "),
      application.excerpt ?? "",
      application.location ?? "",
      application.notes ?? "",
    ].join("\n"),
  );
  return keywords.some((keyword) => {
    const needle = normalizeKeywordText(keyword);
    if (!needle) return false;
    if (haystack.includes(needle)) return true;
    // "full-stack" ↔ "fullstack"
    if (needle.includes(" ")) return haystack.includes(needle.replace(/\s+/g, ""));
    return false;
  });
}

export function roleIsSenior(application: Pick<Application, "title" | "scoreBreakdown">): boolean {
  if (application.scoreBreakdown?.seniorityFlag === "senior_skip") return true;
  if (application.scoreBreakdown) return false;
  return isSeniorTitle(application.title);
}

export function withinPostedWindow(application: Application, days: number, now: Date = new Date()): boolean {
  if (days <= 0) return true;
  // Open ATS boards only list currently open roles — publishedAt is not a cutoff.
  if (application.source === "Greenhouse" || application.source === "Ashby" || application.source === "Lever") {
    return true;
  }
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
