import { formatLondonDay } from "@/lib/dates";
import type { DayCount, SourceCount } from "@/lib/types";

export function ActivityChart({ days }: { days: DayCount[] }) {
  const peak = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const busiest = days.reduce((best, day) => (day.count > best.count ? day : best), days[0]);

  return (
    <section className="rounded-xl bg-card/80 p-4 ring-1 ring-foreground/10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Last 30 days</h2>
        <p className="text-xs text-muted-foreground">{total} logged in Europe/London</p>
      </div>
      <div
        className="flex h-36 items-end gap-1"
        role="img"
        aria-label={`Applications over the last 30 days. Busiest day ${busiest ? formatLondonDay(busiest.date) : "none"} with ${busiest?.count ?? 0}.`}
      >
        {days.map((day) => (
          <div key={day.date} className="flex h-full flex-1 flex-col justify-end">
            <div
              title={`${formatLondonDay(day.date)}: ${day.count}`}
              className="w-full rounded-sm bg-primary/80"
              style={{ height: `${Math.max(day.count === 0 ? 2 : 8, (day.count / peak) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>{days[0] ? formatLondonDay(days[0].date) : ""}</span>
        <span>{days.at(-1) ? formatLondonDay(days.at(-1)?.date ?? "") : ""}</span>
      </div>
    </section>
  );
}

export function SourceBars({ sources }: { sources: SourceCount[] }) {
  const peak = Math.max(1, ...sources.map((source) => source.count));
  return (
    <section className="rounded-xl bg-card/80 p-4 ring-1 ring-foreground/10">
      <h2 className="mb-3 text-sm font-medium">By source</h2>
      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">No logged applications yet.</p>
      ) : (
        <ul className="space-y-2">
          {sources.map((source) => (
            <li key={source.source}>
              <div className="mb-1 flex justify-between text-xs">
                <span>{source.source}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{source.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${(source.count / peak) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
