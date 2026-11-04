"use client";
/**
 * Your-Yui demo shell — orchestrator UI (DEMO-WEEK-1 §2):
 * persona picker → sesi → SSE event stream → render msg/activity/delegation/approval.
 * SEMUA tipe dari @yui/contracts (dilarang tipe tangan — PLAN §6.3).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PersonaGrid, PersonaFace } from "@/components/PersonaPicker";
import { DungeonView } from "@/components/DungeonView";
import { TracePanel } from "@/components/TracePanel";
import { PersonaPortrait } from "@/components/PersonaPortrait";
import { ChatView, STATE_LABEL, type ChatItem } from "@/components/ChatView";
import { OrinPortrait } from "@/components/OrinPortrait";
import { ProjectPanel } from "@/components/ProjectPanel";
import { SettingsModal } from "@/components/SettingsModal";
import {
  ProjectTabs,
  type LiveDelegation,
  type WorkspaceTab,
} from "@/components/TaskDrawer";
import { Skeleton } from "@/components/Skeleton";
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

  const applyEvent = useCallback((e: YuiEvent) => {
    // Dedupe: SSE replay+live bisa overlap saat reconnect (safety net — server sudah
    // dedupe by id; id monotonic per sesi).
    if (e.id <= lastEventId.current) return;
    lastEventId.current = Math.max(lastEventId.current, e.id);
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
          if (idx !== null && prev[idx]?.kind === "msg") {
            const next = [...prev];
            next[idx] = { ...next[idx]!, streaming: false };
            return next;
          }
          return prev;
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
          { kind: "compressed", n: e.messagesSummarized, before: e.estTokensBefore, after: e.estTokensAfter },
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
            text: "turn dibatalkan — progres & parsial tersimpan",
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
    const open = () => {
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
          { kind: "error", text: `Keputusan approval gagal terkirim (${res.status}): ${body.error ?? "tidak diketahui"}` },
        ]);
      }
    } catch {
      setItems((prev) => [...prev, { kind: "error", text: "Keputusan approval gagal terkirim (jaringan/server) — coba lagi." }]);
    }
  }

  return (
    <div className="yui-shell">
      <aside className="yui-side">
        <div className="yui-logo">
          Your-Yui <span className="sub">demo</span>
        </div>
        <ProjectPanel
          projects={projects}
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
        <div className="side-foot">
          <button
            className="side-settings"
            data-active={dungeonOpen ? "" : undefined}
            onClick={() => setDungeonOpen((v) => !v)}
          >
            Dungeon
          </button>
          <button
            className="side-settings"
            onClick={() => setSettingsOpen(true)}
          >
            Pengaturan
          </button>
        </div>
      </aside>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <main className="yui-main">
        {dungeonOpen ? (
          <DungeonView
            personas={personas}
            onBack={() => setDungeonOpen(false)}
          />
        ) : (
          <>
            {!active ? (
              <div className="empty-state">
                <div className="portrait-hero">
                  <OrinPortrait
                    state="idle"
                    personaId={activeProject ? undefined : "yui-conductor"}
                  />
                </div>
                {activeProject ? (
                  <>
                    <h1>Menyiapkan {activeProject.name}…</h1>
                    <p className="pitch">
                      Conductor sebagai project lead sedang dibuka.
                    </p>
                  </>
                ) : (
                  <>
                    <h1>Pilih partner untuk sesi Workspace</h1>
                    {personas.length === 0 ? (
                      <div className="persona-grid">
                        {Array.from({ length: 4 }, (_, i) => (
                          <Skeleton key={i} lines={3} />
                        ))}
                      </div>
                    ) : (
                      <PersonaGrid
                        personas={personas}
                        onPick={(p) => void pick(p)}
                      />
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="workspace">
                <nav className="main-tabs" role="tablist">
                  <button
                    role="tab"
                    aria-selected={mainTab === "chat"}
                    data-active={mainTab === "chat" ? "" : undefined}
                    onClick={() => setMainTab("chat")}
                  >
                    <PersonaFace personaId={active.id} size={16} /> Chat
                    {items.some(
                      (it) => it.kind === "approval" && !it.resolved,
                    ) && (
                      <span
                        className="tab-dot warn"
                        title="menunggu persetujuan Anda"
                      />
                    )}
                    {busy && <span className="tab-dot" title="agent bekerja" />}
                  </button>

                  {activeProject &&
                    (
                      [
                        { id: "team", label: "Tim" },
                        { id: "files", label: "File" },
                        { id: "board", label: "Papan" },
                        { id: "tree", label: "Pohon" },
                        { id: "roster", label: "Roster" },
                        { id: "sessions", label: "Sesi" },
                        { id: "memory", label: "Memori" },
                        { id: "skills", label: "Skill" },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        role="tab"
                        aria-selected={mainTab === t.id}
                        data-active={mainTab === t.id ? "" : undefined}
                        onClick={() => setMainTab(t.id)}
                      >
                        {t.label}
                        {t.id === "team" &&
                          items.some(
                            (it) => it.kind === "delegation" && !it.text,
                          ) && (
                            <span
                              className="tab-dot"
                              title="delegasi berjalan"
                            />
                          )}
                      </button>
                    ))}
                  <button
                    role="tab"
                    aria-selected={mainTab === "trace"}
                    data-active={mainTab === "trace" ? "" : undefined}
                    onClick={() => setMainTab("trace")}
                    title={
                      sessionId
                        ? "Jejak langkah per turn sesi aktif"
                        : "Mulai sesi dulu untuk melihat trace"
                    }
                  >
                    Trace
                    {sessionId && busy && (
                      <span
                        className="tab-dot"
                        title="turn berjalan — trace ikut live"
                      />
                    )}
                  </button>
                </nav>
                <div className="workspace-body">
                  {mainTab === "chat" && (
                    <>
                      <header className="chat-header">
                        <details className="persona-switch">
                          <summary>
                            <PersonaPortrait
                              name={active.name}
                              state={personaState}
                              personaId={active.id}
                              variant="compact"
                            />
                            <span className="who">
                              <b>{active.name}</b>
                              <span>{active.expertise}</span>
                            </span>
                          </summary>
                          <div className="persona-menu">
                            {personas.map((p) => (
                              <button
                                key={p.id}
                                data-active={
                                  p.id === active.id ? "" : undefined
                                }
                                onClick={() => void switchPersona(p)}
                              >
                                <PersonaFace personaId={p.id} size={20} />
                                <span>{p.name}</span>
                                {activeProjectId && (
                                  <small>
                                    {activeProjectId
                                      ? "sesi baru di project ini"
                                      : ""}
                                  </small>
                                )}
                              </button>
                            ))}
                          </div>
                        </details>
                        <span className="state-chip" data-s={personaState}>
                          <i />
                          {STATE_LABEL[personaState]}
                        </span>
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
                          busy={busy}
                          emptySlot={
                            <>
                              <div className="portrait-hero">
                                <PersonaPortrait
                                  name={active.name}
                                  state={personaState}
                                  personaId={active.id}
                                  variant="hero"
                                />
                              </div>
                              <h1>
                                {activeProject
                                  ? `${active.name} memimpin ${activeProject.name}`
                                  : `${active.name} siap`}
                              </h1>
                              <p className="pitch">
                                {activeProject
                                  ? `Sebutkan tugasnya — ${active.name} akan mengerjakan atau mendelegasikan ke spesialis sesuai keahlian. Semua file & task terikat ke project ini.`
                                  : active.description}
                              </p>
                              <div className="suggest-row">
                                {(SUGGESTIONS[active.id] ?? []).map((s) => (
                                  <button
                                    key={s}
                                    className="suggest"
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
                          busy={busy}
                        />
                      )}
                    </>
                  )}
                  {mainTab === "trace" && (
                    <TracePanel
                      sessionId={sessionId}
                      onBack={() => setMainTab("chat")}
                    />
                  )}
                  {activeProject &&
                    mainTab !== "chat" &&
                    mainTab !== "trace" && (
                      <ProjectTabs
                        project={activeProject}
                        sessions={projSessions}
                        activeSessionId={sessionId}
                        onOpenSession={openSession}
                        onNewSession={() => void newProjectSession()}
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
