import type { Stats } from "@/lib/types";

function percent(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function KpiGrid({ stats }: { stats: Stats }) {
  const cards = [
    {
      label: "Waiting",
      value: String(stats.applied),
      hint: "Applied, no reply yet",
    },
    {
      label: "Moving",
      value: String(stats.moving),
      hint: "Interview, assessment, recruiter",
    },
    {
      label: "Offers",
      value: String(stats.offers),
      hint: "Open offers",
    },
    {
      label: "Reply rate",
      value: percent(stats.responseRate),
      hint: `${stats.responses} replies / ${stats.submitted} sent`,
    },
  ];

  return (
    <section aria-label="Application summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl px-4 py-3 ring-1 ring-foreground/10">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className="mt-1 font-mono text-2xl tabular-nums tracking-tight">{card.value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{card.hint}</p>
        </div>
      ))}
    </section>
  );
}
