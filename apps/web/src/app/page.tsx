"use client";
/**
 * Your-Yui demo shell — orchestrator UI (DEMO-WEEK-1 §2):
 * persona picker → sesi → SSE event stream → render msg/activity/delegation/approval.
 * SEMUA tipe dari @yui/contracts (dilarang tipe tangan — PLAN §6.3).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PersonaOrbit, PersonaFace } from "@/components/PersonaPicker";
import {
  CaretDown,
  CommandIcon,
  Gear,
  Plus,
  SidebarSimple,
  Sword,
} from "@phosphor-icons/react";
import { DungeonView } from "@/components/DungeonView";
import { TracePanel } from "@/components/TracePanel";
import { PersonaPortrait } from "@/components/PersonaPortrait";
import { ChatView, type ChatItem } from "@/components/ChatView";
import { ProjectPanel } from "@/components/ProjectPanel";
import { SettingsModal } from "@/components/SettingsModal";
import {
  ProjectTabs,
  type LiveDelegation,
  type WorkspaceTab,
} from "@/components/TaskDrawer";
import { Skeleton } from "@/components/Skeleton";
import { Dot, StateChip, TabList } from "@/components/ui";
import type {
  PersonaInfo,
  PersonaState,
  ProjectInfo,
  ProjectSessionSummary,
  YuiEvent,
} from "@yui/contracts";

/** Prompt saran per persona (pola ConversationPrompts OpenBot — klik = kirim). */
const SUGGESTIONS: Record<string, string[]> = {
  "yui-conductor": [
    "Riset 3 framework JS paling populer, bandingkan singkat, tulis laporan markdown ke reports/",
    "Susun rencana riset kompetitor aplikasi notes, lalu delegasikan",
  ],
  "yui-scholar": [
    "Riset tren AI agent 2025 dari web, tulis poin-poin dengan sumber",
    "Bandingkan SQLite vs Postgres untuk aplikasi lokal-first",
  ],
  "yui-scribe": [
    "Tulis draf laporan mingguan tim (markdown) ke reports/",
    "Ringkas hasil kerja sesi ini jadi memo satu halaman",
  ],
  "yui-coder": [
    "Review packages/core/src/loop.ts dan beri catatan perhatian",
    "Buat skrip kecil untuk memeriksa kontrak event lalu jelaskan",
  ],
};

export default function Home() {
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);
  /** P1-DUN-4: halaman Dungeon (arena latihan persona) — view terpisah di main. */
  const [dungeonOpen, setDungeonOpen] = useState(false);
  // Sidebar fold/unfold — persist di localStorage (yui.sidebar: "open" | "folded");
  // layar sempit (<768px) default lipat. Shortcut: Ctrl/Cmd+B.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((v) => {
      try {
        localStorage.setItem("yui.sidebar", v ? "folded" : "open");
      } catch {}
      return !v;
    });
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("yui.sidebar");
      if (saved === "folded") setSidebarOpen(false);
      else if (!saved && window.innerWidth < 768) setSidebarOpen(false);
    } catch {}
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);
  const [active, setActive] = useState<PersonaInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [personaState, setPersonaState] = useState<PersonaState>("idle");
  const [busy, setBusy] = useState(false);
  const lastEventId = useRef(0);

  // Project scope (P1-PRJ-6 shell v0): sesi yang dibuat melekat ke project aktif —
  // file-ops & tasklist agent otomatis ter-scope (P1-PRJ-2/4).
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [taskRev, setTaskRev] = useState(0); // naik saat agent menyentuh todo_* → drawer refresh
  const [mainTab, setMainTab] = useState<WorkspaceTab>("chat");
  const [projSessions, setProjSessions] = useState<ProjectSessionSummary[]>([]);
  const [booted, setBooted] = useState(false); // skeleton hanya selama fetch awal
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const loadProjects = useCallback(async () => {
    try {
      const r = await fetch("/api/projects");
      if (!r.ok) return;
      const d = (await r.json()) as { projects: ProjectInfo[] };
      setProjects(d.projects);
      setActiveProjectId((cur) =>
        cur && d.projects.some((p) => p.id === cur) ? cur : null,
      );
    } catch {
      /* biarkan kosong */
    } finally {
      setBooted(true);
    }
  }, []);

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem("yui.projectId")
        : null;
    if (saved) setActiveProjectId(saved);
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (activeProjectId)
      window.localStorage.setItem("yui.projectId", activeProjectId);
    else window.localStorage.removeItem("yui.projectId");
  }, [activeProjectId]);

  useEffect(() => {
    fetch("/api/personas")
      .then((r) => r.json())
      .then((d: { personas: PersonaInfo[] }) => setPersonas(d.personas))
      .catch(console.error);
  }, []);

  // Assistant streaming: delta ditumpuk ke item terakhir; id item disimpan di sini.
  const openAssistant = useRef<number | null>(null);
  // Reasoning streaming (fix dev-10): item sendiri, kolaps-able.
  const openReasoning = useRef<number | null>(null);

  const applyEvent = useCallback((e: YuiEvent) => {
    // Dedupe: SSE replay+live bisa overlap saat reconnect (safety net — server sudah
    // dedupe by id; id monotonic per sesi).
    if (e.id <= lastEventId.current) return;
    lastEventId.current = Math.max(lastEventId.current, e.id);
    if (
      e.type !== "message.delta" &&
      e.type !== "reasoning.delta" &&
      e.type !== "delegation.delta"
    ) {
      setTraceTick((t) => t + 1); // delta streaming tak mengubah struktur trace
    }
    switch (e.type) {
      case "turn.started":
        setBusy(true);
        break;
      case "message.delta":
        setItems((prev) => {
          const idx = openAssistant.current;
          if (idx !== null && prev[idx]?.kind === "msg") {
            const next = [...prev];
            next[idx] = {
              ...next[idx]!,
              text: (next[idx]!.text ?? "") + e.delta,
            };
            return next;
          }
          openAssistant.current = prev.length;
          return [
            ...prev,
            { kind: "msg", role: "assistant", text: e.delta, streaming: true },
          ];
        });
        break;
      case "message.done":
        setItems((prev) => {
          const idx = openAssistant.current;
          openAssistant.current = null;
          // reasoning stream juga selesai saat jawaban final mulai
          const rIdx = openReasoning.current;
          openReasoning.current = null;
          let next = prev;
          if (
            rIdx !== null &&
            prev[rIdx]?.kind === "reasoning" &&
            prev[rIdx]?.streaming
          ) {
            next = [...prev];
            next[rIdx] = { ...next[rIdx]!, streaming: false };
          }
          if (idx !== null && prev[idx]?.kind === "msg") {
            if (next === prev) next = [...prev];
            next[idx] = { ...next[idx]!, streaming: false };
            return next;
          }
          return next;
        });
        break;
      case "reasoning.delta":
        setItems((prev) => {
          const idx = openReasoning.current;
          if (idx !== null && prev[idx]?.kind === "reasoning") {
            const next = [...prev];
            next[idx] = {
              ...next[idx]!,
              text: (next[idx]!.text ?? "") + e.delta,
            };
            return next;
          }
          openReasoning.current = prev.length;
          return [
            ...prev,
            { kind: "reasoning", text: e.delta, streaming: true },
          ];
        });
        break;
      case "tool.call":
        setItems((prev) => [
          ...prev,
          {
            kind: "activity",
            name: e.name,
            callId: e.callId,
            detail: short(JSON.stringify(e.args)),
            done: false,
          },
        ]);
        if (e.name.startsWith("todo_")) setTaskRev((r) => r + 1); // drawer tasklist refresh
        break;
      case "tool.result":
        setItems((prev) => {
          // tutup activity tool.call yang cocok (match via callId — ToolResultEvent tanpa name)
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i]!.kind === "activity" && next[i]!.callId === e.callId) {
              next[i] = {
                ...next[i]!,
                detail: short(JSON.stringify(e.result)),
                isError: e.isError,
                done: true,
              };
              return next;
            }
          }
          return [
            ...prev,
            {
              kind: "activity",
              name: e.callId,
              detail: short(JSON.stringify(e.result)),
              isError: e.isError,
            },
          ];
        });
        break;
      case "delegation.delta":
        // Fix dev-10: feed live anak → streaming di kartu delegasi (bukan diam).
        setItems((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (
              next[i]!.kind === "delegation" &&
              next[i]!.childSessionId === e.childSessionId &&
              !next[i]!.text
            ) {
              const buf =
                next[i]!.liveKind === e.kind ? (next[i]!.liveText ?? "") : "";
              let live = buf + e.delta;
              if (live.length > 600) live = live.slice(-600); // ekor saja — ringan
              next[i] = {
                ...next[i]!,
                liveText: live,
                liveKind: e.kind,
                childState: "working",
              };
              break;
            }
          }
          return next;
        });
        break;
      case "delegation.started":
        setItems((prev) => [
          ...prev,
          {
            kind: "delegation",
            personaId: e.personaId,
            childSessionId: e.childSessionId,
            goal: e.goal,
          },
        ]);
        break;
      case "delegation.progress":
        setItems((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (
              next[i]!.kind === "delegation" &&
              next[i]!.childSessionId === e.childSessionId &&
              !next[i]!.text
            ) {
              next[i] = { ...next[i]!, childState: e.state };
              break;
            }
          }
          return next;
        });
        break;
      case "delegation.done":
        setItems((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (
              next[i]!.kind === "delegation" &&
              next[i]!.personaId /* match last open */
            ) {
              if (next[i]!.text) continue; // sudah ada summary → cari yang belum
              next[i] = { ...next[i]!, text: e.summary, childState: "done" };
              break;
            }
          }
          return next;
        });
        break;
      case "persona.state":
        setPersonaState(e.state);
        if (
          e.state === "done" ||
          e.state === "celebrating" ||
          e.state === "error" ||
          e.state === "idle"
        ) {
          setBusy(false);
        }
        break;
      case "approval.requested":
        setItems((prev) => [
          ...prev,
          {
            kind: "approval",
            requestId: e.requestId,
            name: e.tool,
            reason: e.reason,
            resolved: null,
          },
        ]);
        break;
      case "approval.resolved":
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "approval" && it.requestId === e.requestId
              ? {
                  ...it,
                  resolved: e.approved
                    ? ("approved" as const)
                    : ("denied" as const),
                }
              : it,
          ),
        );
        break;
      case "approval.expired":
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "approval" && it.requestId === e.requestId
              ? { ...it, resolved: "expired" as const }
              : it,
          ),
        );
        break;
      case "memory.noted":
        setItems((prev) => [
          ...prev,
          { kind: "noted", text: e.note, scope: e.scope },
        ]);
        break;
      case "context.compressed":
        // P0-CORE-4: transparansi — user tahu konteks lama diringkas (riwayat asli utuh).
        setItems((prev) => [
          ...prev,
          {
            kind: "compressed",
            n: e.messagesSummarized,
            before: e.estTokensBefore,
            after: e.estTokensAfter,
          },
        ]);
        break;
      case "skill.proposed":
        setItems((prev) => [
          ...prev,
          { kind: "skill", text: `${e.name} — ${e.description}` },
        ]);
        break;
      case "turn.cancelled":
        setItems((prev) => [
          ...prev,
          {
            kind: "noted",
            text: "turn cancelled — progress & partial output saved",
            scope: "project",
          },
        ]);
        setBusy(false);
        break;
      case "session.error":
        setItems((prev) => [...prev, { kind: "error", text: e.message }]);
        setBusy(false);
        break;
    }
  }, []);

  // SSE: buka saat sesi ada. DUA jalur pemulihan (bug "UI diam walau trace jalan"):
  //  (a) browser auto-reconnect (CONNECTING) — aman, applyEvent dedupe by id;
  //  (b) FATAL (CLOSED, mis. route 500 sesaat / dev recompile) — browser TIDAK
  //      reconnect; kita buat ulang EventSource dengan backoff (1s→15s),
  //      ?since=lastEventId → tanpa celah/duplikat.
  useEffect(() => {
    if (!sessionId) return;
    let es: EventSource | null = null;
    let dead = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = async () => {
      // Fix 2026-11 ("timelapse"): sesi lama (since=0) → tarik snapshot dalam
      // SATU fetch lalu apply sinkron dalam satu tick (React batch = satu render,
      // tanpa efek streaming ulang) — baru buka SSE live dari seq terakhir.
      if (lastEventId.current === 0) {
        try {
          const r = await fetch(
            `/api/sessions/${sessionId}/stream?since=0&snapshot=1`,
          );
          if (r.ok) {
            const text = await r.text();
            let last = 0;
            for (const block of text.split("\n\n")) {
              const idLine = block
                .split("\n")
                .find((l) => l.startsWith("id: "));
              if (idLine) last = Math.max(last, Number(idLine.slice(4)) || 0);
              const line = block
                .split("\n")
                .find((l) => l.startsWith("data: "));
              if (!line) continue;
              try {
                applyEvent(JSON.parse(line.slice(6)) as YuiEvent);
              } catch {
                /* blok tidak lengkap */
              }
            }
            if (last > 0) lastEventId.current = last;
          }
        } catch {
          /* fallback: SSE replay seperti biasa */
        }
      }
      if (dead) return;
      es = new EventSource(
        `/api/sessions/${sessionId}/stream?since=${lastEventId.current}`,
      );
      es.onmessage = (m) => {
        attempt = 0;
        try {
          applyEvent(JSON.parse(m.data) as YuiEvent);
        } catch (err) {
          console.error("event parse gagal", err);
        }
      };
      es.onerror = () => {
        if (dead || !es) return;
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          const delay = Math.min(1000 * 2 ** attempt++, 15_000);
          timer = setTimeout(open, delay);
        }
        // CONNECTING = auto-retry browser (replay ?since lama; dedupe by id)
      };
    };
    open();
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [sessionId, applyEvent]);

  // Resync saat window kembali fokus: tarik snapshot event sejak lastEventId —
  // menutup celah apa pun yang terlewat (SSE mati saat tab di background, dll).
  useEffect(() => {
    const resync = async () => {
      if (!sessionId) return;
      try {
        const r = await fetch(
          `/api/sessions/${sessionId}/stream?since=${lastEventId.current}&snapshot=1`,
        );
        if (!r.ok) return;
        const text = await r.text();
        for (const block of text.split("\n\n")) {
          const line = block.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            applyEvent(JSON.parse(line.slice(6)) as YuiEvent);
          } catch {
            /* blok tidak lengkap */
          }
        }
      } catch {
        /* offline — SSE watchdog akan ambil alih */
      }
    };
    window.addEventListener("focus", resync);
    return () => window.removeEventListener("focus", resync);
  }, [sessionId, applyEvent]);

  async function pick(p: PersonaInfo, projectIdOverride?: string | null) {
    setActive(p);
    setItems([]);
    setPersonaState("idle");
    openAssistant.current = null;
    lastEventId.current = 0;
    const projectId =
      projectIdOverride !== undefined ? projectIdOverride : activeProjectId;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personaId: p.id, projectId: projectId ?? null }),
    });
    const d = (await res.json()) as { sessionId: string };
    setSessionId(d.sessionId);
    if (projectId) void loadProjectSessions(projectId);
  }

  /** Ganti scope project → project = sesi langsung dengan PROJECT LEAD (Conductor):
   *  user tak pernah memilih persona manual di scope project — sebutkan tugasnya,
   *  Conductor mendelegasikan ke spesialis sesuai keahlian (delegate_task).
   *  Resume: bila project sudah punya sesi, sesi TERBARU dibuka kembali (replay SSE). */
  async function pickProject(id: string | null) {
    setActiveProjectId(id);
    setMainTab("chat");
    setDungeonOpen(false); // pilih project = keluar dari halaman Dungeon
    if (!id) {
      // Workspace global: persona dipilih dari kartu di tengah layar
      resetSession();
      setProjSessions([]);
      return;
    }
    const list = await loadProjectSessions(id);
    if (list.length > 0) {
      openSession(list[0]!);
    } else {
      const lead =
        personas.find((p) => p.id === "yui-conductor") ?? personas[0];
      if (lead) void pick(lead, id);
    }
  }

  async function loadProjectSessions(
    projectId: string,
  ): Promise<ProjectSessionSummary[]> {
    const res = await fetch(`/api/sessions?projectId=${projectId}`);
    const d = (await res.json()) as { sessions: ProjectSessionSummary[] };
    setProjSessions(d.sessions);
    return d.sessions;
  }

  /** Buka kembali sesi lama: SSE replay sejak event 0 → percakapan penuh kembali,
   *  turn berikutnya melanjutkan context (history append-only di store). */
  function openSession(s: ProjectSessionSummary) {
    const p = personas.find((x) => x.id === s.personaId) ?? null;
    setActive(p);
    setItems([]);
    setPersonaState("idle");
    openAssistant.current = null;
    lastEventId.current = 0;
    setSessionId(s.sessionId);
    setBusy(false);
  }

  /** Kartu delegasi di chat → lompat langsung ke sesi persona anak tersebut. */
  function jumpToSession(sid: string) {
    const s = projSessions.find((x) => x.sessionId === sid);
    if (s) {
      openSession(s);
      setMainTab("chat");
    }
  }

  /** Sesi baru di project aktif (Conductor lead). */
  async function newProjectSession() {
    if (!activeProjectId) return;
    const lead = personas.find((p) => p.id === "yui-conductor") ?? personas[0];
    if (lead) await pick(lead, activeProjectId);
  }

  function resetSession() {
    setActive(null);
    setSessionId(null);
    setItems([]);
    setPersonaState("idle");
    lastEventId.current = 0;
    openAssistant.current = null;
  }

  /** Ganti persona di tengah project (mis. bicara langsung ke spesialis) → sesi baru. */
  async function switchPersona(p: PersonaInfo) {
    if (p.id === active?.id) return;
    await pick(p);
  }

  async function send(text: string) {
    if (!sessionId) return;
    setItems((prev) => [...prev, { kind: "msg", role: "user", text }]);
    await fetch(`/api/sessions/${sessionId}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }

  /** P0-CORE-1: tombol Stop — abort turn aktif; progres & parsial tersimpan. */
  async function cancelTurn() {
    if (!sessionId) return;
    await fetch(`/api/sessions/${sessionId}/cancel`, { method: "POST" });
  }

  const [settingsOpen, setSettingsOpen] = useState(false);
  // Trace realtime (fix dev-10): naik tiap event SSE — TracePanel refetch
  // trace terstruktur saat itu (debounce), BUKAN polling 3 dtk buta.
  const [traceTick, setTraceTick] = useState(0);
  // Mode approval (fix dev-10): "auto" = write_file & run_command bebas-approval.
  const [approvalMode, setApprovalMode] = useState<"ask" | "auto">("ask");
  useEffect(() => {
    fetch("/api/settings/approval")
      .then((r) => r.json())
      .then((d: { mode: "ask" | "auto" }) => setApprovalMode(d.mode ?? "ask"))
      .catch(() => {});
  }, []);
  const toggleApprovalMode = useCallback(() => {
    const next = approvalMode === "auto" ? "ask" : "auto";
    setApprovalMode(next); // optimistic — server persist (survive restart)
    fetch("/api/settings/approval", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: next }),
    }).catch(() => setApprovalMode(approvalMode));
  }, [approvalMode]);

  async function approve(
    requestId: string,
    approved: boolean,
    remember = false,
  ) {
    try {
      const res = await fetch(`/api/approvals/${requestId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approved, remember }),
      });
      // Fix dev-10 (approval 404): kegagalan resolve TIDAK lagi diam-diam —
      // tampil sebagai item error di chat supaya bisa dilaporkan, bukan kartu
      // yang seolah diabaikan.
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setItems((prev) => [
          ...prev,
          {
            kind: "error",
            text: `Failed to send the approval decision (${res.status}): ${body.error ?? "unknown"}`,
          },
        ]);
      }
    } catch {
      setItems((prev) => [
        ...prev,
        {
          kind: "error",
          text: "Keputusan approval gagal terkirim (jaringan/server) — coba lagi.",
        },
      ]);
    }
  }

  return (
    <div className="flex h-screen bg-canvas text-body text-secondary">
      <aside
        className={`flex shrink-0 flex-col border-r border-line bg-sidebar py-3 transition-[width] ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
          sidebarOpen
            ? "w-[272px] overflow-y-auto px-2"
            : "w-14 items-center overflow-hidden px-1"
        }`}
      >
        {sidebarOpen ? (
          <>
            <div className="flex items-center gap-2.5 px-2 pb-4">
              {/* Logo maskot Orin (favicon_io) + wordmark Your-Yui */}
              <img
                src="/android-chrome-192x192.png"
                alt=""
                aria-hidden
                className="size-7 shrink-0 rounded-full"
              />
              <span className="flex min-w-0 flex-col leading-tight">
                <b className="text-body font-semibold tracking-tight text-primary">
                  Your-Yui
                </b>
                <span className="text-caption text-dim">demo</span>
              </span>
              <button
                type="button"
                onClick={toggleSidebar}
                title="Collapse sidebar (Ctrl+B)"
                aria-label="Collapse sidebar"
                className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-md2 text-dim transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:bg-hover hover:text-primary"
              >
                <SidebarSimple size={16} aria-hidden />
              </button>
            </div>
            <ProjectPanel
              projects={projects.filter((p) => p.kind !== "dungeon")}
              booted={booted}
              activeId={activeProjectId}
              onPick={pickProject}
              onCreated={loadProjects}
              onDeleted={(pid) => {
                // Scope yang aktif terhapus → kembali ke workspace global (reset sesi);
                // selain itu cukup refresh daftar project + sesi project aktif.
                void loadProjects();
                if (activeProjectId === pid) {
                  void pickProject(null);
                } else if (activeProjectId) {
                  void loadProjectSessions(activeProjectId);
                }
              }}
            />
            <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
              <button
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md2 border border-transparent px-2.5 py-2 text-left text-body transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
                  dungeonOpen
                    ? "bg-hover text-primary"
                    : "text-dim hover:bg-hover hover:text-primary"
                }`}
                aria-current={dungeonOpen ? "page" : undefined}
                onClick={() => setDungeonOpen((v) => !v)}
              >
                <CommandIcon size={20} aria-hidden /> Enhancer
              </button>
              <button
                className="flex w-full cursor-pointer items-center gap-2 rounded-md2 border border-transparent px-2.5 py-2 text-left text-body text-dim transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:bg-hover hover:text-primary"
                onClick={() => setSettingsOpen(true)}
              >
                <Gear size={20} /> Settings
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-1">
              <img
                src="/android-chrome-192x192.png"
                alt="Your-Yui"
                className="size-7 rounded-full"
              />
              <button
                type="button"
                onClick={toggleSidebar}
                title="Expand sidebar (Ctrl+B)"
                aria-label="Expand sidebar"
                className="flex size-9 cursor-pointer items-center justify-center rounded-md2 text-dim transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:bg-hover hover:text-primary"
              >
                <SidebarSimple size={16} aria-hidden />
              </button>
            </div>
            <div className="mt-auto flex flex-col gap-1">
              <button
                type="button"
                title="Enhancer"
                aria-label="Enhancer"
                aria-current={dungeonOpen ? "page" : undefined}
                onClick={() => setDungeonOpen((v) => !v)}
                className={`flex size-9 cursor-pointer items-center justify-center rounded-md2 border border-transparent transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
                  dungeonOpen
                    ? "bg-hover text-primary"
                    : "text-dim hover:bg-hover hover:text-primary"
                }`}
              >
                <CommandIcon size={20} aria-hidden />
              </button>
              <button
                type="button"
                title="Settings"
                aria-label="Settings"
                onClick={() => setSettingsOpen(true)}
                className="flex size-9 cursor-pointer items-center justify-center rounded-md2 border border-transparent text-dim transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:bg-hover hover:text-primary"
              >
                <Gear size={20} aria-hidden />
              </button>
            </div>
          </>
        )}
      </aside>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <main className="flex min-w-0 flex-1 flex-col">
        {dungeonOpen ? (
          <DungeonView
            personas={personas}
            onBack={() => setDungeonOpen(false)}
            onOpenProject={(pid) => {
              setActiveProjectId(pid); // buka ruangan latihan seperti project
              setDungeonOpen(false);
            }}
          />
        ) : (
          <>
            {!active ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                {activeProject ? (
                  <>
                    <h1 className="mt-4 text-display font-semibold text-primary">
                      Setting up {activeProject.name}…
                    </h1>
                    <p className="max-w-[420px] text-body text-muted">
                      Opening Conductor as the project lead.
                    </p>
                  </>
                ) : (
                  <>
                    <h1 className="sr-only">
                      Choose a partner for the Workspace session
                    </h1>
                    {personas.length === 0 ? (
                      <div className="mt-4 grid w-full max-w-[720px] grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
                        {Array.from({ length: 4 }, (_, i) => (
                          <Skeleton key={i} lines={3} />
                        ))}
                      </div>
                    ) : (
                      <PersonaOrbit
                        personas={personas}
                        onPick={(p) => void pick(p)}
                      />
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <TabList
                  value={mainTab}
                  onChange={(id) => setMainTab(id as WorkspaceTab)}
                  className="flex-none overflow-x-auto"
                  tabs={[
                    {
                      id: "chat",
                      label: (
                        <>
                          <PersonaFace personaId={active.id} size={16} /> Chat
                          {items.some(
                            (it) => it.kind === "approval" && !it.resolved,
                          ) && <Dot tone="warn" pulse className="ml-1" />}
                          {busy && <Dot tone="accent" pulse className="ml-1" />}
                        </>
                      ),
                    },
                    ...(activeProject
                      ? ([
                          {
                            id: "team",
                            label: (
                              <span>
                                Team
                                {items.some(
                                  (it) => it.kind === "delegation" && !it.text,
                                ) && <Dot pulse className="ml-1" />}
                              </span>
                            ),
                          },
                          { id: "files", label: "Files" },
                          { id: "board", label: "Task" },
                          { id: "config", label: "Config" },
                        ] as const)
                      : []),
                    {
                      id: "trace",
                      label: (
                        <span>
                          Logs
                          {sessionId && busy && <Dot pulse className="ml-1" />}
                        </span>
                      ),
                      title: sessionId
                        ? "Step-by-step trace per turn of this session"
                        : "Start a session to see the trace",
                    },
                  ]}
                />
                <div className="flex min-h-0 flex-1 flex-col">
                  {mainTab === "chat" && (
                    <>
                      <header className="relative flex flex-none items-center gap-3 px-4 py-2.5 sm:px-6">
                        <details className="group relative">
                          <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-pill pl-3 pr-6 py-3 select-none hover:bg-hover [&::-webkit-details-marker]:hidden">
                            <PersonaPortrait
                              name={active.name}
                              state={personaState}
                              personaId={active.id}
                              variant="compact"
                            />
                            <span className="flex min-w-0 flex-col text-left">
                              <b className="text-body font-semibold text-primary">
                                {active.name}
                              </b>
                              <span className="text-caption text-dim">
                                {active.expertise}
                              </span>
                            </span>
                          </summary>
                          <div className="glass-panel absolute top-full left-0 z-30 mt-1 flex w-64 flex-col gap-px rounded-lg2 p-1 shadow-pop">
                            {personas.map((p) => (
                              <button
                                key={p.id}
                                aria-current={
                                  p.id === active.id ? "true" : undefined
                                }
                                className={`flex cursor-pointer items-center gap-2 rounded-md2 border border-transparent px-2 py-1.5 text-left text-body transition-colors ${
                                  p.id === active.id
                                    ? "bg-hover text-primary"
                                    : "text-secondary hover:bg-hover"
                                }`}
                                onClick={() => void switchPersona(p)}
                              >
                                <PersonaFace personaId={p.id} size={20} />
                                <span className="flex-1">{p.name}</span>
                                {activeProjectId && (
                                  <small className="text-caption text-dim">
                                    new session
                                  </small>
                                )}
                              </button>
                            ))}
                          </div>
                        </details>
                        {/* Status persona di TENGAH header (tab Sesi digabung ke sini) */}
                        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2">
                          <StateChip state={personaState} />
                        </span>
                        {/* Kanan: dropdown daftar sesi + sesi baru (tab Sesi lama) */}
                        {activeProject && (
                          <details className="group relative ml-auto">
                            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md2 border border-line bg-control px-3 py-1.5 text-caption text-secondary select-none transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:border-line-strong hover:text-primary [&::-webkit-details-marker]:hidden">
                              <CaretDown size={12} aria-hidden /> Sessions
                            </summary>
                            <div className="glass-panel absolute top-full right-0 z-30 mt-1 flex w-[300px] flex-col gap-px rounded-lg2 p-1 shadow-pop">
                              <button
                                className="flex cursor-pointer items-center gap-2 rounded-md2 border border-transparent px-2 py-1.5 text-left text-body text-secondary transition-colors hover:bg-hover hover:text-primary"
                                onClick={() => {
                                  void newProjectSession();
                                  (
                                    document.activeElement as HTMLElement | null
                                  )?.blur();
                                }}
                              >
                                <Plus
                                  size={13}
                                  weight="bold"
                                  aria-hidden
                                  className="text-accent"
                                />
                                New session (Conductor)
                              </button>
                              {projSessions.length === 0 ? (
                                <small className="px-2 py-1.5 text-caption text-dim">
                                  No other sessions yet.
                                </small>
                              ) : (
                                projSessions.map((ps) => (
                                  <button
                                    key={ps.sessionId}
                                    aria-current={
                                      ps.sessionId === sessionId
                                        ? "true"
                                        : undefined
                                    }
                                    className={`flex cursor-pointer items-center gap-2.5 rounded-md2 border px-2 py-1.5 text-left transition-colors ${
                                      ps.sessionId === sessionId
                                        ? "border-line bg-hover"
                                        : "border-transparent hover:bg-hover"
                                    }`}
                                    onClick={() => {
                                      openSession(ps);
                                      (
                                        document.activeElement as HTMLElement | null
                                      )?.blur();
                                    }}
                                  >
                                    <PersonaFace
                                      personaId={ps.personaId}
                                      size={18}
                                    />
                                    <span className="flex-1 truncate text-body text-secondary">
                                      {ps.personaName}
                                    </span>
                                    {ps.sessionId === sessionId && (
                                      <Dot tone="accent" className="shrink-0" />
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          </details>
                        )}
                      </header>
                      {items.length === 0 ? (
                        <ChatView
                          items={items}
                          personaState={personaState}
                          personaId={active.id}
                          personaName={active.name}
                          onSend={send}
                          onCancel={cancelTurn}
                          onApprove={approve}
                          onOpenDelegation={jumpToSession}
                          approvalMode={approvalMode}
                          onToggleApprovalMode={toggleApprovalMode}
                          busy={busy}
                          emptySlot={
                            <>
                              <div className="w-[220px]">
                                <PersonaPortrait
                                  name={active.name}
                                  state={personaState}
                                  personaId={active.id}
                                  variant="hero"
                                />
                              </div>
                              <h1 className="text-display font-semibold text-primary">
                                {activeProject
                                  ? `${active.name} leads ${activeProject.name}`
                                  : `${active.name} is ready`}
                              </h1>
                              <p className="max-w-[420px] text-body leading-6 text-muted">
                                {activeProject
                                  ? `Describe the task — ${active.name} will work on it or delegate to the right specialists. All files & tasks stay bound to this project.`
                                  : active.description}
                              </p>
                              <div className="mt-2 flex max-w-[560px] flex-wrap justify-center gap-2">
                                {(SUGGESTIONS[active.id] ?? []).map((s) => (
                                  <button
                                    key={s}
                                    className="cursor-pointer rounded-pill border border-line bg-surface px-3 py-1 text-caption text-secondary transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:border-line-strong hover:text-primary"
                                    onClick={() => send(s)}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </>
                          }
                        />
                      ) : (
                        <ChatView
                          items={items}
                          personaState={personaState}
                          personaId={active.id}
                          personaName={active.name}
                          onSend={send}
                          onCancel={cancelTurn}
                          onApprove={approve}
                          onOpenDelegation={jumpToSession}
                          approvalMode={approvalMode}
                          onToggleApprovalMode={toggleApprovalMode}
                          busy={busy}
                        />
                      )}
                    </>
                  )}
                  {mainTab === "trace" && (
                    <TracePanel
                      sessionId={sessionId}
                      live={traceTick}
                      onBack={() => setMainTab("chat")}
                    />
                  )}
                  {activeProject &&
                    mainTab !== "chat" &&
                    mainTab !== "trace" && (
                      <ProjectTabs
                        project={activeProject}
                        activeSessionId={sessionId}
                        personas={personas}
                        activeTab={mainTab}
                        rev={taskRev}
                        live={{
                          parentPersonaId: active.id,
                          parentState: personaState,
                          delegations: items
                            .filter((it) => it.kind === "delegation")
                            .map(
                              (it): LiveDelegation => ({
                                personaId: it.personaId ?? "yui-scholar",
                                childSessionId: it.childSessionId ?? "",
                                goal: it.goal ?? "",
                                childState: it.childState,
                                summary: it.text,
                              }),
                            ),
                        }}
                      />
                    )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function short(s: string, n = 140): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
