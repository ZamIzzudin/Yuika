"use client";

import { apiUrl, authFetch, authTokenQuery } from "@/lib/api";
/**
 * Yuika demo shell, orchestrator UI (DEMO-WEEK-1 §2):
 * persona picker → sesi → SSE event stream → render msg/activity/delegation/approval.
 * SEMUA tipe dari @yuika/contracts (dilarang tipe tangan, PLAN §6.3).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PersonaFace } from "@/components/PersonaPicker";
import {
  CaretDown,
  Gear,
  Plus,
  SidebarSimple,
  Steps,
  Sword,
  Users,
} from "@phosphor-icons/react";
import { PersonaStudioView } from "@/components/PersonaStudioView";
import { AuthGate } from "@/components/AuthGate";
import { setShapeOverrides } from "@/components/orinShapes";
import { TracePanel } from "@/components/TracePanel";
import { LogsTab } from "@/components/LogsTab";
import { PersonaPortrait } from "@/components/PersonaPortrait";
import { useMenuAutoClose } from "@/components/ui/menu";
import { HomeView } from "@/components/HomeView";
import { TeamSetupView } from "@/components/TeamSetupView";
import {
  ChatView,
  type ChatItem,
  type WorkflowChatCtx,
} from "@/components/ChatView";
import { ProjectPanel } from "@/components/ProjectPanel";
import { SettingsModal } from "@/components/SettingsModal";
import { RemoteBadge } from "@/components/RemoteBadge";
import {
  ProjectTabs,
  type LiveDelegation,
  type WorkspaceTab,
} from "@/components/TaskDrawer";
import { ScreenPip } from "@/components/ScreenPip";
import { Dot, StateChip, TabPills } from "@/components/ui";
import { toastErr } from "@/components/ui/toast";
import { useWorkflowRun } from "@/components/useWorkflowRun";
import type {
  PersonaInfo,
  PersonaState,
  ProjectInfo,
  ProjectSessionSummary,
  YuiEvent,
} from "@yuika/contracts";

/** Prompt saran per persona (pola ConversationPrompts OpenBot, klik = kirim). */
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
  /** Menu Persona (2026-11, ex-Enhancer/Dungeon), character studio + misi latihan. */
  const [studioOpen, setStudioOpen] = useState(false);
  // Sidebar fold/unfold, persist di localStorage (yui.sidebar: "open" | "folded");
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

  // Project scope (P1-PRJ-6 shell v0): sesi yang dibuat melekat ke project aktif,
  // file-ops & tasklist agent otomatis ter-scope (P1-PRJ-2/4).
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [taskRev, setTaskRev] = useState(0); // naik saat agent menyentuh todo_* → drawer refresh
  const [mainTab, setMainTab] = useState<WorkspaceTab>("chat");
  // Menu auto-close (fix test user #6): dropdown header persona + Sessions.
  const personaMenu = useMenuAutoClose<HTMLDetailsElement>();
  const sessionsMenu = useMenuAutoClose<HTMLDetailsElement>();
  // Batch 14a follow-up: floating shared screen, melayang di atas SEMUA tab.
  const [pip, setPip] = useState<{
    projectId: string;
    personaId: string;
  } | null>(null);
  const [projSessions, setProjSessions] = useState<ProjectSessionSummary[]>([]);
  const [booted, setBooted] = useState(false); // skeleton hanya selama fetch awal
  // Batch 16 (Team Assembly): roster project aktif (siapa yang boleh dipakai).
  const [rosterIds, setRosterIds] = useState<string[]>([]);
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const loadProjects = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl("/api/projects"));
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
    // Batch 16: TIDAK ada restore project terakhir, aplikasi selalu dibuka
    // di halaman HOME (typing + kartu project). Freespace dihapus.
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    authFetch(apiUrl("/api/personas"))
      .then((r) => (r.ok ? r.json() : { personas: [] }))
      .then((d: { personas: PersonaInfo[] }) =>
        setPersonas(Array.isArray(d.personas) ? d.personas : []),
      )
      .catch(console.error);
  }, []);

  // Override wujud persona (menu Persona): muat sekali, setShapeOverrides
  // membuat SEMUA PersonaFace/OrinPortrait reaktif (module-store + listener).
  useEffect(() => {
    authFetch(apiUrl("/api/personas/shapes"))
      .then((r) => (r.ok ? r.json() : { shapes: [] }))
      .then((d: { shapes: { personaId: string; shape: string }[] }) =>
        setShapeOverrides(
          Object.fromEntries(
            d.shapes.map((s) => [s.personaId, s.shape]),
          ) as Record<string, import("@/components/orinShapes").OrinShapeKey>,
        ),
      )
      .catch(() => undefined);
  }, []);

  // Assistant streaming: delta ditumpuk ke item terakhir; id item disimpan di sini.
  const openAssistant = useRef<number | null>(null);
  // Reasoning streaming (fix dev-10): item sendiri, kolaps-able.
  const openReasoning = useRef<number | null>(null);

  const applyEvent = useCallback((e: YuiEvent) => {
    // Dedupe: SSE replay+live bisa overlap saat reconnect (safety net, server sudah
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
          // tutup activity tool.call yang cocok (match via callId, ToolResultEvent tanpa name)
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
              if (live.length > 600) live = live.slice(-600); // ekor saja, ringan
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
      // P1-DEL-3: pause/resume → tandai kartu (anak menunggu di batas iterasi).
      case "delegation.paused":
      case "delegation.resumed": {
        const pausedNow = e.type === "delegation.paused";
        setItems((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (
              next[i]!.kind === "delegation" &&
              next[i]!.childSessionId === e.childSessionId
            ) {
              next[i] = { ...next[i]!, paused: pausedNow };
              break;
            }
          }
          return next;
        });
        break;
      }
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
      case "takeover.requested":
        setItems((prev) => [
          ...prev,
          {
            kind: "takeover" as const,
            requestId: e.requestId,
            name: e.personaId,
            reason: e.reason,
            tresolved: null,
          },
        ]);
        break;
      case "takeover.resolved":
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "takeover" && it.requestId === e.requestId
              ? { ...it, tresolved: e.status }
              : it,
          ),
        );
        break;
      case "login.requested":
        // VLT-4: kartu kredensial, nilai TIDAK PERNAH di event (origin saja).
        setItems((prev) => [
          ...prev,
          {
            kind: "login" as const,
            name: e.personaId,
            loginRequestId: e.requestId,
            loginOrigin: e.origin,
            lresolved: null,
          },
        ]);
        break;
      case "login.resolved":
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "login" && it.loginRequestId === e.requestId
              ? { ...it, lresolved: e.status, lsaved: e.saved }
              : it,
          ),
        );
        break;
      case "screen.state":
        // Batch 14a++: persona membuka browser → bubble "Open Browser".
        // Satu bubble per persona yang DIPAKAI ULANG: sesi baru (mis. user
        // menutup floating window lalu persona buka lagi) memperbarui bubble
        // lama (URL baru), bukan ditumpuk, dan tidak hilang diam-diam.
        if (e.status === "running" || e.status === "starting") {
          setItems((prev) => {
            const i = prev.findIndex(
              (it) => it.kind === "screen" && it.name === e.personaId,
            );
            if (i === -1)
              return [
                ...prev,
                {
                  kind: "screen" as const,
                  name: e.personaId,
                  screenUrl: e.url,
                },
              ];
            const next = [...prev];
            next[i] = { ...next[i]!, screenUrl: e.url };
            return next;
          });
        }
        break;
      case "vault.requested":
        setItems((prev) => [
          ...prev,
          {
            kind: "vault" as const,
            requestId: e.requestId,
            name: e.name,
            vkind: e.kind,
            reason: e.reason,
            ...(e.originHint ? { originHint: e.originHint } : {}),
            vresolved: null,
          },
        ]);
        break;
      case "vault.resolved":
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "vault" && it.requestId === e.requestId
              ? { ...it, vresolved: e.status, saved: e.saved }
              : it,
          ),
        );
        if (e.status !== "filled") setBusy(false);
        break;
      case "vault.used":
        // transparansi audit: metadata saja (nama, kanal, target)
        setItems((prev) => [
          ...prev,
          {
            kind: "activity" as const,
            name: "vault",
            detail: `used ${e.name} via ${e.channel} → ${e.target}`,
            done: true,
          },
        ]);
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
        // P0-CORE-4: transparansi, user tahu konteks lama diringkas (riwayat asli utuh).
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
          { kind: "skill", text: `${e.name}, ${e.description}` },
        ]);
        break;
      case "turn.cancelled":
        setItems((prev) => [
          ...prev,
          {
            kind: "noted",
            text: "turn cancelled, progress & partial output saved",
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
  //  (a) browser auto-reconnect (CONNECTING), aman, applyEvent dedupe by id;
  //  (b) FATAL (CLOSED, mis. route 500 sesaat / dev recompile), browser TIDAK
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
      // tanpa efek streaming ulang), baru buka SSE live dari seq terakhir.
      if (lastEventId.current === 0) {
        try {
          const r = await authFetch(
            apiUrl(`/api/sessions/${sessionId}/stream?since=0&snapshot=1`),
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
        apiUrl(
          `/api/sessions/${sessionId}/stream?since=${lastEventId.current}${authTokenQuery()}`,
        ),
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

  // Resync saat window kembali fokus: tarik snapshot event sejak lastEventId,
  // menutup celah apa pun yang terlewat (SSE mati saat tab di background, dll).
  useEffect(() => {
    const resync = async () => {
      if (!sessionId) return;
      try {
        const r = await authFetch(
          apiUrl(
            `/api/sessions/${sessionId}/stream?since=${lastEventId.current}&snapshot=1`,
          ),
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
        /* offline, SSE watchdog akan ambil alih */
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
    const res = await authFetch(apiUrl("/api/sessions"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personaId: p.id, projectId: projectId ?? null }),
    });
    const d = (await res.json()) as { sessionId: string };
    setSessionId(d.sessionId);
    if (projectId) void loadProjectSessions(projectId);
  }

  /** Batch 16: roster project aktif (person yang ter-assign, project.yaml). */
  const loadRoster = useCallback(async (pid: string) => {
    try {
      const r = await authFetch(apiUrl(`/api/projects/${pid}/roster`));
      if (!r.ok) return;
      const d = (await r.json()) as { roster: { personaId: string }[] };
      setRosterIds(d.roster.map((e) => e.personaId));
    } catch {
      /* roster opsional */
    }
  }, []);

  // Config → Roster bisa mengubah assignment mid-project → terminal tab gating
  // live (Hiro/Neo di-assign = tab Terminal muncul).
  useEffect(() => {
    const h = () => {
      if (activeProjectId) void loadRoster(activeProjectId);
    };
    window.addEventListener("yui:roster-changed", h);
    return () => window.removeEventListener("yui:roster-changed", h);
  }, [activeProjectId, loadRoster]);

  /** Ganti scope project → Batch 16: sesi ada → buka terbaru; BELUM ada sesi
   *  → layar Team Assembly (playground), TIDAK lagi auto-buka Conductor. */
  async function pickProject(id: string | null) {
    setActiveProjectId(id);
    setMainTab("chat");
    setStudioOpen(false); // pilih project = keluar dari halaman Persona
    if (!id) {
      resetSession(); // kembali ke halaman HOME
      setProjSessions([]);
      setRosterIds([]);
      return;
    }
    void loadRoster(id);
    const list = await loadProjectSessions(id);
    if (list.length > 0) {
      openSession(list[0]!);
    } else {
      resetSession(); // TeamSetupView (playground assign persona)
    }
  }

  async function loadProjectSessions(
    projectId: string,
  ): Promise<ProjectSessionSummary[]> {
    const res = await authFetch(apiUrl(`/api/sessions?projectId=${projectId}`));
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

  /** Sesi baru di project aktif (Conductor lead). Batch 16: Conductor harus
   *  ter-assign, kalau belum, assign dulu (merge roster) lalu buka sesi. */
  async function newProjectSession() {
    if (!activeProjectId) return;
    const lead = personas.find((p) => p.id === "yui-conductor") ?? personas[0];
    if (!lead) return;
    if (!rosterIds.includes(lead.id))
      await assignPersonas(activeProjectId, [lead.id]);
    await pick(lead, activeProjectId);
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

  /** Batch 16 (Team Assembly): assign persona → merge roster (project.yaml).
   *  Dipakai TeamSetupView (playground) + dropdown Sessions. */
  async function assignPersonas(pid: string, personaIds: string[]) {
    const r0 = await authFetch(apiUrl(`/api/projects/${pid}/roster`));
    const d0 = (await r0.json()) as {
      roster: {
        personaId: string;
        role: string;
        phases?: string[];
        mcp?: unknown[];
      }[];
    };
    const known = new Map(personas.map((p) => [p.id, p]));
    const merged = [...d0.roster];
    for (const id of personaIds) {
      if (merged.some((e) => e.personaId === id)) continue;
      const p = known.get(id);
      merged.push({
        personaId: id,
        role: p?.expertise ?? "team",
        phases: [],
        mcp: [],
      });
    }
    const res = await authFetch(apiUrl(`/api/projects/${pid}/roster`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roster: merged }),
    });
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`,
      );
    const d = (await res.json()) as { roster: { personaId: string }[] };
    setRosterIds(d.roster.map((e) => e.personaId));
    window.dispatchEvent(new Event("yui:roster-changed"));
  }

  async function unassignPersona(pid: string, personaId: string) {
    const r0 = await authFetch(apiUrl(`/api/projects/${pid}/roster`));
    const d0 = (await r0.json()) as { roster: { personaId: string }[] };
    const res = await authFetch(apiUrl(`/api/projects/${pid}/roster`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roster: d0.roster.filter((e) => e.personaId !== personaId),
      }),
    });
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`,
      );
    const d = (await res.json()) as { roster: { personaId: string }[] };
    setRosterIds(d.roster.map((e) => e.personaId));
    window.dispatchEvent(new Event("yui:roster-changed"));
  }

  // Batch 16: tab Terminal hanya muncul bila Hiro/Neo ter-assign, tanpa itu
  // docker tak disiapkan (hemat resource), persis permintaan user.
  const showTerminalTab =
    rosterIds.includes("yui-coder") || rosterIds.includes("yui-operator");
  useEffect(() => {
    if (mainTab === "terminal" && !showTerminalTab) setMainTab("chat");
  }, [mainTab, showTerminalTab]);

  async function send(text: string) {
    if (!sessionId) return;
    setItems((prev) => [...prev, { kind: "msg", role: "user", text }]);
    await authFetch(apiUrl(`/api/sessions/${sessionId}/message`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }

  /** P0-CORE-1: tombol Stop, abort turn aktif; progres & parsial tersimpan. */
  async function cancelTurn() {
    if (!sessionId) return;
    await authFetch(apiUrl(`/api/sessions/${sessionId}/cancel`), {
      method: "POST",
    });
  }

  const [settingsOpen, setSettingsOpen] = useState(false);
  // P1-PRT-3: badge compact (sidebar kolaps) memancarkan event → buka Settings.
  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener("yui:open-settings", open);
    return () => window.removeEventListener("yui:open-settings", open);
  }, []);
  // Trace realtime (fix dev-10): naik tiap event SSE, TracePanel refetch
  // trace terstruktur saat itu (debounce), BUKAN polling 3 dtk buta.
  const [traceTick, setTraceTick] = useState(0);
  // Mode approval (fix dev-10): "auto" = write_file & run_command bebas-approval.
  const [approvalMode, setApprovalMode] = useState<"ask" | "auto">("ask");
  useEffect(() => {
    authFetch(apiUrl("/api/settings/approval"))
      .then((r) => r.json())
      .then((d: { mode: "ask" | "auto" }) => setApprovalMode(d.mode ?? "ask"))
      .catch(() => {});
  }, []);
  const toggleApprovalMode = useCallback(() => {
    const next = approvalMode === "auto" ? "ask" : "auto";
    setApprovalMode(next); // optimistic, server persist (survive restart)
    authFetch(apiUrl("/api/settings/approval"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: next }),
    }).catch(() => setApprovalMode(approvalMode));
  }, [approvalMode]);

  // ── Workflow via composer (user 2026-11-08 tahap 2) ─────────────────────
  // Toggle Workflow Mode (sejajar Hardcore Mode, hanya conductor + project):
  // ON & tanpa run → pesan = brief run baru; run hidup → pesan = steer
  // (apa pun toggle); OFF & tanpa run → chat biasa. Persist di localStorage.
  const wfRun = useWorkflowRun(activeProject?.id ?? null);
  const [wfArmed, setWfArmed] = useState(false);
  useEffect(() => {
    try {
      setWfArmed(window.localStorage.getItem("yui.workflowArmed") === "1");
    } catch {
      /* private mode, default off */
    }
  }, []);
  const toggleWorkflowArmed = useCallback(() => {
    setWfArmed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("yui.workflowArmed", next ? "1" : "0");
      } catch {
        /* abaikan */
      }
      return next;
    });
  }, []);
  const wfAction = useCallback(
    async (path: string, body?: unknown) => {
      const ok = await wfRun.postAction(path, body);
      if (!ok) toastErr("Workflow action failed");
      return ok;
    },
    [wfRun],
  );
  const wfSend = useCallback(
    async (text: string, mode: "brief" | "steer") => {
      if (!activeProject) return;
      if (mode === "steer") {
        const ok = await wfRun.postAction("/steer", { instruction: text });
        if (!ok) {
          toastErr("Failed to steer the run");
          return;
        }
      } else {
        try {
          const r = await authFetch(
            apiUrl(`/api/projects/${activeProject.id}/workflows/runs`),
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                brief: text,
                ...(sessionId ? { leadSessionId: sessionId } : {}), // chat ini = lead
              }),
            },
          );
          const body = (await r.json()) as { runId?: string; error?: string };
          if (!r.ok || !body.runId)
            throw new Error(body.error ?? "failed to start run");
        } catch (e) {
          toastErr(e instanceof Error ? e.message : "Failed to start run");
          return;
        }
      }
      // pesan user tetap tercatat di thread (brief/steer masuk konteks lead)
      setItems((prev) => [...prev, { kind: "msg", role: "user", text }]);
      void wfRun.loadActive();
    },
    [activeProject, sessionId, wfRun],
  );
  /** Konteks workflow utk ChatView conductor di project (null = chat biasa). */
  const wfCtx: WorkflowChatCtx | null =
    active?.id === "yui-conductor" && activeProject
      ? {
          armed: wfArmed,
          activeRun: wfRun.activeRun,
          lastRun: wfRun.lastRun,
          run: wfRun.run,
          onToggleArmed: toggleWorkflowArmed,
          onAction: wfAction,
          onSendWorkflow: wfSend,
        }
      : null;

  async function approve(
    requestId: string,
    approved: boolean,
    remember = false,
  ) {
    try {
      const res = await authFetch(apiUrl(`/api/approvals/${requestId}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approved, remember }),
      });
      // Fix dev-10 (approval 404): kegagalan resolve TIDAK lagi diam-diam,
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
          text: "Keputusan approval gagal terkirim (jaringan/server), coba lagi.",
        },
      ]);
    }
  }

  return (
    <AuthGate>
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
                {/* Logo maskot Orin, Batch 16: klik = kembali ke HOME. */}
                <button
                  type="button"
                  onClick={() => void pickProject(null)}
                  title="Home, all projects"
                  aria-label="Home, all projects"
                  className="flex min-w-0 cursor-pointer items-end gap-2.5 rounded-md2 border border-transparent px-1 py-0.5 text-left"
                >
                  <img
                    src="/android-chrome-192x192.png"
                    alt=""
                    aria-hidden
                    className="size-7 shrink-0 rounded-full"
                  />
                  <span className="flex min-w-0 flex-col">
                    <b className="text-body font-semibold tracking-wide text-primary">
                      Yuika
                    </b>
                  </span>
                </button>
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
                onDeleted={(pid) => {
                  // Scope aktif terhapus → kembali ke HOME; selain itu refresh
                  // daftar project + sesi project aktif.
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
                    studioOpen
                      ? "bg-hover text-primary"
                      : "text-dim hover:bg-hover hover:text-primary"
                  }`}
                  aria-current={studioOpen ? "page" : undefined}
                  onClick={() => setStudioOpen((v) => !v)}
                >
                  <Users size={20} aria-hidden /> Persona
                </button>
                <div className="px-2.5 pb-1">
                  <RemoteBadge />
                </div>
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
                  alt="Yuika"
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
                  title="Persona"
                  aria-label="Persona"
                  aria-current={studioOpen ? "page" : undefined}
                  onClick={() => setStudioOpen((v) => !v)}
                  className={`flex size-9 cursor-pointer items-center justify-center rounded-md2 border border-transparent transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
                    studioOpen
                      ? "bg-hover text-primary"
                      : "text-dim hover:bg-hover hover:text-primary"
                  }`}
                >
                  <Users size={20} aria-hidden />
                </button>
                <RemoteBadge compact />
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
        {settingsOpen && (
          <SettingsModal onClose={() => setSettingsOpen(false)} />
        )}
        {/* badge compact sidebar kolaps → buka tab Portal */}
        <main className="flex min-w-0 flex-1 flex-col">
          {studioOpen ? (
            <PersonaStudioView
              personas={personas}
              onBack={() => setStudioOpen(false)}
              onOpenProject={(pid) => {
                setActiveProjectId(pid); // buka ruangan latihan seperti project
                setStudioOpen(false);
              }}
            />
          ) : (
            <>
              {!active ? (
                activeProject ? (
                  <TeamSetupView
                    project={activeProject}
                    personas={personas}
                    assignedIds={rosterIds}
                    onAssign={(pid) => {
                      void assignPersonas(activeProject.id, [pid]).catch((e) =>
                        toastErr(e instanceof Error ? e.message : String(e)),
                      );
                    }}
                    onUnassign={(pid) => {
                      void unassignPersona(activeProject.id, pid).catch((e) =>
                        toastErr(e instanceof Error ? e.message : String(e)),
                      );
                    }}
                    onStart={(p) => void pick(p, activeProject.id)}
                  />
                ) : (
                  <HomeView
                    projects={projects}
                    booted={booted}
                    onOpenProject={(id) => void pickProject(id)}
                    onCreated={(id) => {
                      void loadProjects();
                      void pickProject(id);
                    }}
                  />
                )
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  {/* pills terpusat ala page Persona, grid [1fr_auto_1fr]
                    (kolom tengah pills, kiri/kanan 1fr sama → center sejati). */}
                  <div className="grid flex-none grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 pt-3">
                    <span aria-hidden />
                    <TabPills
                      ariaLabel="Workspace views"
                      value={mainTab}
                      onChange={(id) => setMainTab(id as WorkspaceTab)}
                      tabs={[
                        {
                          id: "chat",
                          label: (
                            <span className="flex items-center gap-1.5">
                              <PersonaFace personaId={active.id} size={16} />{" "}
                              Chat
                              {items.some(
                                (it) => it.kind === "approval" && !it.resolved,
                              ) && <Dot tone="warn" pulse />}
                              {busy && <Dot tone="accent" pulse />}
                            </span>
                          ),
                        },
                        ...(activeProject
                          ? ([
                              {
                                id: "team",
                                label: (
                                  <span className="flex items-center gap-1.5">
                                    Team
                                    {items.some(
                                      (it) =>
                                        it.kind === "delegation" && !it.text,
                                    ) && <Dot pulse />}
                                  </span>
                                ),
                              },
                              { id: "files", label: "Files" },
                              { id: "board", label: "Task" },
                              ...(showTerminalTab
                                ? [{ id: "terminal", label: "Terminal" }]
                                : []),
                              { id: "config", label: "Config" },
                            ] as const)
                          : []),
                        {
                          id: "trace",
                          label: (
                            <span className="flex items-center gap-1.5">
                              Logs
                              {sessionId && busy && <Dot pulse />}
                            </span>
                          ),
                          title: sessionId
                            ? "Step-by-step trace per turn of this session (tool steps live here, kept out of chat)"
                            : "Start a session to see the trace",
                        },
                      ]}
                    />
                  </div>
                  {/* Satu tab = satu halaman (keputusan user 2026-11-08,
                    revisi STU-1): saat tab lain aktif, chat TERTUTUP penuh dan
                    tab aktif mendapat lebar penuh. Kolom chat tetap ter-mount
                    (disembunyikan CSS, bukan unmount) supaya draft/scroll/
                    streaming tetap valid saat kembali. Penggabungan tab
                    (Board/Tools) menyusul. */}
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div
                      className={
                        mainTab === "chat"
                          ? "flex min-h-0 min-w-0 flex-1 flex-col"
                          : "hidden min-h-0 min-w-0 flex-1 flex-col"
                      }
                    >
                      <header className="relative flex flex-none items-center gap-3 px-4 py-2.5 sm:px-6">
                        <details
                          className="group relative"
                          ref={personaMenu.ref}
                        >
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
                              <span className="text-caption text-dim capitalize">
                                {active.expertise}
                              </span>
                            </span>
                          </summary>
                          <div className="glass-panel absolute top-full left-0 z-30 mt-1 flex w-64 flex-col gap-px rounded-lg2 p-1 shadow-pop">
                            {(activeProject
                              ? rosterIds.length
                                ? personas.filter((p) =>
                                    rosterIds.includes(p.id),
                                  )
                                : personas // project lama roster kosong: jangan kunci user keluar
                              : personas
                            ).map((p) => (
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
                                onClick={() => {
                                  void switchPersona(p);
                                  personaMenu.close();
                                }}
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
                        {/* Kanan: dropdown daftar sesi + sesi baru (tab Sesi lama).
                            (Tombol pintu Workflow dihapus 2026-11, menumpuk dgn
                            status persona; tab Team sudah ada di tablist atas.) */}
                        {/* Kanan: dropdown daftar sesi + sesi baru (tab Sesi lama) */}
                        {activeProject && (
                          <details
                            className="group relative ml-auto"
                            ref={sessionsMenu.ref}
                          >
                            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md2 border border-line bg-control px-3 py-1.5 text-caption text-secondary select-none transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] hover:border-line-strong hover:text-primary [&::-webkit-details-marker]:hidden">
                              <CaretDown size={12} aria-hidden /> Sessions
                            </summary>
                            <div className="glass-panel absolute top-full right-0 z-30 mt-1 flex w-[300px] flex-col gap-px rounded-lg2 p-1 shadow-pop">
                              <button
                                className="flex cursor-pointer items-center gap-2 rounded-md2 border border-transparent px-2 py-1.5 text-left text-body text-secondary transition-colors hover:bg-hover hover:text-primary"
                                onClick={() => {
                                  void newProjectSession();
                                  sessionsMenu.close();
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
                                      sessionsMenu.close();
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
                          workflow={wfCtx}
                          onOpenScreen={(pid) => {
                            if (activeProject)
                              setPip({
                                projectId: activeProject.id,
                                personaId: pid,
                              });
                          }}
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
                                  ? `Describe the task, ${active.name} will work on it or delegate to the right specialists. All files & tasks stay bound to this project.`
                                  : active.description}
                              </p>
                              {active.id === "yui-conductor" &&
                                activeProject && (
                                  <span className="flex items-center gap-1.5 rounded-lg2 border border-accent/40 bg-accent/5 px-4 py-2.5 text-caption text-muted">
                                    <Steps
                                      size={14}
                                      weight="bold"
                                      aria-hidden
                                      className="shrink-0 text-accent"
                                    />
                                    Need the full team pipeline? Toggle Workflow
                                    Mode beside Hardcore Mode, your next message
                                    starts a structured run. Watch progress in
                                    the Team tab.
                                  </span>
                                )}
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
                          workflow={wfCtx}
                          onOpenScreen={(pid) => {
                            if (activeProject)
                              setPip({
                                projectId: activeProject.id,
                                personaId: pid,
                              });
                          }}
                          onSend={send}
                          onCancel={cancelTurn}
                          onApprove={approve}
                          onOpenDelegation={jumpToSession}
                          approvalMode={approvalMode}
                          onToggleApprovalMode={toggleApprovalMode}
                          busy={busy}
                        />
                      )}
                    </div>
                    {mainTab === "trace" && activeProject && (
                      <LogsTab
                        projectId={activeProject.id}
                        sessionId={sessionId}
                        live={traceTick}
                        onBack={() => setMainTab("chat")}
                      />
                    )}
                    {activeProject &&
                      mainTab !== "chat" &&
                      mainTab !== "trace" && (
                        <div className="flex min-h-0 flex-1 flex-col">
                          <ProjectTabs
                            project={activeProject}
                            activeSessionId={sessionId}
                            personas={personas}
                            activeTab={mainTab}
                            rev={taskRev}
                            onProjectUpdated={() => void loadProjects()}
                            onDeleted={(pid) => {
                              // D33: hapus dari Config → refresh daftar; scope
                              // aktif terhapus → kembali ke HOME.
                              void loadProjects();
                              if (activeProjectId === pid)
                                void pickProject(null);
                            }}
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
                        </div>
                      )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {/* Batch 14a follow-up: floating shared screen, di atas SEMUA tab,
          termasuk chat; nonton persona + take/hand over tanpa pindah tab. */}
      {pip && activeProject?.id === pip.projectId && (
        <ScreenPip
          projectId={pip.projectId}
          personaId={pip.personaId}
          personaName={
            personas.find((p) => p.id === pip.personaId)?.name ?? pip.personaId
          }
          onClose={() => setPip(null)}
        />
      )}
    </AuthGate>
  );
}

function short(s: string, n = 140): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
