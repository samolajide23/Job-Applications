"use client";

import { useState } from "react";
import { StatusSelect } from "@/components/status-select";
import { Button } from "@/components/ui/button";
import { formatAge } from "@/lib/dates";
import type { Application } from "@/lib/types";

const PAGE_SIZE = 60;

export function QueueView({
  applications,
  onPatch,
}: {
  applications: Application[];
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const queued = applications
    .filter((application) => application.status === "queued")
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const paged = queued.slice(0, limit);
  const remaining = queued.length - paged.length;

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-base font-medium">Apply queue</h2>
        <p className="text-sm text-muted-foreground">
          The remote jobs agent should only apply to this list. It reads GET /api/queue, then reports
          applied, skipped, or blocked back on the same row.
        </p>
      </div>
      {queued.length === 0 ? (
        <p className="rounded-xl bg-card/80 px-4 py-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          Nothing is queued. Approve candidates, or turn on auto-queue for new matches at the score floor.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Showing {paged.length} of {queued.length}
          </p>
          <ul className="grid gap-3">
            {paged.map((application) => (
              <li
                key={application.id}
                className="grid gap-3 rounded-xl bg-card/80 p-4 ring-1 ring-foreground/10 sm:grid-cols-[auto_1fr_auto]"
              >
                <span className="font-mono text-lg text-emerald-300 tabular-nums">
                  {application.score ?? "—"}
                </span>
                <div>
                  <p className="font-medium">{application.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {application.company} · {application.source}
                    {application.location ? ` · ${application.location}` : ""}
                    {application.postedAt ? ` · ${formatAge(application.postedAt)}` : ""}
                  </p>
                  <a
                    href={application.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-sm text-primary"
                  >
                    Open listing
                  </a>
                </div>
                <StatusSelect
                  value={application.status}
                  label={`Queue status for ${application.company}`}
                  onChange={(status) => void onPatch(application.id, { status })}
                />
              </li>
            ))}
          </ul>
          {remaining > 0 ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
              >
                Show more ({remaining} left)
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
