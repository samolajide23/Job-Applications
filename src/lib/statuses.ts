export const STATUSES = [
  "discovered",
  "queued",
  "dismissed",
  "applied",
  "skipped",
  "blocked",
  "needs_input",
  "assessment",
  "recruiter_contacted",
  "interview",
  "final_interview",
  "rejected",
  "withdrawn",
  "offer",
  "no_response",
] as const;

export type Status = (typeof STATUSES)[number];

export const CANDIDATE_STATUSES = ["discovered", "queued", "dismissed"] as const;

export const TRACKER_STATUSES: Status[] = STATUSES.filter(
  (status) => !(CANDIDATE_STATUSES as readonly string[]).includes(status),
);

export const SUBMITTED_STATUSES: Status[] = [
  "applied",
  "assessment",
  "recruiter_contacted",
  "interview",
  "final_interview",
  "rejected",
  "withdrawn",
  "offer",
  "no_response",
];

export const RESPONSE_STATUSES: Status[] = [
  "rejected",
  "interview",
  "final_interview",
  "offer",
  "recruiter_contacted",
];

export const STATUS_LABELS: Record<Status, string> = {
  discovered: "Discovered",
  queued: "Queued",
  dismissed: "Passed",
  applied: "Applied",
  skipped: "Skipped",
  blocked: "Blocked",
  needs_input: "Needs input",
  assessment: "Assessment",
  recruiter_contacted: "Recruiter",
  interview: "Interview",
  final_interview: "Final interview",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  offer: "Offer",
  no_response: "No response",
};

export const STATUS_GROUPS: { label: string; statuses: Status[] }[] = [
  { label: "Review", statuses: ["discovered", "queued", "dismissed"] },
  {
    label: "Application",
    statuses: ["applied", "skipped", "blocked", "needs_input"],
  },
  {
    label: "Pipeline",
    statuses: [
      "assessment",
      "recruiter_contacted",
      "interview",
      "final_interview",
      "offer",
      "rejected",
      "withdrawn",
      "no_response",
    ],
  },
];

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export function isTrackerStatus(status: Status): boolean {
  return !(CANDIDATE_STATUSES as readonly string[]).includes(status);
}

export function isSeniorTitle(title: string): boolean {
  if (/\bjunior\b/i.test(title) && /\b(senior|sr\.?)\b/i.test(title)) {
    return false;
  }
  return /\b(senior|sr\.?|staff|principal|lead|director|head of|head|vp|vice president|manager)\b/i.test(
    title,
  );
}
