import { STATUS_GROUPS, STATUS_LABELS, type Status } from "@/lib/statuses";

const TONE: Record<Status, string> = {
  discovered: "bg-slate-400/10 text-slate-200",
  queued: "bg-amber-400/15 text-amber-100",
  dismissed: "bg-zinc-400/10 text-zinc-300",
  applied: "bg-sky-400/15 text-sky-100",
  skipped: "bg-zinc-400/15 text-zinc-200",
  blocked: "bg-rose-400/15 text-rose-100",
  needs_input: "bg-orange-400/15 text-orange-100",
  assessment: "bg-violet-400/15 text-violet-100",
  recruiter_contacted: "bg-cyan-400/15 text-cyan-100",
  interview: "bg-emerald-400/15 text-emerald-100",
  final_interview: "bg-emerald-300/20 text-emerald-50",
  rejected: "bg-red-400/15 text-red-100",
  withdrawn: "bg-stone-400/15 text-stone-200",
  offer: "bg-lime-300/20 text-lime-100",
  no_response: "bg-slate-400/10 text-slate-300",
};

export function StatusSelect({
  value,
  label,
  disabled,
  trackerOnly = false,
  onChange,
}: {
  value: Status;
  label: string;
  disabled?: boolean;
  /** Hide Find jobs / Queue statuses when editing tracker rows. */
  trackerOnly?: boolean;
  onChange: (status: Status) => void;
}) {
  const groups = trackerOnly
    ? STATUS_GROUPS.filter((group) => group.label !== "Review")
    : STATUS_GROUPS;

  return (
    <select
      aria-label={label}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value as Status)}
      className={`h-8 max-w-full rounded-lg border border-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${TONE[value]}`}
    >
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.statuses.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
