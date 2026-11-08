"use client";
// P2-PM-4/5, Project dashboard: progres & health project terbaca sekali
// lihat (target: project 100+ task tanpa scroll-cek satu-satu).
// Server-computed via GET /api/projects/:id/dashboard; dirender di atas
// board tab Task. Read-only, tidak ada kontrol di sini.
import { useCallback, useEffect, useState } from "react";
import type { ProjectDashboard } from "@yuika/contracts";
import { apiUrl, authFetch } from "@/lib/api";
import { Card, Chip } from "./ui";
import { PersonaFace } from "./PersonaPicker";
import type { PersonaInfo } from "@yuika/contracts";

const PHASE_LABEL: Record<string, string> = {
  planning: "Planning",
  research: "Research",
  design: "Design",
  develop: "Develop",
  testing: "Testing",
  documentation: "Docs",
  delivery: "Delivery",
};

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-inset">
        <div
          className="h-full rounded-pill bg-accent transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-14 text-right text-caption tabular-nums text-dim">
        {done}/{total}
      </span>
    </div>
  );
}

/** Strip health: revisi (reopened) + hold approval + blocker (qa fail/deleg error). */
function HealthChips({ d }: { d: ProjectDashboard }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {d.tasks.reopened > 0 && (
        <Chip tone="warn">{d.tasks.reopened} reopened</Chip>
      )}
      {d.health.pendingApprovals > 0 && (
        <Chip tone="warn">{d.health.pendingApprovals} approval on hold</Chip>
      )}
      {d.health.qaFail > 0 && (
        <Chip tone="danger">{d.health.qaFail} QA fail</Chip>
      )}
      {d.health.delegationErrors > 0 && (
        <Chip tone="danger">{d.health.delegationErrors} job error</Chip>
      )}
      {d.tasks.unassigned > 0 && (
        <Chip tone="muted">{d.tasks.unassigned} unassigned</Chip>
      )}
      {d.tasks.reopened === 0 &&
        d.health.pendingApprovals === 0 &&
        d.health.qaFail === 0 &&
        d.health.delegationErrors === 0 && <Chip tone="ok">healthy</Chip>}
    </div>
  );
}

export function ProjectDashboardView({
  projectId,
  personas,
  rev,
}: {
  projectId: string;
  personas: PersonaInfo[];
  rev: number;
}) {
  const [d, setD] = useState<ProjectDashboard | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch(
        apiUrl(`/api/projects/${projectId}/dashboard`),
      );
      if (res.ok)
        setD(((await res.json()) as { dashboard: ProjectDashboard }).dashboard);
    } catch {
      /* refresh berikutnya */
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [rev, refresh]);

  if (!d) return null;
  if (d.tasks.total === 0 && d.runs.length === 0) return null; // belum ada yg bisa diukur

  return (
    <Card className="flex flex-col gap-3 p-4" aria-label="Project dashboard">
      {/* Burndown ringkas + health */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <b className="text-body font-semibold text-primary">Progress</b>
            <span className="text-caption text-dim">
              {d.tasks.done} done · {d.tasks.doing} doing · {d.tasks.review}{" "}
              review · {d.tasks.todo} todo · {d.tasks.withAcceptancePct}% with
              acceptance
            </span>
          </div>
          <Bar done={d.tasks.done} total={d.tasks.total} />
        </div>
        <HealthChips d={d} />
      </div>

      {/* P2-PM-4, RACI ringan: kolom fase = owner + metrik live */}
      <div className="grid items-stretch gap-2 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {d.phases.map((p) => (
          <div
            key={p.phase}
            className={`flex flex-col gap-1.5 rounded-lg2 border bg-inset p-2.5 ${
              p.tasks.total === 0 && p.owners.length === 0
                ? "border-line opacity-60"
                : p.gate === "pending"
                  ? "border-warn"
                  : "border-line"
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <b className="text-caption font-semibold text-secondary">
                {PHASE_LABEL[p.phase] ?? p.phase}
              </b>
              {p.gate === "pending" && <Chip size="sm" tone="warn">gate</Chip>}
              {p.gate === "passed" && <Chip size="sm" tone="ok">gate ok</Chip>}
            </div>
            <div className="flex min-h-[20px] flex-wrap items-center gap-1">
              {p.owners.length === 0 ? (
                <span className="text-caption text-dim">no owner</span>
              ) : (
                p.owners.map((o) => {
                  const info = personas.find((x) => x.id === o);
                  return (
                    <span
                      key={o}
                      className="flex items-center gap-1"
                      title={info?.name ?? o}
                    >
                      <PersonaFace personaId={o} size={14} />
                      <small className="text-caption text-muted">
                        {o.replace("yui-", "")}
                      </small>
                    </span>
                  );
                })
              )}
            </div>
            {p.tasks.total > 0 ? (
              <Bar done={p.tasks.done} total={p.tasks.total} />
            ) : (
              <span className="text-caption text-dim">no tasks</span>
            )}
            <div className="flex flex-wrap items-center gap-1">
              {p.phase === "planning" && p.tasks.total > 0 && (
                <span className="text-caption text-dim">
                  {p.tasks.withAcceptancePct}% acceptance
                </span>
              )}
              {p.qa && (
                <>
                  <Chip size="sm" tone="ok">{p.qa.pass} pass</Chip>
                  {p.qa.fail > 0 && <Chip size="sm" tone="danger">{p.qa.fail} fail</Chip>}
                  {p.qa.warn > 0 && <Chip size="sm" tone="warn">{p.qa.warn} warn</Chip>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* P2-PM-5, ringkasan iterasi (run ke-N + delta) */}
      {d.runs.length > 0 && (
        <div className="flex flex-col gap-1">
          <b className="text-caption font-semibold text-secondary">
            Iterations
          </b>
          <div className="flex flex-col gap-1">
            {[...d.runs].reverse().map((r) => (
              <div
                key={r.runId}
                className="flex flex-wrap items-center gap-2 rounded-md2 border border-line px-2.5 py-1.5"
              >
                <b className="text-caption tabular-nums text-secondary">
                  #{r.index}
                </b>
                <span className="min-w-0 flex-1 truncate text-body text-secondary">
                  {r.name}
                </span>
                <span className="text-caption tabular-nums text-dim">
                  {r.stepsDone}/{r.stepsTotal} steps
                </span>
                {r.delta !== null && (
                  <Chip size="sm" tone={r.delta >= 0 ? "ok" : "warn"}>
                    {r.delta >= 0 ? "+" : ""}
                    {r.delta} vs prev
                  </Chip>
                )}
                <Chip
                  size="sm"
                  tone={
                    r.status === "done"
                      ? "ok"
                      : r.status === "running"
                        ? "accent"
                        : r.status === "awaiting_gate"
                          ? "warn"
                          : r.status === "failed" || r.status === "stopped"
                            ? "danger"
                            : "muted"
                  }
                >
                  {r.status}
                </Chip>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
