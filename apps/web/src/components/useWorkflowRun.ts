"use client";
// useWorkflowRun (keputusan user 2026-11-08, tahap 2): state run workflow
// diangkat ke page, SATU COMPOSER untuk semua makna (steer saat run hidup /
// brief saat toggle Workflow Mode nyala / chat biasa). Bar di atas composer
// jadi strip status murni (chip, progres, gate, pause/resume/stop), tanpa
// input. Polling 2.5s + SSE sesi lead (throttle 300ms).
import { apiUrl, authFetch, authTokenQuery } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";

export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_gate"
  | "paused"
  | "done"
  | "failed"
  | "stopped";

export interface RunSummary {
  id: string;
  status: RunStatus;
  workflow: { name: string; phaseCount: number };
  leadSessionId?: string;
  createdAt: number;
}

export interface PhaseState {
  phaseId: string;
  status: "pending" | "running" | "done";
  steps: Array<{ id: string; personaId: string; ok: boolean | null; summary: string }>;
  gatePassed?: boolean;
}

export interface RunDetail {
  id: string;
  leadSessionId: string;
  workflow: { name: string; phases: Array<{ id: string; name?: string }> };
  status: RunStatus;
  phaseStates: PhaseState[];
}

const TERMINAL: RunStatus[] = ["done", "failed", "stopped"];

export function useWorkflowRun(projectId: string | null) {
  const [activeRun, setActiveRun] = useState<RunSummary | null>(null);
  /** Run terakhir (apa pun status), umpan balik "run selesai" di bar
   *  sebelum kembali ke mode armed (chip done/stopped terlihat). */
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const refetchTimer = useRef<number | null>(null);
  const runIdRef = useRef<string | null>(null);
  runIdRef.current = activeRun?.id ?? null;

  const loadActive = useCallback(async () => {
    if (!projectId) return;
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
    setLastRun(null);
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

  /** Aksi run (gate/steer/pause/resume/stop), dipakai bar & composer. */
  const postAction = useCallback(
    async (path: string, body?: unknown): Promise<boolean> => {
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
      } catch {
        return false;
      }
    },
    [activeRun?.id, loadRun, loadActive],
  );

  return { activeRun, lastRun, run, loadActive, loadRun, postAction };
}
