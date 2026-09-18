"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Badge, Button, Card, ObjectList, SectionHeader, TabButton } from "../../../components/ui";
import { apiRequest } from "../../../lib/api";
import type { StoredKit } from "../../../../shared/types";

type TabKey = "overview" | "questions" | "flashcards" | "schedule" | "coverage";

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

function stageTone(state: string | undefined) {
  switch (state) {
    case "done":
      return "emerald";
    case "in_progress":
      return "sky";
    case "failed":
      return "rose";
    default:
      return "slate";
  }
}

function itemStateTone(state: string | undefined) {
  switch (state) {
    case "pinned":
      return "violet" as const;
    case "edited":
      return "amber" as const;
    default:
      return "sky" as const;
  }
}

export default function KitDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [kit, setKit] = useState<StoredKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("overview");

  useEffect(() => {
    if (!params.id) return;
    let active = true;

    async function loadKit() {
      try {
        const data = await apiRequest<StoredKit>(`/api/kits/${params.id}`);
        if (!active) return;
        setKit(data);
      } catch (err) {
        if (!active) return;
        if (String(err).includes("401")) {
          router.push("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to load this kit.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadKit();
    return () => {
      active = false;
    };
  }, [params.id, router]);

  const stageEntries = useMemo(() => {
    if (!kit?.fieldState) return [] as Array<{ key: string; value: string }>; 
    return [
      ["input", kit.fieldState.input],
      ["research", kit.fieldState.research],
      ["requirements", kit.fieldState.requirements],
      ["questions", kit.fieldState.questions],
      ["flashcards", kit.fieldState.flashcards],
      ["schedule", kit.fieldState.schedule],
      ["validation", kit.fieldState.validation],
    ].map(([key, value]) => ({ key, value: String(value) }));
  }, [kit]);

  if (loading) {
    return (
      <AppShell>
        <Card className="py-12 text-center text-slate-600">Loading kit…</Card>
      </AppShell>
    );
  }

  if (error || !kit) {
    return (
      <AppShell>
        <Card className="border-rose-200 bg-rose-50 py-12 text-center text-rose-700">
          {error || "Kit not found."}
        </Card>
      </AppShell>
    );
  }

  const source = kit.source ?? (kit.input && typeof kit.input === "object" ? (kit.input as Record<string, unknown>) : {});
  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "questions", label: "Questions" },
    { key: "flashcards", label: "Flashcards" },
    { key: "schedule", label: "Schedule" },
    { key: "coverage", label: "Coverage" },
  ];

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(kit.status)}>{kit.status}</Badge>
            {kit.status === "failed" && kit.error ? <Badge tone="rose">{kit.error.code}</Badge> : null}
            {(kit.company_brief as { state?: string } | null)?.state ? (
              <Badge tone={itemStateTone((kit.company_brief as { state?: string }).state)}>{(kit.company_brief as { state?: string }).state}</Badge>
            ) : null}
          </div>
          <h1 className="text-3xl font-bold text-slate-900">{kit.role?.title ?? "Interview kit"}</h1>
          <p className="mt-1 text-sm text-slate-600">{String(source.company_url ?? "Company URL not available")}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button href="/kits" variant="secondary">Back</Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <TabButton key={item.key} active={tab === item.key} onClick={() => setTab(item.key)}>
            {item.label}
          </TabButton>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <SectionHeader title="Overview" description="Current generation state and source details." />
            <dl className="space-y-3 text-sm text-slate-700">
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-medium capitalize">{kit.status}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Days available</dt>
                <dd className="font-medium">{Number(source.days_available ?? 0)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Questions</dt>
                <dd className="font-medium">{kit.questions.length}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Flashcards</dt>
                <dd className="font-medium">{kit.flashcards.length}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Schedule days</dt>
                <dd className="font-medium">{kit.schedule.length}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <SectionHeader title="Generation status" description="Progress through the pipeline." />
            <div className="space-y-3">
              {stageEntries.map((stage) => (
                <div key={stage.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-sm font-medium capitalize text-slate-700">{stage.key}</span>
                  <Badge tone={stageTone(stage.value)}>{stage.value}</Badge>
                </div>
              ))}
            </div>
            {kit.status === "failed" && kit.error ? (
              <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <p className="font-semibold">{kit.error.code}</p>
                <p>{kit.error.message}</p>
              </div>
            ) : null}
          </Card>
        </div>
      )}

      {tab === "questions" && (
        <Card>
          <SectionHeader title="Questions" description="Questions generated for this kit." />
          {kit.questions.length === 0 ? (
            <p className="text-sm text-slate-500">No questions available yet.</p>
          ) : (
            <div className="space-y-4">
              {kit.questions.map((question) => (
                <div key={question.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone="sky">{question.type}</Badge>
                    <Badge tone="amber">{question.difficulty}</Badge>
                    <Badge tone={itemStateTone(question.state)}>{question.state ?? "generated"}</Badge>
                  </div>
                  <p className="text-base font-semibold text-slate-900">{question.prompt}</p>
                  <div className="mt-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-700">Requirement IDs</p>
                    <p>{question.requirement_ids.join(", ") || "None"}</p>
                  </div>
                  <div className="mt-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-700">Answer outline</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {question.answer_outline.map((item, index) => (
                        <li key={`${question.id}-outline-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-700">Generated/edited/pinned state</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {question.generated_edited_pinned.map((item, index) => (
                        <li key={`${question.id}-generated-edited-pinned-${index}`}>
                          {itemStateTone(item)} {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "flashcards" && (
        <Card>
          <SectionHeader title="Flashcards" description="Requirement-linked flashcards for quick recall." />
          {kit.flashcards.length === 0 ? (
            <p className="text-sm text-slate-500">No flashcards available yet.</p>
          ) : (
            <div className="space-y-4">
              {kit.flashcards.map((flashcard) => (
                <div key={flashcard.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone={itemStateTone(flashcard.state)}>{flashcard.state ?? "generated"}</Badge>
                  </div>
                  <p className="font-semibold text-slate-900">Front</p>
                  <p className="mt-1 text-sm text-slate-700">{flashcard.front}</p>
                  <p className="mt-4 font-semibold text-slate-900">Back</p>
                  <p className="mt-1 text-sm text-slate-700">{flashcard.back}</p>
                  <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Requirement IDs</p>
                  <p className="mt-1 text-sm text-slate-700">{flashcard.requirement_ids.join(", ")}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "schedule" && (
        <Card>
          <SectionHeader title="Schedule" description="The deterministic daily plan generated for this kit." />
          {kit.schedule.length === 0 ? (
            <p className="text-sm text-slate-500">No schedule is available yet.</p>
          ) : (
            <div className="space-y-4">
              {kit.schedule.map((day) => (
                <div key={day.day} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">Day {day.day}</h3>
                    <Badge tone="slate">{day.total_minutes} min</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{day.theme}</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {day.items.map((item, index) => (
                      <li key={`${day.day}-${index}`} className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                        <span className="font-medium capitalize">{item.kind}</span>
                        <span>{item.ref_id}</span>
                        <span>{item.minutes} min</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "coverage" && (
        <Card>
          <SectionHeader title="Coverage" description="Deterministic requirement and quality coverage." />
          {kit.coverage ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Status</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{kit.coverage.passed ? "Passed" : "Needs work"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Coverage score</p>
                  <p className="mt-2 text-2xl font-bold text-sky-600">{kit.coverage.score}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Must-haves missing</p>
                  <p className="mt-2 text-2xl font-bold text-rose-600">{kit.coverage.must_have_missing.length}</p>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-base font-semibold text-slate-900">Must-have requirements</h3>
                  <ObjectList items={kit.coverage.must_requirement_ids} emptyLabel="No must-have requirements recorded." />
                </div>
                <div>
                  <h3 className="mb-2 text-base font-semibold text-slate-900">Uncovered requirements</h3>
                  <ObjectList items={kit.coverage.uncovered_requirement_ids} emptyLabel="No uncovered requirements." />
                </div>
              </div>

              {kit.coverage.gaps.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-base font-semibold text-slate-900">Gaps</h3>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {kit.coverage.gaps.map((gap, index) => (
                      <li key={`${gap.code}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                        <span className="font-medium">{gap.code}</span> — {gap.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Coverage is not available yet.</p>
          )}
        </Card>
      )}
    </AppShell>
  );
}
