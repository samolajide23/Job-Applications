import type { Status } from "@/lib/statuses";

export type Origin = "seed" | "import" | "discovery" | "manual";

export type Eligibility = "eligible" | "ineligible" | "unknown";

export type SeniorityFlag = "junior_mid" | "open" | "experienced" | "senior_skip";

export type ScoreBreakdown = {
  location: number;
  skills: number;
  seniority: number;
  aiPython: number;
  projects: number;
  salary: number;
  company: number;
  practicality: number;
  total: number;
  eligible: Eligibility;
  seniorityFlag: SeniorityFlag;
  reasons: string[];
};

export type Application = {
  id: string;
  url: string;
  company: string;
  title: string;
  source: string;
  status: Status;
  score: number | null;
  scoreBreakdown: ScoreBreakdown | null;
  location: string | null;
  notes: string | null;
  excerpt: string | null;
  tags: string[];
  postedAt: string | null;
  appliedAt: string | null;
  discoveredAt: string | null;
  origin: Origin;
  updatedAt: string;
};

export type QueueRules = {
  autoQueue: boolean;
  minScore: number;
  excludeSenior: boolean;
  eligibleOnly: boolean;
  keywords: string[];
  postedWithinDays: number;
};

export type DayCount = {
  date: string;
  count: number;
};

export type SourceCount = {
  source: string;
  count: number;
};

export type Stats = {
  total: number;
  applied: number;
  submitted: number;
  responses: number;
  responseRate: number | null;
  interviews: number;
  offers: number;
  blocked: number;
  skipped: number;
  needsInput: number;
  bySource: SourceCount[];
  last30Days: DayCount[];
};

/** Stack keywords from Samuel's CV (OR match on title/description). */
export const KEYWORD_PRESETS = [
  "Python",
  "TypeScript",
  "React",
  "Node",
  "full-stack",
  "backend",
  "AWS",
  "Kubernetes",
  "Docker",
  "Django",
  "AI",
  "LLM",
  "machine learning",
  "automation",
  "RAG",
] as const;

export const DEFAULT_RULES: QueueRules = {
  autoQueue: true,
  minScore: 60,
  excludeSenior: true,
  eligibleOnly: true,
  keywords: [...KEYWORD_PRESETS],
  postedWithinDays: 14,
};
