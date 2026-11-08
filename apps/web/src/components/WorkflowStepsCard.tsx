"use client";
// WorkflowStepsCard (keputusan user 2026-11-08): ASSIGN/REASSIGN step workflow
// hidup di TAB TASK (fokus kanban/penataan tugas). Menampilkan step run aktif
// dikelompokkan per fase + dropdown ganti persona utk step pending. Kendali
// run (brief/steer/gate/pause) = chat; observasi alur = Team (canvas).
import { apiUrl, authFetch, authTokenQuery } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { PersonaFace } from "./PersonaPicker";
import { Card } from "./ui";

interface StepState {
  id: string;
  personaId: string;
  ok: boolean | null; // null = belum jalan
  summary: string;
}
interface PhaseState {
  phaseId: string;
  status: "pending" | "running" | "done";
  steps: StepState[];
  gatePassed?: boolean;
}
interface RunSummary {
  id: string;
  status: string;
  workflow: { name: string; phaseCount: number };
  leadSessionId?: string;
}
interface RunDetail {
  id: string;
  leadSessionId: string;
  workflow: {
    name: string;
    phases: Array<{
      id: string;
      name?: string;
      mode?: string;
      steps?: Array<{ id?: string; persona: string }>;
    }>;
  };
  status: string;
  phaseStates: PhaseState[];
}

const TERMINAL = ["done", "failed", "stopped"];
const STEERABLE = ["running", "awaiting_gate", "paused"];

export function WorkflowStepsCard({ projectId }: { projectId: string }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [roster, setRoster] = useState<string[]>([]);
  const refetchTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [rs, ps] = await Promise.all([
        authFetch(apiUrl(`/api/projects/${projectId}/workflows/runs`)),
        authFetch(apiUrl("/api/personas")),
      ]);
      if (rs.ok) {
        const list = ((await rs.json()) as { runs: RunSummary[] }).runs;
        const a = list.find((x) => !TERMINAL.includes(x.status));
        if (!a) {
          setRun(null);
          return;
        }
        const rd = await authFetch(apiUrl(`/api/workflows/runs/${a.id}`));
        if (rd.ok) setRun(((await rd.json()) as { run: RunDetail }).run);
      }
      if (ps.ok) {
        setRoster(
          (
            ((await ps.json()) as { personas: { id: string }[] }).personas ?? []
          ).map((p) => p.id),
        );
      }
    } catch {
      /* biarkan state lama */
    }
  }, [projectId]);

  useEffect(() => {
    setRun(null);
    void load();
    const t = setInterval(() => void load(), 5_000);
    return () => clearInterval(t);
  }, [load]);

  // live: SSE lead session → refetch (throttle 300ms)
  useEffect(() => {
    const id = run?.id;
    const lead = run?.leadSessionId;
    if (!id || !lead) return;
    const schedule = () => {
      if (refetchTimer.current !== null) return;
      refetchTimer.current = window.setTimeout(() => {
        refetchTimer.current = null;
        void load();
      }, 300);
    };
    const es = new EventSource(
      apiUrl(`/api/sessions/${lead}/stream?since=0${authTokenQuery()}`),
    );
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as { type: string; runId?: string };
        if (e.type?.startsWith("workflow.") && (!e.runId || e.runId === id))
          schedule();
      } catch {
        /* abaikan */
      }
    };
    return () => {
      es.close();
      if (refetchTimer.current !== null) {
        window.clearTimeout(refetchTimer.current);
        refetchTimer.current = null;
      }
    };
  }, [run?.id, run?.leadSessionId, load]);

  const steerable = run ? STEERABLE.includes(run.status) : false;
  if (!run) return null; // tidak ada run aktif, seksi disembunyikan

  const phaseName = (pid: string) =>
    run.workflow.phases.find((p) => p.id === pid)?.name ?? pid;

  async function reassign(phaseId: string, stepId: string, persona: string) {
    await authFetch(apiUrl(`/api/workflows/runs/${run!.id}/steps/reassign`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phaseId, stepId, persona }),
    });
    void load();
  }

  return (
    <div aria-label="Workflow steps assignment">
      <Card className="p-3">
        <header className="mb-2 flex flex-wrap items-center gap-2">
          <PersonaFace personaId="yui-conductor" size={18} />
          <b className="text-caption font-semibold text-primary">
            Workflow steps
          </b>
          <span className="text-caption text-dim">
            {run.workflow.name} · {run.status.replace("_", " ")}, reassign
            pending steps below
          </span>
        </header>
        <div className="flex flex-col gap-2">
          {run.workflow.phases.map((phase) => {
            const st = run.phaseStates.find((p) => p.phaseId === phase.id);
            const steps =
              st && st.steps.length
                ? st.steps
                : (phase.steps ?? []).map((ps) => ({
                    id: ps.id ?? "",
                    personaId: ps.persona,
                    ok: null,
                    summary: "",
                  }));
            const pending = steps.filter((s) => s.ok === null);
            if (!pending.length) return null; // hanya fase yang masih ada step bisa di-assign
            return (
              <div
                key={phase.id}
                data-phase={phase.id}
                className="flex flex-col gap-1"
              >
                <small className="text-[11px] font-semibold uppercase tracking-wide text-dim">
                  {phaseName(phase.id)}
                </small>
                {pending.map((s) => (
                  <div
                    key={s.id}
                    data-step={s.id}
                    className="flex items-center gap-2 rounded-md2 border border-line bg-raised px-2 py-1.5"
                  >
                    <PersonaFace personaId={s.personaId} size={18} />
                    <span
                      className="min-w-0 flex-1 truncate text-caption text-secondary"
                      title={s.personaId}
                    >
                      <b className="font-semibold">{s.id}</b> ·{" "}
                      {s.personaId.replace("yui-", "")}
                    </span>
                    {steerable ? (
                      <select
                        className="shrink-0 rounded-md2 border border-line bg-control px-1 py-0.5 text-caption text-primary outline-none"
                        value={s.personaId}
                        aria-label={`Reassign ${s.id}`}
                        onChange={(ev) => {
                          if (ev.target.value !== s.personaId)
                            void reassign(phase.id, s.id, ev.target.value);
                        }}
                      >
                        {roster.map((pid) => (
                          <option key={pid} value={pid}>
                            {pid.replace("yui-", "")}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <small className="shrink-0 text-[11px] text-dim">
                        locked
                      </small>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
