"use client";
// panel Workshop: status + lifecycle + log + egress.
// Rumah kerja persisten project: dibuka SEKALI oleh user (persetujuan
// pembukaan = klik Start), persona memakainya lewat run_in_workshop.
import { useCallback, useEffect, useState } from "react";
import type { WorkshopInfo, WorkshopLogItem } from "@yuika/contracts";
import { apiUrl, authFetch } from "@/lib/api";
import { Button, Card, Chip, ConfirmDialog, TextArea } from "./ui";
import { toastErr, toastOk } from "./ui/toast";
import { Barricade } from "@phosphor-icons/react";

function fmtDur(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

const STATE_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "muted" | "accent"
> = {
  running: "ok",
  starting: "accent",
  asleep: "muted",
  stopped: "muted",
  error: "danger",
  absent: "muted",
};

export function WorkshopPanel({
  projectId,
  rev,
}: {
  projectId: string;
  rev: number;
}) {
  const [info, setInfo] = useState<WorkshopInfo | null>(null);
  const [log, setLog] = useState<WorkshopLogItem[]>([]);
  const [egress, setEgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "destroy" | "reset">(null);
  const [cmd, setCmd] = useState("");
  const [out, setOut] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [i, l] = await Promise.all([
        authFetch(apiUrl(`/api/projects/${projectId}/workshop`)),
        authFetch(apiUrl(`/api/projects/${projectId}/workshop/log`)),
      ]);
      if (i.ok)
        setInfo(((await i.json()) as { workshop: WorkshopInfo }).workshop);
      if (l.ok) setLog(((await l.json()) as { log: WorkshopLogItem[] }).log);
    } catch {
      /* retry next rev */
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [rev, refresh]);

  useEffect(() => {
    if (info && info.egressAllow.length > 0 && egress === "") {
      setEgress(info.egressAllow.join("\n"));
    }
  }, [info, egress]);

  async function call(path: string, body?: unknown, okMsg?: string) {
    setBusy(true);
    try {
      const res = await authFetch(
        apiUrl(`/api/projects/${projectId}/workshop/${path}`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        },
      );
      const d = (await res.json().catch(() => ({}))) as {
        workshop?: WorkshopInfo;
        error?: string;
      };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (d.workshop) setInfo(d.workshop);
      if (okMsg) toastOk(okMsg);
      await refresh();
    } catch (e) {
      toastErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runCmd() {
    if (!cmd.trim()) return;
    setBusy(true);
    setOut(null);
    try {
      const [c, ...args] = cmd.trim().split(/\s+/);
      const res = await authFetch(
        apiUrl(`/api/projects/${projectId}/workshop/exec`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cmd: c, args }),
        },
      );
      const d = (await res.json()) as {
        result?: { exitCode: number; stdout: string; stderr: string };
        error?: string;
      };
      if (!res.ok || !d.result)
        throw new Error(d.error ?? `HTTP ${res.status}`);
      setOut(
        `$ ${cmd}\n${d.result.stdout}${d.result.stderr ? `\n${d.result.stderr}` : ""}\n[exit ${d.result.exitCode}]`,
      );
      await refresh();
    } catch (e) {
      toastErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const st = info?.state ?? "absent";

  return (
    <div className="flex flex-col gap-4" aria-label="Workshop panel">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <b className="text-body font-semibold text-primary">Workshop</b>
            <Chip size="sm" tone={STATE_TONE[st] ?? "muted"}>{st}</Chip>
            {info?.backend === "local" && (
              <Chip size="sm" tone="warn">local fallback, no isolation</Chip>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {st === "absent" || st === "stopped" || st === "error" ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  void call(
                    "start",
                    egress.trim()
                      ? {
                          egressAllow: egress
                            .split(/\n+/)
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }
                      : undefined,
                    "Workshop started",
                  )
                }
              >
                Start
              </Button>
            ) : st === "running" ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void call("sleep", undefined, "Workshop asleep")}
              >
                Sleep
              </Button>
            ) : null}
            {st !== "absent" && (
              <>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void call("recover", undefined, "Workshop recovered")
                  }
                >
                  Recover
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirm("reset")}
                >
                  Reset
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => setConfirm("destroy")}
                >
                  Destroy
                </Button>
              </>
            )}
          </div>
        </div>
        {info && st !== "absent" && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-dim">
            <span>
              container <code>{info.containerName}</code>
            </span>
            <span>uptime total {fmtDur(info.uptimeMs)}</span>
            <span>
              cap {info.resourceCap.memory} · {info.resourceCap.cpus} cpu ·{" "}
              {info.resourceCap.pidsLimit} pids
            </span>
          </div>
        )}
        {st === "absent" && (
          <p className="text-caption text-dim">
            A persistent container for this project, a warm home for installs
            and builds (files survive sleep/wake). Egress limited to the
            allowlist below. Opening it is your decision; personas use it via{" "}
            <code>run_in_workshop</code> only after it exists.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-caption text-secondary">
            Egress allowlist (one domain per line, saved on Start)
          </span>
          <TextArea
            value={egress}
            onChange={(e) => setEgress(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder={"registry.npmjs.org\ngithub.com"}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <b className="text-body font-semibold text-primary">Run a command</b>
        <div className="flex gap-2 items-center">
          <input
            className="min-w-0 flex-1 rounded-md2 border border-line bg-raised px-3 py-2 text-body text-secondary placeholder:text-dim focus:border-accent focus:outline-none"
            placeholder="node -v  ·  npm ls  ·  ls /home/node"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void runCmd()}
            aria-label="Workshop command"
          />
          <Button
            variant="primary"
            disabled={busy || st === "absent"}
            onClick={() => void runCmd()}
          >
            Run
          </Button>
        </div>
        {out && (
          <pre className="max-h-64 overflow-auto rounded-md2 bg-inset p-3 text-caption whitespace-pre-wrap">
            {out}
          </pre>
        )}
        {st === "absent" && (
          <p className="text-caption text-dim">Start the workshop first.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-2 p-4 space-y-3">
        <b className="text-body font-semibold text-primary inline-block">Log</b>
        {log.length === 0 && (
          <div className="w-full flex flex-col items-center py-5">
            <Barricade className="text-dim" size={48} />
            <span className="text-lg text-dim">No Logs.</span>
          </div>
        )}
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {log.map((l, i) => (
            <div
              key={`${l.at}-${i}`}
              className="flex items-baseline gap-2 text-caption"
            >
              <span className="tabular-nums text-dim">
                {new Date(l.at).toLocaleTimeString()}
              </span>
              <Chip
                size="sm"
                tone={
                  l.kind === "error"
                    ? "danger"
                    : l.kind === "command"
                      ? "accent"
                      : "muted"
                }
              >
                {l.kind}
              </Chip>
              <span className="min-w-0 flex-1 overflow-wrap-anywhere text-secondary">
                {l.by !== "system" && <b>{l.by} </b>}
                {l.text}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {confirm && (
        <ConfirmDialog
          open
          title={
            confirm === "destroy" ? "Destroy workshop?" : "Reset workshop?"
          }
          message={
            confirm === "destroy"
              ? "The container and its volume are removed. Files inside the workshop are lost forever."
              : "The container and volume are recreated empty. Files inside the workshop are lost."
          }
          confirmLabel={confirm === "destroy" ? "Destroy" : "Reset"}
          busy={busy}
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            void call(
              c,
              undefined,
              c === "destroy" ? "Workshop destroyed" : "Workshop reset",
            );
          }}
        />
      )}
    </div>
  );
}
