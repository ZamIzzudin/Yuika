
"use client";
import { apiUrl } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import type {
  PersonaInfo,
  PersonaState,
  ProjectInfo,
  ProjectSessionSummary,
  RosterEntry,
  TaskItem,
  TaskNode,
  TaskStatus,
} from "@yui/contracts";
import {
  ArrowBendDownRight,
  Check,
  Circle,
  CircleHalf,
  CircleNotch,
  Paperclip,
  TreeStructure,
  X,
} from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { TeamTree, fmtDur } from "./TeamTree";
import { Skeleton } from "./Skeleton";
import { SkillsTab } from "./SkillsTab";
import { FileTab } from "./FileTab";
import { Button, Card, Chip, Select, TextArea, TextInput } from "./ui";
import { toastErr, toastOk } from "./ui/toast";

/** Status cycle: klik chip = maju satu langkah. */
const NEXT: Record<TaskStatus, TaskStatus> = {
  todo: "doing",
  doing: "review",
  review: "done",
  done: "todo",
};
const LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  doing: "On Progress",
  review: "Review",
  done: "Done",
};

export type WorkspaceTab =
  | "chat"
  | "trace"
  | "team"
  | "files"
  | "board"
  | "config";

/** Delegasi live untuk org-chart Tim (dari event delegation.* sesi aktif). */
export interface LiveDelegation {
  personaId: string;
  childSessionId: string;
  goal: string;
  childState?: PersonaState;
  summary?: string;
}

/** Waktu relatif pendek untuk daftar sesi. */
const PERSONA_NAME: Record<string, string> = {
  "yui-conductor": "Maestro Yui",
  "yui-planner": "Liebert Yui",
  "yui-analyst": "Sherlock Yui",
  "yui-scholar": "Einstein Yui",
  "yui-scribe": "Poe Yui",
  "yui-coder": "Hiro Yui",
  "yui-designer": "Picasso Yui",
  "yui-operator": "Neo Yui",
};

/** Ikon status simpul pohon (○ ◐ ◑ ● → Phosphor). */
function TaskStatusIcon({ s, size = 10 }: { s: TaskStatus; size?: number }) {
  if (s === "doing")
    return (
      <CircleNotch
        size={size}
        aria-hidden
        className="animate-pulse text-accent"
      />
    );
  if (s === "review")
    return <CircleHalf size={size} aria-hidden className="text-warn" />;
  if (s === "done")
    return (
      <Circle size={size} weight="fill" aria-hidden className="text-success" />
    );
  return <Circle size={size} aria-hidden className="text-dim" />;
}

/** Satu simpul pohon task (rekursif) — proyeksi event `task.node.*` (D19). */
function TreeNode({
  node,
  depth,
  now,
}: {
  node: TaskNode;
  depth: number;
  now: number;
}) {
  const running = node.status === "doing" || node.status === "review";
  return (
    <li
      className="flex flex-wrap items-center gap-2 rounded-md2 px-2 py-1.5 text-body leading-6 hover:bg-hover"
      style={{ marginLeft: depth > 0 ? 16 : 0 }}
    >
      <span title={LABEL[node.status]} className="self-center">
        <TaskStatusIcon s={node.status} />
      </span>
      <span className="text-secondary">{node.title}</span>
      {node.assignee && (
        <small className="text-caption text-dim">
          {node.assignee.replace("yui-", "")}
        </small>
      )}
      {running && node.startedAt && (
        <small
          className="flex items-center gap-1 text-caption tabular-nums text-warn"
          title="sudah berjalan sejak status doing"
        >
          <CircleNotch size={9} aria-hidden className="animate-pulse" />{" "}
          {fmtDur(now - node.startedAt)}
        </small>
      )}
      {node.status === "done" && node.startedAt && (
        <small
          className="text-caption tabular-nums text-dim"
          title="total durasi pengerjaan"
        >
          {fmtDur((node.doneAt ?? now) - node.startedAt)}
        </small>
      )}
      {node.artefak.map((a) => (
        <small
          key={a}
          className="flex items-center gap-0.5 rounded-pill border border-line bg-hover px-1.5 py-px font-mono text-caption text-muted"
          title={a}
        >
          <Paperclip size={9} aria-hidden /> {a.split("/").pop()}
        </small>
      ))}
      {node.children.length > 0 && (
        <ul className="m-0 flex w-full list-none flex-col gap-0.5 p-0">
          {node.children.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} now={now} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Tab proyek di area utama shell (P1-PRJ-4/6/7): Chat | Tim | Pohon | Roster | Sesi
 * berbagi satu area konten — nav tab dirender page.tsx, komponen ini = konten non-chat.
 * DS-1: ui/* + Tailwind semantik + Phosphor (docs/DESIGN-SYSTEM.md).
 */
export function ProjectTabs({
  project,
  personas,
  activeTab,
  rev,
  activeSessionId,
  live,
}: {
  project: ProjectInfo;
  personas: PersonaInfo[];
  activeTab: Exclude<WorkspaceTab, "chat">;
  rev: number;
  activeSessionId: string | null;
  live: {
    parentPersonaId: string | null;
    parentState: PersonaState;
    delegations: LiveDelegation[];
  };
}) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tree, setTree] = useState<TaskNode[]>([]);
  // Tab Konfigurasi: menu internal (roster/memori/skill) — ala SettingsModal, non-modal.
  const [cfgMenu, setCfgMenu] = useState<"roster" | "memory" | "skills">("roster");
  // Drawer "Log Task" (bekas tab Pohon) — dibuka dari tab Task.
  const [treeOpen, setTreeOpen] = useState(false);
  // Jam live untuk durasi "sudah berjalan Xm" (tab Pohon & Tim)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [readiness, setReadiness] = useState<
    {
      personaId: string;
      ready: boolean;
      phases: { phase: string; ready: boolean; skills: string[] }[];
    }[]
  >([]);
  const [title, setTitle] = useState("");
  const [pick, setPick] = useState("");
  const [role, setRole] = useState("");
  const [mcpServer, setMcpServer] = useState("");
  const [mcpServers, setMcpServers] = useState<
    { name: string; declared: boolean }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [userMd, setUserMd] = useState("");
  const [projMd, setProjMd] = useState("");
  const [loaded, setLoaded] = useState(false); // skeleton hanya untuk load pertama

  const refresh = useCallback(async () => {
    try {
      const [t, r, m] = await Promise.all([
        fetch(apiUrl(`/api/projects/${project.id}/tasks`)),
        fetch(apiUrl(`/api/projects/${project.id}/roster`)),
        fetch(apiUrl("/api/mcp/servers")),
      ]);
      if (t.ok) setTasks(((await t.json()) as { tasks: TaskItem[] }).tasks);
      if (r.ok) {
        const rd = (await r.json()) as {
          roster: RosterEntry[];
          readiness?: typeof readiness;
        };
        setRoster(rd.roster);
        if (rd.readiness) setReadiness(rd.readiness);
      }
      if (m.ok)
        setMcpServers(
          (
            (await m.json()) as {
              servers: { name: string; declared: boolean }[];
            }
          ).servers.filter((s) => s.declared),
        );
      setLoaded(true);
    } catch {
      /* refresh berikutnya */
    }
  }, [project.id]);

  const refreshTree = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/projects/${project.id}/tree`));
      if (res.ok) setTree(((await res.json()) as { nodes: TaskNode[] }).nodes);
    } catch {
      /* refresh berikutnya */
    }
  }, [project.id]);

  async function saveRoster(next: RosterEntry[]) {
    setBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/projects/${project.id}/roster`), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roster: next }),
      });
      if (res.ok)
        setRoster(((await res.json()) as { roster: RosterEntry[] }).roster);
    } finally {
      setBusy(false);
    }
  }

  const available = personas.filter(
    (p) => !roster.some((r) => r.personaId === p.id),
  );

  useEffect(() => {
    void refresh();
  }, [rev, refresh]);

  useEffect(() => {
    if (activeTab === "board" || treeOpen) void refreshTree();
  }, [activeTab, treeOpen, rev, refreshTree]);

  useEffect(() => {
    if (activeTab !== "config" || cfgMenu !== "memory") return;
    void (async () => {
      try {
        const [u, p] = await Promise.all([
          fetch(apiUrl("/api/memory?scope=user")),
          fetch(apiUrl(`/api/memory?scope=project&projectId=${project.id}`)),
        ]);
        if (u.ok) setUserMd(((await u.json()) as { content: string }).content);
        if (p.ok) setProjMd(((await p.json()) as { content: string }).content);
      } catch {
        /* coba lagi saat buka tab */
      }
    })();
  }, [activeTab, cfgMenu, project.id]);

  /** Simpan dokumen memori (PUT /api/memory). */
  async function saveMemoryDoc(scope: "user" | "project") {
    const res = await fetch(apiUrl("/api/memory"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope,
        projectId: scope === "project" ? project.id : null,
        content: scope === "user" ? userMd : projMd,
      }),
    });
    if (res.ok)
      toastOk(
        scope === "user"
          ? "USER.md saved — applies from the next new session."
          : "Project MEMORY.md saved.",
      );
    else toastErr("failed to save the memory doc");
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

  /** P2-FLOW-7: pindah kartu antar kolom papan (drag&drop HTML5) → PATCH status. */
  async function moveTask(taskId: string, status: TaskStatus) {
    await fetch(apiUrl(`/api/projects/${project.id}/tasks/${taskId}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await Promise.all([refresh(), refreshTree()]);
  }

  const done = tasks.filter((t) => t.status === "done").length;
  const runningIds = new Set(live.delegations.map((d) => d.personaId));
  const bench = roster.filter((r) => !runningIds.has(r.personaId));
  /** P2-FLOW-7: kartu papan = flatten TaskTree + task pra-migrasi (hanya di DB) di depth 0. */
  const treeFlat = tree.flatMap((n) => {
    const out: Array<{ node: TaskNode; depth: number }> = [];
    const walk = (x: TaskNode, d: number) => {
      out.push({ node: x, depth: d });
      x.children.forEach((c) => walk(c, d + 1));
    };
    walk(n, 0);
    return out;
  });
  const inTree = new Set(treeFlat.map((t) => t.node.id));
  const flattenCards = [
    ...treeFlat,
    ...tasks
      .filter((t) => !inTree.has(t.id))
      .map((t) => ({
        node: { ...t, artefak: [], children: [] } as unknown as TaskNode,
        depth: 0,
      })),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
      {!loaded && <Skeleton lines={6} />}
      {loaded && activeTab === "config" && (
        <div className="flex min-h-0 flex-1 items-start gap-5">
          <nav
            aria-label="Configuration menu"
            className="sticky top-0 flex w-[150px] shrink-0 flex-col gap-0.5 rounded-lg2 border border-line bg-surface p-1.5"
          >
            {(
              [
                ["roster", "Roster"],
                ["memory", "Memory"],
                ["skills", "Skill"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-current={cfgMenu === id ? "page" : undefined}
                className={`flex cursor-pointer items-center rounded-md2 border border-transparent px-2.5 py-2 text-left text-body transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
                  cfgMenu === id ? "bg-hover text-primary" : "text-dim hover:bg-hover hover:text-secondary"
                }`}
                onClick={() => setCfgMenu(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="flex min-h-0 flex-1 flex-col">
{loaded && cfgMenu === "roster" && (
        <section aria-label="Project roster" className="flex flex-col gap-3">
          <p className="text-caption text-dim">
            {done}/{tasks.length} tasks done · roster stored declaratively in{" "}
            <code className="font-mono">project.yaml</code>
          </p>
          {roster.length === 0 ? (
            <p className="text-caption leading-5 text-dim">
              No personas in the roster yet — assign below to form the project
              team.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {roster.map((r) => {
                const p = personas.find((x) => x.id === r.personaId);
                return (
                  <li
                    key={r.personaId}
                    className="group flex items-start gap-3 rounded-lg2 border border-line bg-surface px-3 py-2.5"
                  >
                    {p ? (
                      <PersonaFace personaId={p.id} size={24} />
                    ) : (
                      <span
                        className="h-6 w-6 shrink-0 rounded-pill bg-inset"
                        aria-hidden
                      />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <b className="text-body font-semibold text-primary">
                        {p?.name ?? r.personaId}
                      </b>
                      <small className="text-caption text-dim">{r.role}</small>
                      {r.phases.length > 0 && (
                        <small className="text-caption text-muted">
                          {r.phases.join(" · ")}
                        </small>
                      )}
                      {/* P1-DUN-5: gating per fase — ✕ = belum ada skill siap (latih di Dungeon) */}
                      {readiness
                        .find((x) => x.personaId === r.personaId)
                        ?.phases.filter(
                          (ph) => ph.skills.length > 0 || !ph.ready,
                        )
                        .map((ph) => (
                          <small
                            key={ph.phase}
                            className={`flex items-center gap-0.5 text-caption ${ph.ready ? "text-success" : "text-danger"}`}
                            title={
                              ph.ready
                                ? `skills ready: ${ph.skills.join(", ")}`
                                : "no ready skills for this phase — train the persona in the Dungeon (Skill tab)"
                            }
                          >
                            {ph.ready ? (
                              <Check size={10} weight="bold" aria-hidden />
                            ) : (
                              <X size={10} weight="bold" aria-hidden />
                            )}
                            {ph.phase}
                          </small>
                        ))}
                      {r.mcp.map((b) => (
                        <Chip
                          key={b.server}
                          tone="muted"
                          className="self-start"
                        >
                          MCP:{b.server}
                          {b.tools.length > 0 ? ` (${b.tools.length})` : ""}
                        </Chip>
                      ))}
                    </span>
                    <button
                      className="flex shrink-0 cursor-pointer items-center justify-center rounded-md2 border border-transparent p-1 text-dim opacity-0 transition-opacity group-hover:opacity-100 hover:bg-hover hover:text-danger focus-visible:opacity-100"
                      onClick={() =>
                        void saveRoster(
                          roster.filter((x) => x.personaId !== r.personaId),
                        )
                      }
                      aria-label={`Remove ${p?.name ?? r.personaId} from roster`}
                      disabled={busy}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {available.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg2 border border-line bg-inset p-3">
              <Select
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                aria-label="Persona"
                className="w-36"
              >
                <option value="">Persona…</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <TextInput
                placeholder="Role in this project…"
                value={role}
                maxLength={60}
                className="w-56"
                onChange={(e) => setRole(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && assign()}
              />
              {mcpServers.length > 0 && (
                <Select
                  value={mcpServer}
                  onChange={(e) => setMcpServer(e.target.value)}
                  aria-label="MCP binding (optional)"
                  className="w-44"
                >
                  <option value="">No MCP binding…</option>
                  {mcpServers.map((s) => (
                    <option key={s.name} value={s.name}>
                      Bind MCP: {s.name}
                    </option>
                  ))}
                </Select>
              )}
              <Button
                variant="primary"
                onClick={assign}
                disabled={!pick || !role.trim() || busy}
              >
                Assign
              </Button>
            </div>
          )}
        </section>
      )}
{loaded && cfgMenu === "memory" && (
        <section
          aria-label="Memory — what Yui knows"
          className="flex max-w-[760px] flex-col gap-3"
        >
          {[
            {
              scope: "user" as const,
              title: "About You — USER.md",
              hint: "Cross-project: style, language, and constraint preferences.",
            },
            {
              scope: "project" as const,
              title: `This Project — MEMORY.md`,
              hint: `Decisions, lessons, and context that apply to ${project.name}.`,
            },
          ].map((d) => (
            <Card key={d.scope} className="flex flex-col gap-2.5">
              <header className="flex items-center justify-between gap-2">
                <b className="text-body font-semibold text-primary">
                  {d.title}
                </b>
                <Button size="sm" onClick={() => void saveMemoryDoc(d.scope)}>
                  Save
                </Button>
              </header>
              <TextArea
                value={d.scope === "user" ? userMd : projMd}
                onChange={(e) =>
                  d.scope === "user"
                    ? setUserMd(e.target.value)
                    : setProjMd(e.target.value)
                }
                rows={9}
                spellCheck={false}
              />
              <small className="text-caption text-dim">{d.hint}</small>
            </Card>
          ))}
        </section>
      )}
        {loaded && cfgMenu === "skills" && <SkillsTab />}
          </div>
        </div>
      )}

      {loaded && activeTab === "board" && (
        <section aria-label="Task kanban board">
          <header className="mb-3 flex items-center justify-between">
            <b className="text-body font-semibold text-primary">Task</b>
            <Button size="sm" onClick={() => setTreeOpen(true)}>
              <TreeStructure size={13} aria-hidden /> Log Task
            </Button>
          </header>
          <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {(["todo", "doing", "review", "done"] as const).map((col) => {
              const cards = flattenCards.filter((c) => c.node.status === col);
              return (
                <div
                  key={col}
                  className={`flex min-h-[220px] flex-col gap-2 rounded-lg2 border border-line border-t-2 bg-inset p-3 ${
                    col === "doing"
                      ? "border-t-warn"
                      : col === "review"
                        ? "border-t-accent"
                        : col === "done"
                          ? "border-t-success"
                          : "border-t-line-strong"
                  }`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/yui-task");
                    if (id) void moveTask(id, col);
                  }}
                >
                  <header className="flex items-center justify-between">
                    <b className="text-body font-semibold text-secondary">
                      {LABEL[col]}
                    </b>
                    <span className="rounded-pill bg-surface px-2 text-caption tabular-nums text-dim">
                      {cards.length}
                    </span>
                  </header>
                  <div className="flex flex-col gap-2">
                    {cards.map(({ node, depth }) => (
                      <article
                        key={node.id}
                        className="flex cursor-grab flex-wrap items-center gap-1.5 rounded-lg2 border border-line bg-raised px-3 py-2 select-none hover:border-line-strong active:cursor-grabbing"
                        style={{ marginLeft: depth * 10 }}
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/yui-task", node.id)
                        }
                        title={depth > 0 ? "subtask" : undefined}
                      >
                        {depth > 0 && (
                          <ArrowBendDownRight
                            size={10}
                            aria-hidden
                            className="text-dim"
                          />
                        )}
                        <span className="min-w-0 flex-1 overflow-wrap-anywhere text-body text-secondary">
                          {node.title}
                        </span>
                        {node.assignee && (
                          <small className="text-caption text-muted">
                            {node.assignee.replace("yui-", "")}
                          </small>
                        )}
                        {node.artefak.length > 0 && (
                          <small className="text-caption text-dim">
                            +{node.artefak.length}
                          </small>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {loaded && activeTab === "files" && <FileTab projectId={project.id} />}

      {treeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Log Task"
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={() => setTreeOpen(false)}
        >
          <div
            className="motion-safe:msg-in flex h-full w-full max-w-[560px] flex-col gap-3 overflow-y-auto border-l border-line bg-canvas p-4 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <b className="text-body font-semibold text-primary">Log Task</b>
              <Button size="sm" variant="ghost" aria-label="Close" onClick={() => setTreeOpen(false)}>
                <X size={14} weight="bold" aria-hidden />
              </Button>
            </header>
            <section aria-label="Task tree (TaskTree)">
          {tree.length === 0 ? (
            <p className="text-caption leading-5 text-dim">
              The task tree is still empty — nodes grow from task events (REST /
              tools <code className="font-mono">todo_*</code>) since TaskTree
              went live. Pre-migration tasks only show on the Task board.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {tree.map((n) => (
                <TreeNode key={n.id} node={n} depth={0} now={now} />
              ))}
            </ul>
          )}
        </section>
          </div>
        </div>
      )}

      {loaded && activeTab === "team" && (
        <section
          aria-label="Team — delegation hierarchy diagram"
          className="flex flex-col gap-4"
        >
          <TeamTree
            projectId={project.id}
            rootSessionId={activeSessionId}
            rootPersonaId={live.parentPersonaId}
            rootState={live.parentState}
          />
          {bench.length > 0 && (
            <div className="w-full max-w-[460px]">
              <small className="mb-2 block text-caption text-dim">
                On bench (in roster, not yet delegated):
              </small>
              <div className="flex flex-wrap gap-2">
                {bench.map((r) => (
                  <span
                    key={r.personaId}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-dashed border-line px-2.5 py-0.5 text-caption text-muted"
                    title={r.role}
                  >
                    <PersonaFace personaId={r.personaId} size={16} />
                    {PERSONA_NAME[r.personaId]?.replace(" Yui", "") ??
                      r.personaId.replace("yui-", "")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
