"use client";
import { useCallback, useEffect, useState } from "react";
import type { PersonaInfo, PersonaState, ProjectInfo, ProjectSessionSummary, RosterEntry, TaskItem, TaskNode, TaskStatus } from "@yui/contracts";
import { PersonaFace } from "./PersonaPicker";

/** Status cycle: klik chip = maju satu langkah. */
const NEXT: Record<TaskStatus, TaskStatus> = { todo: "doing", doing: "review", review: "done", done: "todo" };
const LABEL: Record<TaskStatus, string> = { todo: "Belum", doing: "Kerja", review: "Reviu", done: "Selesai" };
const DOT: Record<TaskStatus, string> = { todo: "○", doing: "◐", review: "◑", done: "●" };

type Tab = "tasks" | "team" | "tree" | "roster" | "sessions";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "tasks", label: "Tasklist" },
  { id: "team", label: "Tim" },
  { id: "tree", label: "Pohon" },
  { id: "roster", label: "Roster" },
  { id: "sessions", label: "Sesi" },
];

/** Delegasi live untuk org-chart Tim (dari event delegation.* sesi aktif). */
export interface LiveDelegation {
  personaId: string;
  childSessionId: string;
  goal: string;
  childState?: PersonaState;
  summary?: string;
};

/** Waktu relatif pendek untuk daftar sesi. */
function relTime(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s} dtk lalu`;
  if (s < 3600) return `${Math.round(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.round(s / 3600)} jam lalu`;
  return new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/** Satu simpul pohon task (rekursif) — proyeksi event `task.node.*` (D19). */
function TreeNode({ node, depth }: { node: TaskNode; depth: number }) {
  return (
    <li className="tree-node" data-s={node.status} style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      <span className="tree-dot" title={LABEL[node.status]}>{DOT[node.status]}</span>
      <span className="tree-title">{node.title}</span>
      {node.assignee && <small className="tree-assignee">{node.assignee.replace("yui-", "")}</small>}
      {node.artefak.map((a) => (
        <small key={a} className="tree-artefak" title={a}>{a.split("/").pop()}</small>
      ))}
      {node.children.length > 0 && (
        <ul className="tree-children">
          {node.children.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Org-chart Tim: kartu persona + state chip. */
function OrgCard({
  personaId,
  subtitle,
  state,
  goal,
  summary,
  root,
}: {
  personaId: string;
  subtitle?: string;
  state?: PersonaState | "done";
  goal?: string;
  summary?: string;
  root?: boolean;
}) {
  const label =
    state === "done"
      ? "selesai"
      : state
        ? STATE_LABEL[state as PersonaState]
        : "menunggu";
  return (
    <div className={"org-card" + (root ? " org-root" : "")} data-s={state ?? "idle"}>
      <span className="face"><PersonaFace personaId={personaId} size={root ? 34 : 26} /></span>
      <div className="org-body">\n        <b>{PERSONA_NAME[personaId] ?? personaId.replace("yui-", "")}</b>
        {subtitle && <small>{subtitle}</small>}
        {goal && <p className="org-goal">{goal}</p>}
        {summary && <p className="org-summary">{summary}</p>}
      </div>
      <span className="state-chip" data-s={state ?? "idle"}>
        <i />
        {label}
      </span>
    </div>
  );
}

const PERSONA_NAME: Record<string, string> = {
  "yui-conductor": "Yui Conductor",
  "yui-scholar": "Yui Scholar",
  "yui-scribe": "Yui Scribe",
  "yui-coder": "Yui Coder",
};
const STATE_LABEL: Record<string, string> = {
  idle: "siaga",
  thinking: "berpikir",
  working: "bekerja",
  awaiting_input: "menunggu Anda",
  celebrating: "merayakan",
  done: "selesai",
  error: "error",
};

/**
 * Panel proyek (P1-PRJ-4/6/7 UI): tab Tasklist | Tim (org-chart live) | Pohon | Roster | Sesi.
 * Duduk di area utama shell (pola IDE: sidebar | chat | panel), toggle layar penuh
 * untuk konten lega — fondasi tab masa depan (kanban, penpot, web view).
 */
export function TaskDrawer({
  project,
  personas,
  open,
  onClose,
  rev,
  sessions,
  activeSessionId,
  onOpenSession,
  onNewSession,
  live,
}: {
  project: ProjectInfo;
  personas: PersonaInfo[];
  open: boolean;
  onClose: () => void;
  rev: number;
  /** Riwayat sesi project (terbaru dulu) — pintu resume percakapan. */
  sessions: ProjectSessionSummary[];
  activeSessionId: string | null;
  onOpenSession: (s: ProjectSessionSummary) => void;
  onNewSession: () => void;
  /** Org-chart Tim: persona lead sesi + delegasi live dari SSE. */
  live: { parentPersonaId: string | null; parentState: PersonaState; delegations: LiveDelegation[] };
}) {
  const [tab, setTab] = useState<Tab>("tasks");
  const [full, setFull] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tree, setTree] = useState<TaskNode[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [title, setTitle] = useState("");
  const [pick, setPick] = useState("");
  const [role, setRole] = useState("");
  const [mcpServer, setMcpServer] = useState("");
  const [mcpServers, setMcpServers] = useState<{ name: string; declared: boolean }[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [t, r, m] = await Promise.all([
        fetch(`/api/projects/${project.id}/tasks`),
        fetch(`/api/projects/${project.id}/roster`),
        fetch("/api/mcp/servers"),
      ]);
      if (t.ok) setTasks(((await t.json()) as { tasks: TaskItem[] }).tasks);
      if (r.ok) setRoster(((await r.json()) as { roster: RosterEntry[] }).roster);
      if (m.ok)
        setMcpServers(
          ((await m.json()) as { servers: { name: string; declared: boolean }[] }).servers.filter((s) => s.declared),
        );
    } catch {
      /* refresh berikutnya */
    }
  }, [project.id]);

  const refreshTree = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/tree`);
      if (res.ok) setTree(((await res.json()) as { nodes: TaskNode[] }).nodes);
    } catch {
      /* refresh berikutnya */
    }
  }, [project.id]);

  async function saveRoster(next: RosterEntry[]) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/roster`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roster: next }),
      });
      if (res.ok) setRoster(((await res.json()) as { roster: RosterEntry[] }).roster);
    } finally {
      setBusy(false);
    }
  }

  const available = personas.filter((p) => !roster.some((r) => r.personaId === p.id));

  useEffect(() => {
    if (open) void refresh();
  }, [open, rev, refresh]);

  useEffect(() => {
    if (open && tab === "tree") void refreshTree();
  }, [open, tab, rev, refreshTree]);

  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/projects/${project.id}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      setTitle("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function assign() {
    const persona = personas.find((p) => p.id === pick);
    if (!persona || !role.trim() || busy) return;
    setPick("");
    setRole("");
    const server = mcpServer;
    setMcpServer("");
    void saveRoster([
      ...roster,
      {
        personaId: persona.id,
        role: role.trim(),
        phases: [],
        mcp: server ? [{ server, tools: [] }] : [],
      },
    ]);
  }

  async function cycle(t: TaskItem) {
    await fetch(`/api/projects/${project.id}/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: NEXT[t.status] }),
    });
    await refresh();
  }

  if (!open) return null;
  const done = tasks.filter((t) => t.status === "done").length;
  const flatCount = (nodes: TaskNode[]): number => nodes.reduce((n, x) => n + 1 + flatCount(x.children), 0);
  const runningIds = new Set(live.delegations.map((d) => d.personaId));
  const bench = roster.filter((r) => !runningIds.has(r.personaId));

  return (
    <section className="project-pane" data-full={full ? "" : undefined} aria-label={`Panel proyek ${project.name}`}>
      <header className="task-drawer-head">
        <div>
          <b>{project.name}</b>
          <small>
            {done}/{tasks.length} task · {flatCount(tree)} simpul pohon
          </small>
        </div>
        <div className="head-actions">
          <button className="task-close" onClick={() => setFull((v) => !v)} title={full ? "Kecilkan panel" : "Layar penuh"}>
            {full ? "⤡" : "⤢"}
          </button>
          <button className="task-close" onClick={onClose} aria-label="Tutup panel proyek">
            ✕
          </button>
        </div>
      </header>

      <nav className="drawer-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            data-active={tab === t.id ? "" : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="drawer-body">
        {tab === "team" && (
          <section aria-label="Tim — struktur delegasi live">
            {live.parentPersonaId ? (
              <div className="org-chart">
                <OrgCard
                  personaId={live.parentPersonaId}
                  subtitle="lead sesi ini"
                  state={live.parentState}
                  root
                />
                {live.delegations.length > 0 && <div className="org-connector" aria-hidden />}
                <ul className="org-children">
                  {live.delegations.map((d) => (
                    <li key={d.childSessionId}>
                      <OrgCard
                        personaId={d.personaId}
                        state={d.childState ?? (d.summary ? "done" : "idle")}
                        goal={d.goal.length > 90 ? d.goal.slice(0, 90) + "…" : d.goal}
                        summary={d.summary ? (d.summary.length > 140 ? d.summary.slice(0, 140) + "…" : d.summary) : undefined}
                      />
                    </li>
                  ))}
                </ul>
                {bench.length > 0 && (
                  <div className="org-bench">
                    <small>Siaga (di roster, belum didelegasi):</small>
                    <div className="bench-row">
                      {bench.map((r) => (
                        <span key={r.personaId} className="bench-chip" title={r.role}>
                          <PersonaFace personaId={r.personaId} size={16} />
                          {PERSONA_NAME[r.personaId]?.replace("Yui ", "") ?? r.personaId.replace("yui-", "")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="task-empty">Buka sesi untuk melihat struktur delegasi live.</p>
            )}
          </section>
        )}

        {tab === "sessions" && (
          <section aria-label="Sesi project">
            <button className="btn secondary session-new" onClick={onNewSession}>
              + Sesi baru (Conductor)
            </button>
            {sessions.length === 0 ? <p className="dim">Belum ada sesi.</p> : (
              <ul className="session-list">
                {sessions.map((s) => (
                  <li key={s.sessionId}>
                    <button data-active={s.sessionId === activeSessionId ? "" : undefined} onClick={() => onOpenSession(s)}>
                      <PersonaFace personaId={s.personaId} size={18} />
                      <span className="who">{s.personaName}</span>
                      <span className="when">{relTime(s.lastEventAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "roster" && (
          <section aria-label="Roster proyek">
            {roster.length === 0 ? (
              <p className="task-empty">Belum ada persona di roster — assign di bawah untuk membentuk tim proyek.</p>
            ) : (
              <ul className="roster-list">
                {roster.map((r) => {
                  const p = personas.find((x) => x.id === r.personaId);
                  return (
                    <li key={r.personaId} className="roster-row">
                      {p ? <PersonaFace personaId={p.id} size={24} /> : <span className="face" />}
                      <span className="roster-body">
                        <b>{p?.name ?? r.personaId}</b>
                        <small>{r.role}</small>
                        {r.phases.length > 0 && <em>{r.phases.join(" · ")}</em>}
                        {r.mcp.map((b) => (
                          <em key={b.server} className="roster-mcp">
                            MCP:{b.server}
                            {b.tools.length > 0 ? ` (${b.tools.length})` : ""}
                          </em>
                        ))}
                      </span>
                      <button
                        className="task-close"
                        onClick={() => void saveRoster(roster.filter((x) => x.personaId !== r.personaId))}
                        aria-label={`Keluarkan ${p?.name ?? r.personaId}`}
                        disabled={busy}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {available.length > 0 && (
              <div className="roster-assign">
                <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Persona">
                  <option value="">Persona…</option>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Peran di proyek ini…"
                  value={role}
                  maxLength={60}
                  onChange={(e) => setRole(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && assign()}
                />
                {mcpServers.length > 0 && (
                  <select value={mcpServer} onChange={(e) => setMcpServer(e.target.value)} aria-label="Binding MCP (opsional)">
                    <option value="">Tanpa binding MCP…</option>
                    {mcpServers.map((s) => (
                      <option key={s.name} value={s.name}>
                        Bind MCP: {s.name}
                      </option>
                    ))}
                  </select>
                )}
                <button className="btn" onClick={assign} disabled={!pick || !role.trim() || busy}>
                  Assign
                </button>
              </div>
            )}
          </section>
        )}

        {tab === "tree" && (
          <section aria-label="Pohon task (TaskTree)">
            {tree.length === 0 ? (
              <p className="task-empty">
                Pohon task masih kosong — simpul terbentuk dari event task (REST / tools <code>todo_*</code>) sejak
                TaskTree aktif. Task pra-migrasi hanya tampil di tab Tasklist.
              </p>
            ) : (
              <ul className="tree-root">
                {tree.map((n) => (
                  <TreeNode key={n.id} node={n} depth={0} />
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "tasks" && (
          <section aria-label="Tasklist proyek">
            <div className="task-add">
              <input
                placeholder="Tambah task…"
                value={title}
                maxLength={140}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
              <button className="btn task-add-btn" onClick={add} disabled={!title.trim() || busy} aria-label="Tambah task">
                +
              </button>
            </div>
            {tasks.length === 0 ? (
              <p className="task-empty">
                Belum ada task. Coba minta agent (Conductor): <i>&ldquo;tambahkan task riset kompetitor ke tasklist,
                assign ke yui-scholar&rdquo;</i> — atau tambah manual di atas.
              </p>
            ) : (
              <ul className="task-list">
                {tasks.map((t) => (
                  <li key={t.id} className="task-row" data-s={t.status}>
                    <button className="task-status" onClick={() => cycle(t)} title="Klik untuk ubah status">
                      {LABEL[t.status]}
                    </button>
                    <span className="task-body">
                      <span className="task-title">{t.title}</span>
                      {t.assignee && <small className="task-assignee">{t.assignee.replace("yui-", "")}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
