"use client";
// P2-STU-2, tab Terminal: xterm.js ↔ sesi shell di apps/api (SSE + REST).
// Sesi SHARED dengan agent (tool `terminal`): output agent muncul live di
// sini, dan ketikan user mengalir ke stdin proses yang sama.
import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { apiUrl, authTokenQuery, authFetch } from "@/lib/api";

export interface TerminalTabProps {
  project: { id: string; name: string };
  /** D31: slot pojok kanan baris status, switcher Shell/Commands milik
   *  TerminalFullTab duduk sebaris dengan pill status. */
  toolbar?: React.ReactNode;
}

type Status = "connecting" | "live" | "exited" | "error";

export default function TerminalTab({ project, toolbar }: TerminalTabProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [note, setNote] = useState<string | null>(null);

  const writeLine = useCallback((text: string) => {
    termRef.current?.writeln(`\x1b[90m${text}\x1b[0m`);
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let dead = false;
    let term: Terminal | null = null;

    (async () => {
      // mulai/ambil sesi (satu per project, agent memakai sesi yang sama)
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
        // D30: selaras design system, bg persis --yui-bg-inset (#101010,
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
        // Echo lokal harus "digambar", bukan diteruskan mentah:
        // - Enter  \r    → \r\n (baris baru)
        // - Backspace \x7f → \b \b (hapus karakter terakhir di layar).
        //   Menulis \x7f mentah memicu "xterm.js: Parsing error: {}" (parser
        //   menolak DEL) DAN tidak menghapus apa pun di layar (D32, lapor user).
        // Ke backend tetap dikirim byte asli, pemrosesan tetap di sisi shell.
        if (d === "\r") term?.write("\r\n");
        else if (d === "\x7f") term?.write("\b \b");
        else term?.write(d);
        void authFetch(apiUrl(`/api/terminal/sessions/${info.id}/input`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: d === "\r" ? "\n" : d }),
        });
      });

      setStatus("live");
      writeLine(
        `@Yuika-Terminal > Project: "${project.name}" | Run in: ${info.backend === "Local" ? "(Local Host)" : "(Docker Sandbox)"}`,
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
        // chunk live, JANGAN echo ganda ketikan lokal (backend pipe tak echo,
        // tapi stdout shell bisa memantulkan perintah; kirim apa adanya).
        term?.write((ev as MessageEvent).data);
      });
      es.addEventListener("exit", () => {
        if (dead) return;
        setStatus("exited");
        writeLine("— session ended,");
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
    <div className="flex h-full min-h-0 flex-col gap-2.5 py-4">
      <div className="flex items-center gap-2 text-sm text-dim">
        <span
          aria-label="terminal status"
          className={
            status === "live"
              ? "text-accent border border-accent bg-accent/10 pr-3 pl-2 py-1 rounded-full capitalize"
              : status === "error"
                ? "text-danger"
                : "text-warning"
          }
        >
          ● {status}
        </span>
        {status === "exited" && <span>Failed to connect</span>}
        {note && <span className="text-danger">{note}</span>}
        {toolbar}
      </div>
      <div
        ref={holderRef}
        data-testid="terminal-holder"
        className="min-h-0 flex-1 overflow-hidden rounded-lg2 border border-line bg-inset p-3"
      />
    </div>
  );
}
