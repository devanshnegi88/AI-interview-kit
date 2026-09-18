"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell, Button, Card, Field, SectionHeader } from "../../../components/ui";
import { apiRequest } from "../../../lib/api";
import type { StoredKit } from "../../../../shared/types";

export default function NewKitPage() {
  const router = useRouter();
  const [jobDescription, setJobDescription] = useState(
    "We are looking for a senior frontend engineer who can architect web apps, work closely with designers, and ship accessible product experiences.",
  );
  const [companyUrl, setCompanyUrl] = useState("https://www.example.com");
  const [daysAvailable, setDaysAvailable] = useState(5);
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const created = await apiRequest<StoredKit>("/api/kits", {
        method: "POST",
        body: JSON.stringify({
          job_description: jobDescription,
          company_url: companyUrl,
          days_available: Number(daysAvailable),
          hours_per_day: Number(hoursPerDay),
        }),
      });
      router.push(`/kits/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The kit could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">New kit</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Create an interview prep kit</h1>
        </div>
        <Button href="/kits" variant="secondary">Back to kits</Button>
      </div>

      <Card>
        <SectionHeader title="Job details" description="Provide the JD and company context to generate a tailored prep plan." />

        <form onSubmit={onSubmit} className="space-y-5">
          <Field label="Job description">
            <textarea
              required
              rows={10}
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              placeholder="Paste the job description here..."
            />
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Company URL">
              <input
                type="url"
                required
                value={companyUrl}
                onChange={(event) => setCompanyUrl(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="https://company.com"
              />
            </Field>

            <Field label="Days available">
              <input
                type="number"
                min={1}
                max={60}
                value={daysAvailable}
                onChange={(event) => setDaysAvailable(Number(event.target.value) || 1)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </Field>
          </div>

          <Field label="Hours per day" hint="This is used by the deterministic schedule.">
            <input
              type="number"
              min={0.5}
              max={16}
              step="0.5"
              value={hoursPerDay}
              onChange={(event) => setHoursPerDay(Number(event.target.value) || 1)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </Field>

          {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting} className="min-w-[180px]">
              {submitting ? "Creating kit…" : "Create kit"}
            </Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
