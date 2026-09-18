"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Badge, Button, Card, SectionHeader } from "../../components/ui";
import { apiRequest } from "../../lib/api";
import type { StoredKit } from "../../../shared/types";

function statusTone(status: StoredKit["status"]) {
  switch (status) {
    case "ready":
      return "emerald" as const;
    case "researching":
      return "sky" as const;
    case "generating":
      return "violet" as const;
    case "failed":
      return "rose" as const;
    default:
      return "amber" as const;
  }
}

export default function KitsPage() {
  const router = useRouter();
  const [kits, setKits] = useState<StoredKit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadKits() {
      try {
        const data = await apiRequest<StoredKit[]>("/api/kits");
        if (!active) return;
        setKits(data ?? []);
      } catch (err) {
        if (!active) return;
        if (String(err).includes("401")) {
          router.push("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to load your kits.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadKits();
    return () => {
      active = false;
    };
  }, [router]);

  const summary = useMemo(
    () => ({
      total: kits.length,
      ready: kits.filter((kit) => kit.status === "ready").length,
      failed: kits.filter((kit) => kit.status === "failed").length,
    }),
    [kits],
  );

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">Workspace</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Your kits</h1>
        </div>
        <Button href="/kits/new">Create a kit</Button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Total</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{summary.total}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Ready</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{summary.ready}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Failed</p>
          <p className="mt-2 text-3xl font-bold text-rose-600">{summary.failed}</p>
        </Card>
      </div>

      {loading ? (
        <Card className="py-12 text-center text-slate-600">Loading your kits…</Card>
      ) : error ? (
        <Card className="border-rose-200 bg-rose-50 py-8 text-center text-rose-700">{error}</Card>
      ) : kits.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-lg font-semibold text-slate-900">No kits yet</p>
          <p className="mt-2 text-slate-600">Create your first interview prep kit to generate questions, flashcards, and a schedule.</p>
          <div className="mt-5">
            <Button href="/kits/new">Make your first kit</Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {kits.map((kit) => {
            const source = kit.source ?? (kit.input && typeof kit.input === "object" ? (kit.input as Record<string, unknown>) : {});
            const jd = typeof source.job_description === "string" ? source.job_description : "No job description stored.";
            const companyUrl = typeof source.company_url === "string" ? source.company_url : "-";
            const statusText = kit.status === "ready" ? "Ready" : kit.status === "failed" ? "Failed" : kit.status === "researching" ? "Researching" : kit.status === "generating" ? "Generating" : "Pending";

            return (
              <Link href={`/kits/${kit.id}`} key={kit.id} className="block">
                <Card className="transition hover:border-sky-200 hover:shadow-md">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone(kit.status)}>{statusText}</Badge>
                        {kit.status === "failed" && kit.error ? <Badge tone="rose">{kit.error.code}</Badge> : null}
                      </div>
                      <h2 className="text-xl font-semibold text-slate-900">{kit.role?.title ?? "Interview prep kit"}</h2>
                      <p className="mt-1 text-sm text-slate-600">{companyUrl}</p>
                    </div>

                    <div className="text-sm text-slate-500">
                      <div>{kit.questions.length} questions</div>
                      <div>{kit.flashcards.length} flashcards</div>
                      <div>{kit.schedule.length} schedule days</div>
                    </div>
                  </div>

                  <p className="mt-4 line-clamp-3 text-sm text-slate-600">{jd.slice(0, 180)}{jd.length > 180 ? "…" : ""}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
