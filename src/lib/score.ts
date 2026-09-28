import { isSeniorTitle } from "@/lib/statuses";
import type { Eligibility, ScoreBreakdown, SeniorityFlag } from "@/lib/types";

export type ScoreInput = {
  title: string;
  company: string;
  location: string | null;
  description: string;
  tags: string[];
  url: string;
  salaryText?: string | null;
  level?: string | null;
};

/** Weighted to Samuel's CV: Python/TS/React/Node full-stack, AWS/K8s, applied ML. */
const SKILL_TERMS: { label: string; pattern: RegExp; points: number }[] = [
  { label: "python", pattern: /\bpython\b/i, points: 6 },
  { label: "typescript", pattern: /\btypescript\b|\bts\b/i, points: 5 },
  { label: "javascript", pattern: /\bjavascript\b/i, points: 4 },
  { label: "react", pattern: /\breact\b/i, points: 4 },
  { label: "node", pattern: /\bnode(?:\.js)?\b/i, points: 4 },
  { label: "full-stack", pattern: /\bfull[- ]?stack\b/i, points: 5 },
  { label: "backend", pattern: /\bback[- ]?end\b/i, points: 4 },
  { label: "aws", pattern: /\baws\b|amazon web services/i, points: 4 },
  { label: "docker", pattern: /\bdocker\b/i, points: 3 },
  { label: "kubernetes", pattern: /\bkubernetes\b|\bk8s\b/i, points: 3 },
  { label: "django", pattern: /\bdjango\b/i, points: 3 },
  { label: "java", pattern: /\bjava\b/i, points: 2 },
  { label: "kotlin", pattern: /\bkotlin\b/i, points: 2 },
  { label: "automation", pattern: /\bautomation\b/i, points: 3 },
  { label: "api", pattern: /\bapis?\b/i, points: 3 },
  { label: "next.js", pattern: /\bnext\.?js\b/i, points: 3 },
  { label: "sql", pattern: /\b(postgres|sql)\b/i, points: 2 },
  { label: "mongo", pattern: /\bmongo(?:db)?\b/i, points: 2 },
];

const AI_PATTERN =
  /\b(llm|genai|gen ai|generative ai|rag|machine learning|\bml\b|langchain|mcp|\bgpt\b|openai|tensorflow|nlp|computer vision|\bai\b)\b/i;
const PROJECT_TERMS: { label: string; pattern: RegExp }[] = [
  { label: "rag", pattern: /\brag\b/i },
  { label: "automation", pattern: /\bautomation\b/i },
  { label: "api", pattern: /\bapis?\b/i },
  { label: "llm", pattern: /\bllm\b/i },
  { label: "react", pattern: /\breact\b/i },
  { label: "typescript", pattern: /\btypescript\b/i },
  { label: "web app", pattern: /\bweb apps?\b/i },
  { label: "aws", pattern: /\baws\b/i },
  { label: "kubernetes", pattern: /\bkubernetes\b|\bk8s\b/i },
  { label: "tensorflow", pattern: /\btensorflow\b/i },
];

type GeoResult = {
  points: number;
  eligible: Eligibility;
  reason: string;
};

export function scoreJob(input: ScoreInput): ScoreBreakdown {
  const description = input.description ?? "";
  const tags = input.tags.join(" ");
  const blob = `${input.title}\n${tags}\n${description}\n${input.salaryText ?? ""}\n${input.location ?? ""}`;
  const skillBlob = `${input.title}\n${tags}\n${description}`;
  const location = evaluateLocation(input.location ?? "", blob);
  const skills = scoreSkills(skillBlob);
  const seniority = scoreSeniority(input.title, input.level ?? "", skillBlob);
  const aiPython = scoreAiPython(skillBlob);
  const projects = scoreProjects(skillBlob);
  const salary = scoreSalary(`${input.salaryText ?? ""}\n${description}`);
  const company = scoreCompany(input.company);
  const practicality = scorePracticality(input.url);
  const parts = {
    location: location.points,
    skills: skills.points,
    seniority: seniority.points,
    aiPython: aiPython.points,
    projects: projects.points,
    salary: salary.points,
    company: company.ineligible ? 0 : company.points,
    practicality: practicality.points,
  };
  const eligible: Eligibility = company.ineligible ? "ineligible" : location.eligible;
  const reasons = [
    location.reason,
    seniority.reason,
    skills.reason,
    aiPython.reason,
    projects.reason,
    salary.reason,
    company.reason,
    practicality.reason,
  ].filter((reason) => reason.length > 0);

  return {
    ...parts,
    total: Object.values(parts).reduce((sum, value) => sum + value, 0),
    eligible,
    seniorityFlag: seniority.flag,
    reasons,
  };
}

function scoreSkills(blob: string): { points: number; reason: string } {
  const matched = SKILL_TERMS.filter((term) => term.pattern.test(blob));
  const points = Math.min(25, matched.reduce((sum, term) => sum + term.points, 0));
  if (matched.length === 0) {
    return { points: 0, reason: "No stack terms from the profile list found in the listing." };
  }
  return { points, reason: `Skills mentioned: ${matched.map((term) => term.label).join(", ")}.` };
}

function scoreSeniority(
  title: string,
  level: string,
  blob: string,
): { points: number; flag: SeniorityFlag; reason: string } {
  const levelText = level.toLowerCase();
  const titleTooSenior = isSeniorTitle(title);
  const levelTooSenior = /\b(staff|principal|director|head|vp|manager)\b/.test(levelText);
  const levelJunior = /junior|entry|midweight|mid-level|associate|intermediate/.test(levelText);
  const levelSeniorBand = /\b(senior|lead)\b/.test(levelText);
  const levelOpen = /\bany\b/.test(levelText);
  const titleSeniorBand = /\b(senior|sr\.?|lead)\b/i.test(title);

  if (titleTooSenior || (levelTooSenior && !/\b(junior|associate|intermediate)\b/i.test(title))) {
    const why = titleTooSenior
      ? "Title is above the Senior/Lead band (staff/principal/director/manager)."
      : `Listing level is ${level}.`;
    return { points: 0, flag: "senior_skip", reason: why };
  }
  if (levelJunior) {
    return { points: 12, flag: "junior_mid", reason: `Listing level is ${level}.` };
  }
  if (titleSeniorBand || levelSeniorBand) {
    return {
      points: 15,
      flag: "experienced",
      reason: "Senior/Lead band matches a Lead SE with 5+ years.",
    };
  }
  const years = yearsRequired(blob);
  if (years !== null && years >= 8) {
    return {
      points: 4,
      flag: "experienced",
      reason: `Listing asks for about ${years}+ years — stretch vs 5+ on the CV.`,
    };
  }
  if (years !== null && years >= 4) {
    return {
      points: 14,
      flag: "experienced",
      reason: `Listing asks for about ${years} years — in band for this CV.`,
    };
  }
  if (years !== null && years >= 2) {
    return {
      points: 12,
      flag: "experienced",
      reason: `Listing mentions about ${years} years.`,
    };
  }
  if (levelOpen) {
    return { points: 12, flag: "open", reason: "Listing level is Any." };
  }
  if (/\bintern|trainee|apprentice\b/i.test(title)) {
    return { points: 4, flag: "junior_mid", reason: "Title looks intern or trainee — likely under-level." };
  }
  return { points: 13, flag: "junior_mid", reason: "Open mid-level software title." };
}

function yearsRequired(blob: string): number | null {
  const range = /(\d+)\s*[-–to]{1,3}\s*(\d+)\s*(?:\+?\s*)?(?:years|yrs)/i.exec(blob);
  if (range) return Number(range[1]);
  const single = /(\d+)\s*\+?\s*(?:years|yrs)/i.exec(blob);
  if (single) return Number(single[1]);
  return null;
}

function scoreAiPython(blob: string): { points: number; reason: string } {
  const hasPython = /\bpython\b/i.test(blob);
  const hasAi = AI_PATTERN.test(blob);
  if (!hasPython && !hasAi) {
    return { points: 0, reason: "No Python or AI/LLM terms in the listing." };
  }
  const points = Math.min(15, (hasPython ? 8 : 0) + (hasAi ? 8 : 0));
  const bits = [hasPython ? "python" : null, hasAi ? "AI/LLM" : null].filter(Boolean);
  return { points, reason: `AI/Python evidence: ${bits.join(" and ")}.` };
}

function scoreProjects(blob: string): { points: number; reason: string } {
  const matched = PROJECT_TERMS.filter((term) => term.pattern.test(blob));
  if (matched.length === 0) {
    return { points: 0, reason: "No project-overlap terms in the listing." };
  }
  return {
    points: Math.min(10, matched.length * 2),
    reason: `Project overlap: ${matched.map((term) => term.label).join(", ")}.`,
  };
}

function scoreSalary(blob: string): { points: number; reason: string } {
  const amounts = extractAmounts(blob);
  if (amounts.length === 0) return { points: 0, reason: "No salary listed." };
  const overlapping = amounts.some((amount) => overlapsBand(amount));
  const above = amounts.every((amount) => amount.min > bandMax(amount.currency));
  if (overlapping) return { points: 5, reason: "Listed pay overlaps the €55–80k ask." };
  if (above) return { points: 0, reason: "Listed pay sits above the €55–80k band." };
  return { points: 2, reason: "Salary is listed but does not overlap €55–80k." };
}

type Amount = { currency: "EUR" | "GBP" | "USD"; min: number; max: number };

function extractAmounts(blob: string): Amount[] {
  const amounts: Amount[] = [];
  const pattern =
    /(€|£|\$|eur|gbp|usd)\s?(\d{1,3}(?:,\d{3})+|\d{2,6})(\s?k)?(?:\s*[-–to]{1,3}\s*(?:€|£|\$|eur|gbp|usd)?\s?(\d{1,3}(?:,\d{3})+|\d{2,6})(\s?k)?)?/gi;
  for (const match of blob.matchAll(pattern)) {
    const currency = currencyOf(match[1]);
    if (!currency) continue;
    const min = scale(match[2], Boolean(match[3]));
    const max = match[4] ? scale(match[4], Boolean(match[5] || match[3])) : min;
    if (min >= 20000) amounts.push({ currency, min: Math.min(min, max), max: Math.max(min, max) });
  }
  return amounts;
}

function currencyOf(token: string): Amount["currency"] | null {
  const value = token.toLowerCase();
  if (value === "€" || value === "eur") return "EUR";
  if (value === "£" || value === "gbp") return "GBP";
  if (value === "$" || value === "usd") return "USD";
  return null;
}

function scale(raw: string, thousands: boolean): number {
  const digits = Number(raw.replace(/[.,]/g, ""));
  if (thousands || digits < 1000) return digits * 1000;
  return digits;
}

function bandMax(currency: Amount["currency"]): number {
  if (currency === "GBP") return 75_000;
  if (currency === "USD") return 100_000;
  return 85_000;
}

function overlapsBand(amount: Amount): boolean {
  // Lead SE, 5+ years, Ireland — mid/senior remote band, not junior €45–60k.
  const [min, max] =
    amount.currency === "GBP"
      ? [45_000, 75_000]
      : amount.currency === "USD"
        ? [60_000, 100_000]
        : [50_000, 85_000];
  return amount.max >= min && amount.min <= max;
}

function scoreCompany(company: string): { points: number; reason: string; ineligible: boolean } {
  if (!company.trim()) return { points: 0, reason: "Company name is blank.", ineligible: false };
  if (/\bceriga\b/i.test(company)) {
    return { points: 0, reason: "Ceriga is skipped by policy.", ineligible: true };
  }
  return { points: 5, reason: "Named company. No extra company-fit assumed.", ineligible: false };
}

function scorePracticality(url: string): { points: number; reason: string } {
  if (/ashbyhq\.com|greenhouse\.io|lever\.co|myworkdayjobs\.com|workable\.com|smartrecruiters\.com/i.test(url)) {
    return { points: 5, reason: "Direct ATS link." };
  }
  if (/linkedin\.com/i.test(url)) return { points: 1, reason: "LinkedIn listing." };
  if (/^https?:\/\//i.test(url)) return { points: 3, reason: "Board listing with an apply link." };
  return { points: 0, reason: "No usable URL." };
}

function evaluateLocation(location: string, blob: string): GeoResult {
  const place = location.replace(/\s+/g, " ").trim();
  const placeAndPolicy = `${place}\n${blob.slice(0, 1500)}`;
  const fullyRemote = /\b(fully remote|100% remote|remote-only|remote only|no hybrid|not hybrid)\b/i.test(
    placeAndPolicy,
  );
  const hybrid = /\b(hybrid|on-?site|in[- ]office)\b/i.test(placeAndPolicy);
  const mentionsRemote = /\bremote\b/i.test(placeAndPolicy);
  if (hybrid && !fullyRemote && !mentionsRemote) {
    return {
      points: 0,
      eligible: "ineligible",
      reason: "Hybrid or onsite is mentioned, without a remote allowance.",
    };
  }
  if (/\b(relocation required|must relocate)\b/i.test(placeAndPolicy) && !mentionsRemote) {
    return { points: 0, eligible: "ineligible", reason: "Relocation is required." };
  }
  if (/\b(exclude|excluding|except)\b[^.]{0,48}\b(ireland|eu|europe|eea)\b/i.test(placeAndPolicy)) {
    return { points: 0, eligible: "ineligible", reason: "Listing excludes Ireland or the EU." };
  }

  const ireland = /\b(ireland|irish|dublin|dundalk)\b/i.test(place);
  const europe = /\b(europe|european|eea|emea|eurozone|\beu\b)\b/i.test(place);
  const worldwide = /\b(anywhere|worldwide|world wide|global)\b/i.test(place);
  const uk = /\b(united kingdom|\buk\b|u\.k\.|london|britain)\b/i.test(place);
  const explicitIrelandInCopy = /\b(open to ireland|based in ireland|remote from ireland|ireland-based|eu citizens|anywhere in the eu)\b/i.test(
    blob,
  );
  const usMarker =
    /\b(usa|u\.s\.a\.|united states|north america only|us only|u\.s\. only|\bus\b|u\.s\.)\b/i.test(place) ||
    /\b(san francisco|new york|nyc|chicago|seattle|austin|boston|denver|atlanta|los angeles|toronto|canada)\b/i.test(
      place,
    );
  const usOnly = usMarker && !ireland && !europe && !worldwide && !uk && !explicitIrelandInCopy;
  const regionBlocked =
    /\b(apac only|latam only|americas only)\b/i.test(place) && !europe && !ireland;

  if (usOnly || regionBlocked) {
    return {
      points: 0,
      eligible: "ineligible",
      reason: `Location “${place || "unspecified"}” does not include Ireland or the EU.`,
    };
  }
  if (ireland || explicitIrelandInCopy) {
    return { points: 20, eligible: "eligible", reason: "Ireland or an EU-citizen allowance is stated." };
  }
  if (europe) {
    return { points: 18, eligible: "eligible", reason: "Europe, EU, EEA, or EMEA is named." };
  }
  if (uk && /\b(ireland|\beu\b|europe|eea)\b/i.test(placeAndPolicy)) {
    return { points: 18, eligible: "eligible", reason: "UK listing also allows Ireland or the EU." };
  }
  if (uk) {
    return { points: 6, eligible: "unknown", reason: "UK is listed without an Ireland allowance." };
  }
  if (worldwide) {
    return {
      points: 14,
      eligible: "eligible",
      reason: "Geo says anywhere or worldwide, and Ireland/EU is not excluded.",
    };
  }
  const remotePlace = /\bremote\b/i.test(place);
  const nonEuRemoteOnly =
    remotePlace &&
    /\b(india|bangalore|bengaluru|apac|latam|brazil|nigeria|pakistan|philippines|mexico)\b/i.test(place) &&
    !europe &&
    !ireland &&
    !uk;
  if (nonEuRemoteOnly) {
    return {
      points: 4,
      eligible: "unknown",
      reason: `Remote listing is tied to “${place}” outside Ireland/EU.`,
    };
  }
  if (remotePlace) {
    return {
      points: 14,
      eligible: "eligible",
      reason: "Remote listing without a US-only or Ireland/EU exclusion.",
    };
  }
  if (place) {
    return {
      points: 8,
      eligible: "unknown",
      reason: `Location is “${place}” without an Ireland or EU-wide allowance.`,
    };
  }
  return { points: 0, eligible: "unknown", reason: "No location text to judge eligibility." };
}
