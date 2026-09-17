"use client";

import { useEffect, useState } from "react";
import type { ApiResponse, HealthStatus } from "../../shared/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type CheckState =
  | { phase: "loading" }
  | { phase: "ok"; data: HealthStatus }
  | { phase: "error"; message: string };

export default function HomePage() {
  const [check, setCheck] = useState<CheckState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/health`)
      .then((res) => res.json() as Promise<ApiResponse<HealthStatus>>)
      .then((body) => {
        if (cancelled) return;
        if (body.success && body.data) {
          setCheck({ phase: "ok", data: body.data });
        } else {
          setCheck({ phase: "error", message: body.error ?? "Unknown backend error" });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCheck({ phase: "error", message: "Could not reach the backend API" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Interview Prep Kit</h1>
        <p className="mt-2 text-slate-600">
          Phase 3 — session auth is in. Research and kit generation land in later phases.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Backend connectivity
        </h2>

        {check.phase === "loading" && (
          <p className="mt-2 text-slate-600">Checking {API_URL}/health…</p>
        )}

        {check.phase === "ok" && (
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium text-emerald-600">{check.data.status}</dd>
            <dt className="text-slate-500">Database</dt>
            <dd className="font-medium">{check.data.db}</dd>
            <dt className="text-slate-500">Uptime</dt>
            <dd className="font-medium">{check.data.uptimeSeconds}s</dd>
          </dl>
        )}

        {check.phase === "error" && (
          <p className="mt-2 text-amber-700">
            {check.message}. Start the backend with <code className="rounded bg-slate-100 px-1">npm run dev</code> in{" "}
            <code className="rounded bg-slate-100 px-1">backend/</code>.
          </p>
        )}
      </div>
    </main>
  );
}
