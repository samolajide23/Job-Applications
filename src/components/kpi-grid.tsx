import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Stats } from "@/lib/types";

function percent(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function KpiGrid({ stats }: { stats: Stats }) {
  const cards = [
    { label: "Total", value: String(stats.total), hint: "Logged applications" },
    { label: "Applied", value: String(stats.applied), hint: "Still waiting" },
    {
      label: "Response rate",
      value: percent(stats.responseRate),
      hint: `${stats.responses} of ${stats.submitted} submitted`,
    },
    { label: "Interviews", value: String(stats.interviews), hint: "Including finals" },
    { label: "Offers", value: String(stats.offers), hint: "Open offers" },
    { label: "Blocked", value: String(stats.blocked), hint: "Captcha, OTP, walls" },
    { label: "Skipped", value: String(stats.skipped), hint: "Out of scope" },
    { label: "Needs input", value: String(stats.needsInput), hint: "Waiting on you" },
  ];

  return (
    <section aria-label="Application totals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} size="sm" className="bg-card/80">
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums tracking-tight">{card.value}</CardTitle>
            <p className="text-xs text-muted-foreground">{card.hint}</p>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}
