"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toLondonInputValue } from "@/lib/dates";
import { STATUS_GROUPS, STATUS_LABELS, type Status } from "@/lib/statuses";

export type NewRowInput = {
  company: string;
  title: string;
  url: string;
  source: string;
  status: Status;
  timestamp: string;
  location: string;
  score: string;
  notes: string;
};

export function AddDialog({
  defaultStatus,
  onCreate,
}: {
  defaultStatus: Status;
  onCreate: (input: NewRowInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<NewRowInput>(() => emptyForm(defaultStatus));

  function update<K extends keyof NewRowInput>(key: K, value: NewRowInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await onCreate(form);
      setForm(emptyForm(defaultStatus));
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that row.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">Add role</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a role</DialogTitle>
          <DialogDescription>
            One listing. Times are saved in Europe/London. Duplicates update the existing URL.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <Field label="Company">
            <Input value={form.company} onChange={(event) => update("company", event.target.value)} required />
          </Field>
          <Field label="Title">
            <Input value={form.title} onChange={(event) => update("title", event.target.value)} required />
          </Field>
          <Field label="URL">
            <Input
              type="url"
              value={form.url}
              onChange={(event) => update("url", event.target.value)}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source">
              <Input value={form.source} onChange={(event) => update("source", event.target.value)} required />
            </Field>
            <Field label="Status">
              <select
                aria-label="Status"
                value={form.status}
                onChange={(event) => update("status", event.target.value as Status)}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
              >
                {STATUS_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.statuses.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="When">
              <Input
                type="datetime-local"
                value={form.timestamp}
                onChange={(event) => update("timestamp", event.target.value)}
                required
              />
            </Field>
            <Field label="Location">
              <Input value={form.location} onChange={(event) => update("location", event.target.value)} />
            </Field>
            <Field label="Score">
              <Input
                inputMode="numeric"
                value={form.score}
                onChange={(event) => update("score", event.target.value)}
                placeholder="0–100"
              />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} />
          </Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ImportDialog({ onImport }: { onImport: (csv: string) => Promise<string> }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const summary = await onImport(csv);
      setMessage(summary);
      setCsv("");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Import failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            Header: timestamp, company, title, url, source, status. Optional: score, location, notes.
            Rows with the same URL keep the latest timestamp.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <Textarea
            aria-label="CSV"
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            className="min-h-40 font-mono text-xs"
            placeholder="timestamp,company,title,url,source,status"
            required
          />
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="grid gap-1.5 font-normal">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </Label>
  );
}

function emptyForm(status: Status): NewRowInput {
  return {
    company: "",
    title: "",
    url: "",
    source: "Ashby",
    status,
    timestamp: toLondonInputValue(),
    location: "",
    score: "",
    notes: "",
  };
}
