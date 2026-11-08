"use client";
// P2-STU-2 — tab Terminal: xterm.js ↔ sesi shell di apps/api (SSE + REST).
// Sesi SHARED dengan agent (tool `terminal`): output agent muncul live di
// sini, dan ketikan user mengalir ke stdin proses yang sama.
import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { apiUrl, authTokenQuery, authFetch } from "@/lib/api";

export interface TerminalTabProps {
  project: { id: string; name: string };
}

type Status = "connecting" | "ready" | "exited" | "error";

export default function TerminalTab({ project }: TerminalTabProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [backend, setBackend] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);

  const writeLine = useCallback((text: string) => {
    termRef.current?.writeln(`\x1b[90m${text}\x1b[0m`);
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let dead = false;
    let term: Terminal | null = null;

    (async () => {
      // mulai/ambil sesi (satu per project — agent memakai sesi yang sama)
      let info: { id: string; backend: string; exited: boolean } | null = null;
      try {
        const res = await authFetch(apiUrl("/api/terminal/sessions"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId: project.id }),
        });
        if (!res.ok) throw new Error(await res.text());
        info = await res.json();
      } catch (err) {
        if (!dead) {
          setStatus("error");
          setNote(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      if (dead || !info) return;

      term = new Terminal({
        fontSize: 12,
        cursorBlink: true,
        convertEol: true,
        scrollback: 5_000,
        // D30: selaras design system — bg persis --yui-bg-inset (#101010,
        // sama dengan pane Files), foreground sekunder, kursor & seleksi aksen.
        theme: {
          background: "#101010",
          foreground: "#dcdcdc",
          cursor: "#42a0ff",
          cursorAccent: "#101010",
          selectionBackground: "rgba(0,124,247,0.30)",
        },
      });
      termRef.current = term;
      const fit = new FitAddon();
      term.loadAddon(fit);
      if (holderRef.current) {
        term.open(holderRef.current);
        fit.fit();
        const onResize = () => fit.fit();
        window.addEventListener("resize", onResize);
        (term as unknown as { __offResize?: () => void }).__offResize = () =>
          window.removeEventListener("resize", onResize);
      }

      // lokal-echo: tanpa PTY, backend tidak memantulkan ketikan (v1 pipe).
      let lastInputAt = 0;
      term.onData((d) => {
        if (!info) return;
        lastInputAt = Date.now();
        term?.write(d === "\r" ? "\r\n" : d);
        void authFetch(apiUrl(`/api/terminal/sessions/${info.id}/input`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: d === "\r" ? "\n" : d }),
        });
      });

      setStatus("ready");
      setBackend(info.backend);
      writeLine(
        `— Yuika terminal · project: ${project.name} · backend: ${info.backend}${info.backend === "local" ? " (host, tanpa isolasi)" : " (sandbox)"} —`,
      );

      es = new EventSource(
        apiUrl(
          `/api/terminal/sessions/${info.id}/stream?1=1${authTokenQuery()}`,
        ),
      );
      es.addEventListener("replay", (ev) => {
        term?.write((ev as MessageEvent).data);
      });
      es.addEventListener("data", (ev) => {
        // chunk live — JANGAN echo ganda ketikan lokal (backend pipe tak echo,
        // tapi stdout shell bisa memantulkan perintah; kirim apa adanya).
        term?.write((ev as MessageEvent).data);
      });
      es.addEventListener("exit", () => {
        if (dead) return;
        setStatus("exited");
        writeLine("— session ended —");
      });
      es.onerror = () => {
        /* SSE reconnect otomatis browser; replay idempotent via ring */
      };
      void lastInputAt;
    })();

    return () => {
      dead = true;
      es?.close();
      (term as unknown as { __offResize?: () => void })?.__offResize?.();
      term?.dispose();
      termRef.current = null;
    };
  }, [project.id, project.name, writeLine]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 p-4">
      <div className="flex items-center gap-2 text-xs text-dim">
        <span
          aria-label="terminal status"
          className={
            status === "ready"
              ? "text-success"
              : status === "error"
                ? "text-danger"
                : "text-warning"
          }
        >
          ● {status}
        </span>
        {backend && <span>Run in : {backend}</span>}
        {status === "exited" && <span>— restart dari tombol project</span>}
        {note && <span className="text-danger">{note}</span>}
      </div>
      <div
        ref={holderRef}
        data-testid="terminal-holder"
        className="min-h-0 flex-1 overflow-hidden rounded-lg2 border border-line bg-inset p-3"
      />
    </div>
  );
}
