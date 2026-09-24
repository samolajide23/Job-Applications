export function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerpt(value: string, max = 1200): string {
  const clean = stripHtml(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const tag of tags) {
    const value = tag.replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(value.slice(0, 40));
    if (cleaned.length >= 15) break;
  }
  return cleaned;
}

export function extractAtsUrl(value: string): string | null {
  const matches = value.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  const found = matches.find((url) =>
    /ashbyhq\.com|greenhouse\.io|boards\.greenhouse\.io|lever\.co|myworkdayjobs\.com|workable\.com|smartrecruiters\.com/i.test(
      url,
    ),
  );
  if (!found) return null;
  return found.replace(/[),.;]+$/, "");
}
