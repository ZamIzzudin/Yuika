"use client";
// WorkflowRunBar (keputusan user 2026-11-08): FOKUS KENDALI workflow ada di
// tab CHAT — brief (start run), steer mid-run, keputusan gate, pause/resume/
// stop. Tampil di atas composer HANYA saat persona aktif = conductor & ada
// project. Observasi run = tab Team (canvas delegasi); reassign step = tab
// Task. Lead session opsional = sesi chat ini (brief/steer masuk konteks
// conductor). Selector e2e dipertahankan: "Run brief", "Start run", "Steer
// instruction", "Steer", "Approve", "Reject", "Pause", "Resume", "Stop",
// teks status chip tepat satu (running/paused/done/…).
import { apiUrl, authFetch, authTokenQuery } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChatCircleDots, Play, Stop, X } from "@phosphor-icons/react";
import { Pause, ArrowFatUp } from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { Button, Chip } from "./ui";
import type { ChipTone } from "./ui/chip";
import { toastErr } from "./ui/toast";

type RunStatus = "queued" | "running" | "awaiting_gate" | "paused" | "done" | "failed" | "stopped";
interface RunSummary {
  id: string;
  status: RunStatus;
  workflow: { name: string; phaseCount: number };
  leadSessionId?: string;
  createdAt: number;
}
interface PhaseState {
  phaseId: string;
  status: "pending" | "running" | "done";
  steps: Array<{ id: string; personaId: string; ok: boolean | null; summary: string }>;
  gatePassed?: boolean;
}
interface RunDetail {
  id: string;
  leadSessionId: string;
  workflow: { name: string; phases: Array<{ id: string; name?: string }> };
  status: RunStatus;
  phaseStates: PhaseState[];
}

const TERMINAL: RunStatus[] = ["done", "failed", "stopped"];
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

export function WorkflowRunBar({
  projectId,
  sessionId,
}: {
  projectId: string;
  /** Sesi chat conductor aktif — dipakai sebagai lead run (opsional). */
  sessionId: string | null;
}) {
  const [activeRun, setActiveRun] = useState<RunSummary | null>(null);
  /** Run terakhir (apa pun statusnya) — umpan balik "run selesai" di bar
   *  sebelum reset ke form start (tanpa ini, chip done tak pernah terlihat). */
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [brief, setBrief] = useState("");
  const [steer, setSteer] = useState("");
  const [busy, setBusy] = useState(false);
  const refetchTimer = useRef<number | null>(null);
  const runIdRef = useRef<string | null>(null);
  runIdRef.current = activeRun?.id ?? null;

  const loadActive = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl(`/api/projects/${projectId}/workflows/runs`));
      if (!r.ok) return;
      const { runs } = (await r.json()) as { runs: RunSummary[] };
      // run aktif termuda (list DESC)
      const a = runs.find((x) => !TERMINAL.includes(x.status)) ?? null;
      setActiveRun((cur) => (cur?.id === a?.id && cur?.status === a?.status ? cur : a));
      if (a) setLastRun(null);
      else setLastRun((cur) => cur ?? runs[0] ?? null);
    } catch {
      /* biarkan state lama */
    }
  }, [projectId]);

  const loadRun = useCallback(async (id: string) => {
    const r = await authFetch(apiUrl(`/api/workflows/runs/${id}`));
    if (!r.ok) return;
    setRun((await r.json()).run as RunDetail);
  }, []);

  useEffect(() => {
    setActiveRun(null);
    setRun(null);
    void loadActive();
    const t = setInterval(() => void loadActive(), 2_500);
    return () => clearInterval(t);
  }, [loadActive]);

  useEffect(() => {
    if (!activeRun) {
      setRun(null);
      return;
    }
    void loadRun(activeRun.id);
  }, [activeRun, loadRun]);

  // live: SSE sesi lead run aktif → refetch detail (throttle 300ms)
  useEffect(() => {
    const id = activeRun?.id;
    const lead = run?.leadSessionId ?? activeRun?.leadSessionId;
    if (!id || !lead) return;
    const schedule = () => {
      if (refetchTimer.current !== null) return;
      refetchTimer.current = window.setTimeout(() => {
        refetchTimer.current = null;
        if (runIdRef.current === id) void loadRun(id);
      }, 300);
    };
    const es = new EventSource(apiUrl(`/api/sessions/${lead}/stream?since=0${authTokenQuery()}`));
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as { type: string; runId?: string };
        if (e.type?.startsWith("workflow.") && (!e.runId || e.runId === id)) {
          schedule();
          void loadActive(); // status run bisa berubah (done/dst.)
        }
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
  }, [activeRun?.id, run?.leadSessionId, activeRun?.leadSessionId, loadRun, loadActive]);

  async function startRun() {
    setBusy(true);
    try {
      const r = await authFetch(apiUrl(`/api/projects/${projectId}/workflows/runs`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim() || undefined,
          ...(sessionId ? { leadSessionId: sessionId } : {}), // chat ini = lead
        }),
      });
      const body = (await r.json()) as { runId?: string; error?: string };
      if (!r.ok || !body.runId) throw new Error(body.error ?? "gagal memulai run");
      setBrief("");
      await loadActive();
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "gagal memulai run");
    } finally {
      setBusy(false);
    }
  }

  async function postAction(path: string, body?: unknown): Promise<boolean> {
    const id = activeRun?.id;
    if (!id) return false;
    try {
      const r = await authFetch(apiUrl(`/api/workflows/runs/${id}${path}`), {
        method: "POST",
        ...(body === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "gagal");
      await Promise.all([loadRun(id), loadActive()]);
      return true;
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "gagal");
      return false;
    }
  }

  const steerable = activeRun
    ? ["running", "awaiting_gate", "paused"].includes(activeRun.status)
    : false;
  const donePhases = run?.phaseStates.filter((p) => p.status === "done").length ?? 0;
  const gatePhase =
    run && activeRun && ["awaiting_gate", "paused"].includes(activeRun.status)
      ? run.phaseStates.filter((p) => p.status === "done" && p.gatePassed === undefined).at(-1)
      : undefined;
  const gateName = gatePhase
    ? (run?.workflow.phases.find((p) => p.id === gatePhase.phaseId)?.name ?? gatePhase.phaseId)
    : null;

  return (
    <div
      aria-label="Workflow run bar"
      className="flex flex-col gap-1.5 rounded-lg2 border border-line bg-surface px-3 py-2"
    >
      {activeRun ? (
        <>
          {/* strip status + kontrol run aktif */}
          <div className="flex flex-wrap items-center gap-2">
            <PersonaFace personaId="yui-conductor" size={18} />
            <b className="text-caption font-semibold text-primary">Workflow</b>
            <Chip tone={STATUS_TONE[activeRun.status]}>{STATUS_LABEL[activeRun.status]}</Chip>
            <span className="text-caption text-dim">
              {run ? `${donePhases}/${run.phaseStates.length} phases · ` : ""}
              {activeRun.workflow.name}
            </span>
            <span className="flex-1" />
            {activeRun.status === "paused" ? (
              <Button size="sm" variant="primary" onClick={() => void postAction("/resume")} disabled={busy}>
                <Play size={11} aria-hidden /> Resume
              </Button>
            ) : (
              steerable && (
                <Button size="sm" variant="secondary" onClick={() => void postAction("/pause")} disabled={busy}>
                  <Pause size={11} aria-hidden /> Pause
                </Button>
              )
            )}
            {steerable && activeRun.status !== "paused" && (
              <Button size="sm" variant="danger" onClick={() => void postAction("/stop")} disabled={busy}>
                <Stop size={11} aria-hidden /> Stop
              </Button>
            )}
          </div>
          {/* gerbang — keputusan di chat */}
          {gatePhase && (
            <div className="flex flex-wrap items-center gap-2 rounded-md2 border border-warn/30 bg-warn-soft/40 px-2.5 py-1.5">
              <b className="text-caption text-primary">Phase &ldquo;{gateName}&rdquo; complete</b>
              <span className="text-caption text-dim">Approve to continue, or reject to stop.</span>
              <span className="flex-1" />
              <Button size="sm" variant="primary" onClick={() => void postAction("/gate", { decision: "approved" })} disabled={busy}>
                <Check size={11} aria-hidden /> Approve
              </Button>
              <Button size="sm" variant="danger" onClick={() => void postAction("/gate", { decision: "rejected" })} disabled={busy}>
                <X size={11} aria-hidden /> Reject
              </Button>
            </div>
          )}
          {/* steer mid-run */}
          {steerable && (
            <div className="flex items-center gap-2">
              <ChatCircleDots size={12} className="shrink-0 text-dim" aria-hidden />
              <input
                className="min-w-[140px] flex-1 rounded-md2 border border-line bg-control px-2.5 py-1 text-caption text-primary outline-none focus:border-accent"
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
                <ArrowFatUp size={11} aria-hidden /> Steer
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <PersonaFace personaId="yui-conductor" size={18} />
          <b className="text-caption font-semibold text-primary">Workflow</b>
          <span className="hidden text-caption text-dim sm:inline">
            7 phases · specialist personas · gate after each phase
          </span>
          <span className="flex-1" />
          <input
            className="min-w-[160px] max-w-[340px] flex-1 rounded-md2 border border-line bg-control px-2.5 py-1 text-caption text-primary outline-none focus:border-accent"
            placeholder="Brief (optional) — goal given to the conductor"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            aria-label="Run brief"
            onKeyDown={(e) => {
              if (e.key === "Enter") void startRun();
            }}
          />
          <Button size="sm" variant="primary" onClick={() => void startRun()} disabled={busy}>
            <Play size={11} aria-hidden /> Start run
          </Button>
          {lastRun && (
            <Chip tone={STATUS_TONE[lastRun.status]}>{STATUS_LABEL[lastRun.status]}</Chip>
          )}
        </div>
      )}
    </div>
  );
}
