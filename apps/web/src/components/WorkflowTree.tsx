"use client";
// WorkflowTree (merge Flow → Team, keputusan user 2026-11-08): tab Flow
// DIHAPUS — informasinya (run, fase, step, gate, steering) dirender di tab Team
// dengan BAHASA VISUAL Team: kartu hierarkis run → fase → step yang bisa
// dilacak alurnya (di atas canvas delegasi). Logika (fetch runs, SSE lead,
// gate/steer/pause/reassign) diporting dari WorkflowTab lama; selector e2e
// dipertahankan (aria-label "Workflow board", data-phase, data-step,
// [title=personaId], aria-label step status, tombol Approve/Steer/…).
import { apiUrl, authFetch, authTokenQuery } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowDef } from "@yuika/contracts";
import { Check, Circle, CircleNotch, Play, Stop, X } from "@phosphor-icons/react";
import { Pause, ChatCircleDots, ArrowFatUp } from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { Button, Card, Chip } from "./ui";
import type { ChipTone } from "./ui/chip";
import { Skeleton } from "./Skeleton";
import { toastErr, toastOk } from "./ui/toast";

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
type RunStatus = "queued" | "running" | "awaiting_gate" | "paused" | "done" | "failed" | "stopped";
interface RunSummary {
  id: string;
  status: RunStatus;
  workflow: { name: string; phaseCount: number };
  createdAt: number;
}
interface RunDetail {
  id: string;
  leadSessionId: string;
  workflow: WorkflowDef;
  status: RunStatus;
  phaseStates: PhaseState[];
  createdAt: number;
}

const STATUS_TONE: Record<RunStatus, ChipTone> = {
  queued: "muted",
  running: "accent",
  awaiting_gate: "warn",
  paused: "info",
  done: "ok",
  failed: "danger",
  stopped: "muted",
};
const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "queued",
  running: "running",
  awaiting_gate: "awaiting approval",
  paused: "paused",
  done: "done",
  failed: "failed",
  stopped: "stopped",
};
/** dot fase — TANPA teks supaya teks status ("running"/"done"/…) muncul
 *  TEPAT SATU kali di section ini (chip run) — e2e getByText exact. */
const PHASE_DOT: Record<PhaseState["status"], string> = {
  pending: "bg-dim",
  running: "bg-accent animate-pulse",
  done: "bg-success",
};

function stepStatus(phase: PhaseState, s: StepState): "pending" | "running" | "done" | "failed" {
  if (s.ok === true) return "done";
  if (s.ok === false) return "failed";
  return phase.status === "running" ? "running" : "pending";
}

export function WorkflowTree({ projectId }: { projectId: string }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [brief, setBrief] = useState("");
  const [steer, setSteer] = useState("");
  const [roster, setRoster] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // throttle refetch saat event workflow.* masuk deras (12 step × 3 event)
  const refetchTimer = useRef<number | null>(null);
  const runIdRef = useRef<string | null>(null);
  runIdRef.current = runId;

  const loadRuns = useCallback(async () => {
    const r = await authFetch(apiUrl(`/api/projects/${projectId}/workflows/runs`));
    if (!r.ok) return;
    const { runs: list } = (await r.json()) as { runs: RunSummary[] };
    setRuns(list);
    // auto-select: run aktif pertama (list DESC → termuda) bila belum memilih
    setRunId((cur) => cur ?? list.find((x) => !["done", "failed", "stopped"].includes(x.status))?.id ?? list[0]?.id ?? null);
  }, [projectId]);

  const loadRun = useCallback(async (id: string) => {
    const r = await authFetch(apiUrl(`/api/workflows/runs/${id}`));
    if (!r.ok) return;
    const { run: d } = (await r.json()) as { run: RunDetail };
    setRun(d);
  }, []);

  useEffect(() => {
    setRuns(null);
    setRunId(null);
    setRun(null);
    void loadRuns();
    // roster persona untuk reassign (FLOW-6)
    void authFetch(apiUrl("/api/personas"))
      .then((r) => (r.ok ? r.json() : { personas: [] }))
      .then((b: { personas: { id: string }[] }) => setRoster(b.personas.map((p) => p.id)))
      .catch(() => setRoster([]));
  }, [loadRuns]);

  useEffect(() => {
    if (!runId) return;
    setRun(null);
    void loadRun(runId);
  }, [runId, loadRun]);

  // SSE sesi lead run (event workflow.* run ini) → refetch detail (throttle
  // 300ms — event deras 12 step × 3 event)
  useEffect(() => {
    if (!runId || !run?.leadSessionId) return;
    const schedule = () => {
      if (refetchTimer.current !== null) return;
      refetchTimer.current = window.setTimeout(() => {
        refetchTimer.current = null;
        if (runIdRef.current === runId) void loadRun(runId);
      }, 300);
    };
    const es = new EventSource(
      apiUrl(`/api/sessions/${run.leadSessionId}/stream?since=0${authTokenQuery()}`),
    );
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as { type: string; runId?: string };
        if (e.type?.startsWith("workflow.") && e.runId === runId) schedule();
      } catch {
        /* event non-JSON diabaikan */
      }
    };
    return () => {
      es.close();
      if (refetchTimer.current !== null) {
        window.clearTimeout(refetchTimer.current);
        refetchTimer.current = null;
      }
    };
  }, [runId, run?.leadSessionId, loadRun]);

  async function startRun() {
    setBusy(true);
    try {
      const r = await authFetch(apiUrl(`/api/projects/${projectId}/workflows/runs`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief: brief.trim() || undefined }),
      });
      const body = (await r.json()) as { runId?: string; error?: string };
      if (!r.ok || !body.runId) throw new Error(body.error ?? "gagal memulai run");
      setBrief("");
      setRunId(body.runId);
      await loadRuns();
      toastOk(`Run ${body.runId} dimulai`);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "gagal memulai run");
    } finally {
      setBusy(false);
    }
  }

  async function decideGate(decision: "approved" | "rejected") {
    if (!runId) return;
    setBusy(true);
    try {
      const r = await authFetch(apiUrl(`/api/workflows/runs/${runId}/gate`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "gagal");
      await loadRun(runId);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "gagal memutuskan gate");
    } finally {
      setBusy(false);
    }
  }

  async function postAction(path: string, body?: unknown): Promise<boolean> {
    if (!runId) return false;
    try {
      const r = await authFetch(apiUrl(`/api/workflows/runs/${runId}${path}`), {
        method: "POST",
        ...(body === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "gagal");
      await loadRun(runId);
      return true;
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "gagal");
      return false;
    }
  }

  async function reassign(phaseId: string, stepId: string, persona: string) {
    const ok = await postAction("/steps/reassign", { phaseId, stepId, persona });
    if (ok) toastOk(`Step ${stepId} → ${persona}`);
  }

  const active = run ? ["queued", "running", "awaiting_gate", "paused"].includes(run.status) : false;
  const steerable = run ? ["running", "awaiting_gate", "paused"].includes(run.status) : false;
  const donePhases = run?.phaseStates.filter((p) => p.status === "done").length ?? 0;
  // gerbang fase tampil saat awaiting_gate ATAU paused (pause saat gate —
  // keputusan tetap bisa diambil, berlaku setelah resume)
  const gatePhase =
    run && (run.status === "awaiting_gate" || run.status === "paused")
      ? run.phaseStates.filter((p) => p.status === "done" && p.gatePassed === undefined).at(-1)
      : undefined;
  const phaseName = (id: string) => run?.workflow.phases.find((p) => p.id === id)?.name ?? id;

  return (
    <section aria-label="Workflow board" className="flex flex-col gap-2.5">
      <header className="flex flex-wrap items-center gap-2">
        <PersonaFace personaId="yui-conductor" size={20} />
        <b className="text-body font-semibold text-primary">Workflow</b>
        <span className="text-caption text-dim">runs led by Conductor Yui</span>
        {run && (
          <Chip tone={STATUS_TONE[run.status]}>
            {run.status === "running" && <CircleNotch size={11} className="animate-spin" aria-hidden />}
            {STATUS_LABEL[run.status]}
          </Chip>
        )}
        {run && (
          <span className="text-caption text-dim">
            {donePhases}/{run.workflow.phases.length} phases · {run.workflow.name}
          </span>
        )}
        <span className="flex-1" />
        {run?.status === "paused" ? (
          <Button size="sm" variant="primary" onClick={() => void postAction("/resume")} disabled={busy}>
            <Play size={12} aria-hidden /> Resume
          </Button>
        ) : (
          active && (
            <Button size="sm" variant="secondary" onClick={() => void postAction("/pause")} disabled={busy}>
              <Pause size={12} aria-hidden /> Pause
            </Button>
          )
        )}
        {active && run!.status !== "paused" && (
          <Button size="sm" variant="danger" onClick={() => void postAction("/stop")} disabled={busy}>
            <Stop size={12} aria-hidden /> Stop
          </Button>
        )}
      </header>

      {/* steering — suntik instruksi mid-run (masuk konteks fase berikutnya) */}
      {steerable && (
        <div className="flex flex-none items-center gap-2">
          <ChatCircleDots size={14} className="shrink-0 text-dim" aria-hidden />
          <input
            className="min-w-[180px] flex-1 rounded-md2 border border-line bg-control px-3 py-1.5 text-body text-primary outline-none focus:border-accent"
            placeholder="Steer mid-run — e.g. keep scope minimal"
            value={steer}
            onChange={(e) => setSteer(e.target.value)}
            aria-label="Steer instruction"
            onKeyDown={(e) => {
              if (e.key === "Enter" && steer.trim()) {
                void postAction("/steer", { instruction: steer.trim() }).then((ok) => ok && setSteer(""));
              }
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !steer.trim()}
            onClick={() =>
              void postAction("/steer", { instruction: steer.trim() }).then((ok) => ok && setSteer(""))
            }
          >
            <ArrowFatUp size={12} aria-hidden /> Steer
          </Button>
        </div>
      )}

      {/* gerbang fase — approve melanjutkan, reject menghentikan */}
      {gatePhase && (
        <Card className="flex-none border-warn/30 bg-warn-soft/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-body text-primary">Phase &ldquo;{phaseName(gatePhase.phaseId)}&rdquo; complete</b>
            <span className="text-caption text-dim">Approve to continue, or reject to stop the run.</span>
            <span className="flex-1" />
            <Button size="sm" variant="primary" onClick={() => void decideGate("approved")} disabled={busy}>
              <Check size={12} aria-hidden /> Approve
            </Button>
            <Button size="sm" variant="danger" onClick={() => void decideGate("rejected")} disabled={busy}>
              <X size={12} aria-hidden /> Reject
            </Button>
          </div>
        </Card>
      )}

      {/* pohon run (bahasa visual Team): root run → fase → step, connector garis */}
      {!run ? (
        runs === null ? (
          <Skeleton />
        ) : null
      ) : (
        <div className="flex flex-col gap-1 rounded-lg2 border border-line bg-inset p-3">
          {/* root: run dipimpin conductor */}
          <div className="flex w-full max-w-[460px] items-start gap-3 rounded-lg2 border border-line-strong bg-raised px-4 py-3">
            <PersonaFace personaId="yui-conductor" size={30} />
            <div className="min-w-0 flex-1">
              <b className="block text-body font-semibold text-primary">{run.workflow.name}</b>
              <small className="text-caption text-dim">
                run {run.id.slice(0, 10)} · {donePhases}/{run.workflow.phases.length} phases
              </small>
            </div>
          </div>
          {/* fase = cabang vertikal (konektor garis kiri) */}
          <div className="ml-6 flex flex-col">
            {run.workflow.phases.map((phase, i) => {
              const st = run.phaseStates.find((p) => p.phaseId === phase.id);
              return (
                <div key={phase.id} data-phase={phase.id} className="relative flex flex-col pb-1.5 pl-5 before:absolute before:top-0 before:bottom-0 before:left-0 before:border-l before:border-muted before:content-['']">
                  <div className="flex min-h-[34px] flex-wrap items-center gap-2">
                    <span
                      aria-hidden
                      className={`absolute top-[9px] -left-[1px] h-2 w-2 rounded-full ${PHASE_DOT[st?.status ?? "pending"]} ${st?.status === "running" ? "animate-pulse" : ""}`}
                    />
                    <span className="text-caption text-dim">{i + 1}</span>
                    <b className="min-w-0 truncate text-caption font-semibold text-primary" title={phase.name}>
                      {phase.name}
                    </b>
                    <Chip tone="muted" className="!px-2 !py-0.5">
                      {phase.mode === "parallel" ? "par" : "seq"}
                    </Chip>
                    {phase.gate !== false && (
                      <span className="text-[11px] text-dim" title="Human gate after this phase">
                        gate {st?.gatePassed ? "approved" : st?.status === "done" ? "awaiting" : "on"}
                      </span>
                    )}
                  </div>
                  {/* step = daun di bawah fase */}
                  <div className="ml-2 flex flex-col gap-1 border-l border-dashed border-line pl-3">
                    {(st && st.steps.length
                      ? st.steps
                      : phase.steps.map((ps) => ({ id: ps.id ?? "", personaId: ps.persona, ok: null, summary: "" }))
                    ).map((s) => {
                      const ss = st ? stepStatus(st, s) : "pending";
                      return (
                        <div
                          key={s.id}
                          data-step={s.id}
                          className={`flex items-center gap-2 rounded-md2 border px-2 py-1.5 ${
                            ss === "done"
                              ? "border-success/30 bg-success-soft/30"
                              : ss === "failed"
                                ? "border-danger/40 bg-danger-soft/30"
                                : ss === "running"
                                  ? "border-accent/40 bg-accent-soft/30"
                                  : "border-line bg-raised"
                          }`}
                        >
                          {ss === "running" ? (
                            <CircleNotch size={12} className="shrink-0 animate-spin text-accent" aria-label="running" />
                          ) : ss === "done" ? (
                            <Check size={12} weight="bold" className="shrink-0 text-success" aria-label="done" />
                          ) : ss === "failed" ? (
                            <X size={12} weight="bold" className="shrink-0 text-danger" aria-label="failed" />
                          ) : (
                            <Circle size={9} className="shrink-0 text-dim" aria-label="pending" />
                          )}
                          <PersonaFace personaId={s.personaId} size={18} />
                          <span className="min-w-0 flex-1 truncate text-caption text-secondary" title={s.personaId}>
                            <b className="font-semibold">{s.id}</b> · {s.personaId.replace("yui-", "")}
                          </span>
                          {s.summary && (
                            <small className="hidden max-w-[38%] truncate text-caption text-dim md:block" title={s.summary}>
                              {s.summary}
                            </small>
                          )}
                          {ss === "pending" && steerable && roster.length > 0 && (
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* start baru — brief opsional; kosong = template 7 fase standar */}
      <Card className="flex-none p-3">
        <div className="flex flex-wrap items-start gap-2">
          <textarea
            className="min-w-[240px] flex-1 resize-none rounded-md2 border border-line bg-control px-3 py-2 text-body text-primary outline-none focus:border-accent"
            rows={2}
            placeholder="Brief (optional) — goal given to the conductor"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            aria-label="Run brief"
          />
          <Button size="sm" variant="primary" onClick={() => void startRun()} disabled={busy}>
            <Play size={12} aria-hidden /> Start run
          </Button>
        </div>
        <small className="text-caption text-dim">
          Uses the 7-phase template (planning → research → design → develop → testing → docs → deliverable). A gate pauses after each phase.
        </small>
      </Card>

      {/* pilih run bila ada beberapa */}
      {runs && runs.length > 1 && (
        <div className="flex flex-none flex-wrap gap-1.5">
          {runs.map((r) => (
            <button
              key={r.id}
              className={`rounded-pill border px-2.5 py-1 text-caption ${
                r.id === runId ? "border-accent/40 bg-accent-soft text-accent-text" : "border-line bg-hover text-secondary hover:text-primary"
              }`}
              onClick={() => setRunId(r.id)}
            >
              {r.workflow.name} · {r.id}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
