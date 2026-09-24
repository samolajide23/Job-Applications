import { last30DayKeys, londonDateKey } from "@/lib/dates";
import {
  RESPONSE_STATUSES,
  SUBMITTED_STATUSES,
  isTrackerStatus,
} from "@/lib/statuses";
import type { Application, Stats } from "@/lib/types";

export function computeStats(applications: Application[], now: Date = new Date()): Stats {
  const tracked = applications.filter((application) => isTrackerStatus(application.status));
  const count = (status: Application["status"]) =>
    tracked.filter((application) => application.status === status).length;
  const submitted = tracked.filter((application) =>
    SUBMITTED_STATUSES.includes(application.status),
  ).length;
  const responses = tracked.filter((application) =>
    RESPONSE_STATUSES.includes(application.status),
  ).length;
  const interviews = count("interview") + count("final_interview");
  const keys = last30DayKeys(now);
  const keySet = new Set(keys);
  const dayCounts = new Map(keys.map((key) => [key, 0]));
  for (const application of tracked) {
    if (!application.appliedAt) continue;
    const key = londonDateKey(application.appliedAt);
    if (keySet.has(key)) dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }
  const sources = new Map<string, number>();
  for (const application of tracked) {
    sources.set(application.source, (sources.get(application.source) ?? 0) + 1);
  }

  return {
    total: tracked.length,
    applied: count("applied"),
    submitted,
    responses,
    responseRate: submitted === 0 ? null : responses / submitted,
    interviews,
    offers: count("offer"),
    blocked: count("blocked"),
    skipped: count("skipped"),
    needsInput: count("needs_input"),
    bySource: [...sources.entries()]
      .map(([source, sourceCount]) => ({ source, count: sourceCount }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
    last30Days: keys.map((date) => ({ date, count: dayCounts.get(date) ?? 0 })),
  };
}
