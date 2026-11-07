"use client";
// WorkflowRunBar (keputusan user 2026-11-08, tahap 2): STRIP STATUS MURNI —
// semua input (brief & steer) digabung ke composer chat. Satu input, makna
// menurut konteks: run hidup → steer; toggle Workflow Mode nyala → brief;
// selain itu chat biasa. Bar hanya: chip status, progres fase, banner gate
// Approve/Reject, Pause/Resume/Stop. State & fetching = useWorkflowRun
// (page). Selector e2e dipertahankan: "Workflow run bar", "Approve",
// "Reject", "Pause", "Resume", "Stop", teks status chip tepat satu.
import { Check, Play, Steps, Stop, X } from "@phosphor-icons/react";
import { Pause } from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { Button, Chip } from "./ui";
import type { ChipTone } from "./ui/chip";
import type { RunDetail, RunStatus, RunSummary } from "./useWorkflowRun";

export const WF_STATUS_TONE: Record<RunStatus, ChipTone> = {
  queued: "muted",
  running: "accent",
  awaiting_gate: "warn",
  paused: "info",
  done: "ok",
  failed: "danger",
  stopped: "muted",
};
export const WF_STATUS_LABEL: Record<RunStatus, string> = {
  queued: "queued",
  running: "running",
  awaiting_gate: "awaiting approval",
  paused: "paused",
  done: "done",
  failed: "failed",
  stopped: "stopped",
};

export function WorkflowRunBar({
  armed,
  activeRun,
  lastRun,
  run,
  busy,
  onAction,
}: {
  /** Toggle Workflow Mode nyala (composer = brief run berikutnya). */
  armed: boolean;
  activeRun: RunSummary | null;
  lastRun: RunSummary | null;
  run: RunDetail | null;
  busy: boolean;
  /** POST /gate /pause /resume /stop (path relatif id run). */
  onAction: (path: string, body?: unknown) => Promise<boolean>;
}) {
  const steerable = activeRun
    ? ["queued", "running", "awaiting_gate", "paused"].includes(activeRun.status)
    : false;
  const donePhases = run?.phaseStates.filter((p) => p.status === "done").length ?? 0;
  const gatePhase =
    run && activeRun && ["awaiting_gate", "paused"].includes(activeRun.status)
      ? run.phaseStates.filter((p) => p.status === "done" && p.gatePassed === undefined).at(-1)
      : undefined;
  const gateName = gatePhase
    ? (run?.workflow.phases.find((p) => p.id === gatePhase.phaseId)?.name ?? gatePhase.phaseId)
    : null;

  // tanpa run aktif & toggle mati → tidak ada bar sama sekali (chat murni)
  if (!activeRun && !armed) return null;

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
            <Chip tone={WF_STATUS_TONE[activeRun.status]}>{WF_STATUS_LABEL[activeRun.status]}</Chip>
            <span className="text-caption text-dim">
              {run ? `${donePhases}/${run.phaseStates.length} phases · ` : ""}
              {activeRun.workflow.name}
            </span>
            <span className="flex-1" />
            <span className="hidden text-caption text-dim sm:inline">
              messages steer the run
            </span>
            {activeRun.status === "paused" ? (
              <Button size="sm" variant="primary" onClick={() => void onAction("/resume")} disabled={busy}>
                <Play size={11} aria-hidden /> Resume
              </Button>
            ) : (
              steerable && (
                <Button size="sm" variant="secondary" onClick={() => void onAction("/pause")} disabled={busy}>
                  <Pause size={11} aria-hidden /> Pause
                </Button>
              )
            )}
            {steerable && activeRun.status !== "paused" && (
              <Button size="sm" variant="danger" onClick={() => void onAction("/stop")} disabled={busy}>
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
              <Button size="sm" variant="primary" onClick={() => void onAction("/gate", { decision: "approved" })} disabled={busy}>
                <Check size={11} aria-hidden /> Approve
              </Button>
              <Button size="sm" variant="danger" onClick={() => void onAction("/gate", { decision: "rejected" })} disabled={busy}>
                <X size={11} aria-hidden /> Reject
              </Button>
            </div>
          )}
          {/* steer: cukup ketik di composer (pesan apapun = instruksi steer) */}
          {steerable && (
            <div className="flex items-center gap-2 text-caption text-dim">
              <Steps size={12} aria-hidden />
              <span>
                Composer is steering this run — describe the change, it applies from the next
                phase.
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <PersonaFace personaId="yui-conductor" size={18} />
          <b className="text-caption font-semibold text-primary">Workflow armed</b>
          <span className="text-caption text-dim">
            your next message becomes the run brief — 7 phases, gate after each
          </span>
          <span className="flex-1" />
          {lastRun && <Chip tone={WF_STATUS_TONE[lastRun.status]}>{WF_STATUS_LABEL[lastRun.status]}</Chip>}
        </div>
      )}
    </div>
  );
}
