"use client";
import { apiUrl, authFetch } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DeleteProjectResult,
  PersonaInfo,
  PersonaState,
  ProjectInfo,
  RosterEntry,
  TaskItem,
  TaskNode,
  TaskStatus,
} from "@yuika/contracts";
import {
  ArrowBendDownRight,
  Brain,
  Check,
  Circle,
  CircleHalf,
  CircleNotch,
  Copy,
  FolderSimple,
  Paperclip,
  PencilSimple,
  TreeStructure,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import { PersonaFace } from "./PersonaPicker";
import { TeamTree, fmtDur } from "./TeamTree";
import { Skeleton } from "./Skeleton";
import { SkillsTab } from "./SkillsTab";
import { FileTab } from "./FileTab";
import { WorkflowStepsCard } from "./WorkflowStepsCard";
import { ProjectDashboardView } from "./ProjectDashboard";
import { WorkshopPanel } from "./WorkshopPanel";
import { TerminalFullTab } from "./TerminalFullTab";
import { TeamSetupView } from "./TeamSetupView";
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  Field,
  Select,
  TextArea,
  TextInput,
  Modal,
} from "./ui";
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
  | "terminal"
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
  "yui-planner": "Rommel Yui",
  "yui-analyst": "Nighty Yui",
  "yui-sherlock": "Watson Yui",
  "yui-scholar": "Pierre Yui",
  "yui-scribe": "Poe Yui",
  "yui-coder": "Hiro Yui",
  "yui-designer": "Picasso Yui",
  "yui-operator": "Neo Yui",
};

/** Ikon status simpul pohon (○ ◐ ◑ ● → Phosphor). */
/** Config → Browser (Batch 14a++): policy reader pindah ke Config, toggle
 *  allowAll per project (SSRF guard IP-private TETAP jalan di backend). */
function BrowserPolicySection({ projectId }: { projectId: string }) {
  const [policy, setPolicy] = useState<{
    allow: string[];
    allowAll: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await authFetch(
        apiUrl(`/api/projects/${projectId}/browser/policy`),
      );
      if (r.ok) setPolicy(await r.json());
    } catch {
      /* best-effort */
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (allowAll: boolean) => {
      setBusy(true);
      setErr(null);
      try {
        const r = await authFetch(
          apiUrl(`/api/projects/${projectId}/browser/policy`),
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ allowAll }),
          },
        );
        if (r.ok) setPolicy(await r.json());
        else {
          const b = (await r.json().catch(() => ({}))) as { error?: string };
          setErr(b.error ?? `HTTP ${r.status}`);
        }
      } finally {
        setBusy(false);
      }
    },
    [projectId],
  );

  return (
    <section
      aria-label="Browser policy"
      className="flex flex-col gap-3"
    >
      <header>
        <b className="text-body font-semibold text-primary">Browser policy</b>
        <p className="mt-1 text-caption leading-5 text-dim">
          Controls what the agent&apos;s web tools (web_fetch / research) may
          open for this project. Live screen browsing is not affected, this
          policy gates server-side page fetching only.
        </p>
      </header>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg2 border border-line bg-surface px-3 py-2.5">
        <input
          type="checkbox"
          className="mt-0.5 accent-current"
          checked={policy?.allowAll ?? false}
          disabled={!policy || busy}
          onChange={() => void toggle(!policy?.allowAll)}
        />
        <span className="flex flex-col gap-0.5">
          <b className="text-body font-medium text-primary">
            Allow all public domains
          </b>
          <span className="text-caption text-muted">
            When on, every public domain can be fetched without adding it to the
            allowlist. Private/loopback hosts stay blocked (SSRF guard).
          </span>
        </span>
      </label>
      {err && (
        <p
          className="rounded-lg2 border border-line bg-surface px-3 py-2 text-caption text-rose-400"
          role="alert"
        >
          {err}
        </p>
      )}
      {policy && !policy.allowAll && (
        <div className="rounded-lg2 border border-line bg-surface px-3 py-2.5">
          <b className="text-caption font-semibold uppercase tracking-wide text-dim">
            Allowlist
          </b>
          {policy.allow.length === 0 ? (
            <p className="mt-1 text-caption text-muted">
              Empty, only the default domain and explicit additions are allowed.
              Turn on &quot;Allow all&quot; above or extend the list via project
              config.
            </p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {policy.allow.map((d) => (
                <li
                  key={d}
                  className="rounded-pill border border-line bg-inset px-2 py-0.5 font-mono text-caption text-secondary"
                >
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

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

/** Satu simpul pohon task (rekursif), proyeksi event `task.node.*` (D19). */
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
 * berbagi satu area konten, nav tab dirender page.tsx, komponen ini = konten non-chat.
 * DS-1: ui/* + Tailwind semantik + Phosphor (docs/DESIGN-SYSTEM.md).
 */
/** Batch 16: edit nama & deskripsi project (Config → Project), PATCH lalu
 *  parent refresh (header/sidebar ikut berubah). */
function ProjectEditCard({
  project,
  onSaved,
  onDeleted,
}: {
  project: ProjectInfo;
  onSaved?: () => void;
  /** D33: dipanggil setelah project terhapus dari Config (parent: refresh
   *  daftar project & keluar dari scope project yang dihapus). */
  onDeleted?: (projectId: string) => void;
}) {
  const [name, setName] = useState(project.name);
  const [desc, setDesc] = useState(project.description);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const dirty = name.trim() !== project.name || desc !== project.description;

  // ganti project (pindah scope) → reset form lokal
  useEffect(() => {
    setName(project.name);
    setDesc(project.description);
  }, [project.id, project.name, project.description]);

  async function save() {
    if (!name.trim() || busy || !dirty) return;
    setBusy(true);
    try {
      const res = await authFetch(apiUrl(`/api/projects/${project.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc }),
      });
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`,
        );
      toastOk("Project updated");
      setEditOpen(false);
      onSaved?.();
    } catch (e) {
      toastErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(project.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1_400);
    } catch {
      /* clipboard ditolak browser */
    }
  }

  /** Sama dengan ProjectPanel.remove (Home): respons 200 dari server lama
   *  tanpa field aditif TIDAK boleh gagalkan refresh UI, pakai body apa adanya. */
  async function remove() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await authFetch(
        apiUrl(`/api/projects/${encodeURIComponent(project.id)}`),
        { method: "DELETE" },
      );
      const body = (await res
        .json()
        .catch(() => ({}))) as DeleteProjectResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setConfirmOpen(false);
      toastOk(
        `\u201C${project.name}\u201D deleted \u2014 sessions, tasks & workspace cleaned up. Persona skills & metering are kept.`,
      );
      onDeleted?.(project.id);
    } catch (e) {
      toastErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  const cell = (label: string, value: React.ReactNode) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <small className="text-[10px] font-semibold tracking-wider text-dim uppercase">
        {label}
      </small>
      <span className="min-w-0 truncate text-caption text-secondary">
        {value}
      </span>
    </div>
  );

  return (
    <section aria-label="Project details" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <b className="text-body font-semibold text-primary">Project</b>
        <p className="text-caption text-dim">
          The identity of this workspace, one compact card. Edit the name or
          description with the pencil button.
        </p>
      </header>

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-lg2 border border-line bg-surface"
          >
            <FolderSimple size={16} className="text-accent" />
          </span>
          <span className="min-w-0 flex-1">
            <b className="text-title font-semibold break-words text-primary">
              {project.name}
            </b>
            <p className="mt-0.5 text-body leading-6 text-muted">
              {project.description || "No description yet."}
            </p>
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            aria-label="Edit project name and description"
            title="Edit name & description"
            onClick={() => setEditOpen(true)}
          >
            <PencilSimple size={13} aria-hidden />
            Edit
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 sm:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <small className="text-[10px] font-semibold tracking-wider text-dim uppercase">
              Project ID
            </small>
            <button
              type="button"
              onClick={() => void copyId()}
              title="Copy project ID"
              className="flex min-w-0 cursor-pointer items-center gap-1 text-caption text-secondary transition-colors hover:text-primary"
            >
              <code className="truncate font-mono">{project.id}</code>
              {copiedId ? (
                <Check
                  size={11}
                  aria-hidden
                  className="shrink-0 text-success"
                />
              ) : (
                <Copy size={11} aria-hidden className="shrink-0 text-dim" />
              )}
            </button>
          </div>
          {cell("Status", project.status)}
          {cell("Kind", project.kind)}
          {cell(
            "Workspace",
            <code className="font-mono">{project.rootPath}</code>,
          )}
          {cell(
            "Created",
            new Date(project.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            }),
          )}
          {cell(
            "Updated",
            new Date(project.updatedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            }),
          )}
        </div>
      </Card>

      {/* danger zone */}
      <section
        aria-label="Danger zone"
        className="flex flex-wrap items-center gap-3 rounded-lg2 border border-danger/25 bg-danger-soft/30 px-3 py-3"
      >
        <div className="min-w-0 flex-1">
          <b className="text-caption font-semibold text-danger">Danger zone</b>
          <p className="text-caption leading-5 text-muted">
            Deleting removes sessions, tasks, files, revisions and the sandbox
            container. Persona skills and usage metering are kept.
          </p>
        </div>
        <Button
          size="sm"
          variant="danger"
          className="shrink-0"
          onClick={() => setConfirmOpen(true)}
        >
          Delete project
        </Button>
      </section>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit project"
      >
        <div className="flex flex-col gap-3">
          <Field label="Name">
            <TextInput
              value={name}
              maxLength={80}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Description"
            hint="Shown on Home and read by every persona on the team."
          >
            <TextArea
              value={desc}
              maxLength={280}
              rows={3}
              placeholder="What is this project about?"
              onChange={(e) => setDesc(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              onClick={() => setEditOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={save}
              disabled={!dirty || !name.trim() || busy}
            >
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete project"
        message={
          <>
            Delete <b className="text-primary">{project.name}</b>? This removes
            all sessions, tasks, workspace files and revisions. This cannot be
            undone.
          </>
        }
        busy={deleting}
        onConfirm={() => void remove()}
        onClose={() => setConfirmOpen(false)}
      />
    </section>
  );
}

export function ProjectTabs({
  project,
  personas,
  activeTab,
  rev,
  activeSessionId,
  live,
  onProjectUpdated,
  onDeleted,
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
  /** Batch 16: setelah edit nama/deskripsi (menu Project), parent refresh. */
  onProjectUpdated?: () => void;
  /** D33: project dihapus dari Config → parent reset scope + refresh. */
  onDeleted?: (projectId: string) => void;
}) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tree, setTree] = useState<TaskNode[]>([]);
  // Tab Konfigurasi: menu internal (roster/memori/skill), ala SettingsModal, non-modal.
  const [cfgMenu, setCfgMenu] = useState<
    "project" | "roster" | "memory" | "skills" | "browser" | "workshop"
  >("roster");
  // Drawer "Log Task" (bekas tab Pohon), dibuka dari tab Task.
  const [treeOpen, setTreeOpen] = useState(false);
  /** D33: sheet "Log Task" slide kanan→kiri saat buka, mundur saat tutup.
   *  treeOpen = mounted; sheetVis = posisi (translate-x). */
  const [sheetVis, setSheetVis] = useState(false);
  const sheetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [busy, setBusy] = useState(false);
  // D34: baseline utk dirty-check dokumen memori (Save hanya aktif saat berubah).
  const [userMd, setUserMd] = useState("");
  const [projMd, setProjMd] = useState("");
  const [userMdBase, setUserMdBase] = useState("");
  const [projMdBase, setProjMdBase] = useState("");
  const [memBusy, setMemBusy] = useState<"user" | "project" | null>(null);
  const [loaded, setLoaded] = useState(false); // skeleton hanya untuk load pertama

  const refresh = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        authFetch(apiUrl(`/api/projects/${project.id}/tasks`)),
        authFetch(apiUrl(`/api/projects/${project.id}/roster`)),
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
      setLoaded(true);
    } catch {
      /* refresh berikutnya */
    }
  }, [project.id]);

  const refreshTree = useCallback(async () => {
    try {
      const res = await authFetch(apiUrl(`/api/projects/${project.id}/tree`));
      if (res.ok) setTree(((await res.json()) as { nodes: TaskNode[] }).nodes);
    } catch {
      /* refresh berikutnya */
    }
  }, [project.id]);

  async function saveRoster(next: RosterEntry[]) {
    setBusy(true);
    try {
      const res = await authFetch(
        apiUrl(`/api/projects/${project.id}/roster`),
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roster: next }),
        },
      );
      if (res.ok) {
        setRoster(((await res.json()) as { roster: RosterEntry[] }).roster);
        // Batch 16: assignment berubah → gating tab Terminal (Hiro/Neo) hidup.
        window.dispatchEvent(new Event("yui:roster-changed"));
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [rev, refresh]);

  /** D33: buka sheet, mount dulu, frame berikutnya geser masuk (transisi jalan). */
  const openSheet = useCallback(() => {
    // batal sisa timer close sebelumnya (race buka-tutup cepat).
    if (sheetTimer.current) clearTimeout(sheetTimer.current);
    setTreeOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setSheetVis(true)));
  }, []);
  /** D33: tutup sheet, mundur dulu, unmount setelah animasi selesai. */
  const closeSheet = useCallback(() => {
    setSheetVis(false);
    sheetTimer.current = setTimeout(() => setTreeOpen(false), 280);
  }, []);
  // Escape menutup sheet.
  useEffect(() => {
    if (!treeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [treeOpen, closeSheet]);

  useEffect(() => {
    if (activeTab === "board" || treeOpen) void refreshTree();
  }, [activeTab, treeOpen, rev, refreshTree]);

  useEffect(() => {
    if (activeTab !== "config" || cfgMenu !== "memory") return;
    void (async () => {
      try {
        const [u, p] = await Promise.all([
          authFetch(apiUrl("/api/memory?scope=user")),
          authFetch(
            apiUrl(`/api/memory?scope=project&projectId=${project.id}`),
          ),
        ]);
        if (u.ok) {
          const c = ((await u.json()) as { content: string }).content;
          setUserMd(c);
          setUserMdBase(c);
        }
        if (p.ok) {
          const c = ((await p.json()) as { content: string }).content;
          setProjMd(c);
          setProjMdBase(c);
        }
      } catch {
        /* coba lagi saat buka tab */
      }
    })();
  }, [activeTab, cfgMenu, project.id]);

  /** Simpan dokumen memori (PUT /api/memory), D34: busy state + baseline. */
  async function saveMemoryDoc(scope: "user" | "project") {
    setMemBusy(scope);
    try {
      const res = await authFetch(apiUrl("/api/memory"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          projectId: scope === "project" ? project.id : null,
          content: scope === "user" ? userMd : projMd,
        }),
      });
      if (res.ok) {
        if (scope === "user") setUserMdBase(userMd);
        else setProjMdBase(projMd);
        toastOk(
          scope === "user"
            ? "USER.md saved, applies from the next new session."
            : "Project MEMORY.md saved.",
        );
      } else toastErr("Failed to save the memory doc");
    } finally {
      setMemBusy(null);
    }
  }

  /** P2-FLOW-7: pindah kartu antar kolom papan (drag&drop HTML5) → PATCH status. */
  async function moveTask(taskId: string, status: TaskStatus) {
    await authFetch(apiUrl(`/api/projects/${project.id}/tasks/${taskId}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await Promise.all([refresh(), refreshTree()]);
  }

  const done = tasks.filter((t) => t.status === "done").length;
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
                ["project", "Project"],
                ["roster", "Roster"],
                ["memory", "Memory"],
                ["skills", "Skill"],
                ["browser", "Browser"],
                ["workshop", "Workshop"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-current={cfgMenu === id ? "page" : undefined}
                className={`flex cursor-pointer items-center rounded-md2 border border-transparent px-2.5 py-2 text-left text-body transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
                  cfgMenu === id
                    ? "bg-hover text-primary"
                    : "text-dim hover:bg-hover hover:text-secondary"
                }`}
                onClick={() => setCfgMenu(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="flex min-h-0 flex-1 flex-col">
            {loaded && cfgMenu === "project" && (
              <ProjectEditCard
                project={project}
                onSaved={onProjectUpdated}
                onDeleted={onDeleted}
              />
            )}
            {loaded && cfgMenu === "roster" && (
              <section
                aria-label="Project roster"
                className="flex flex-col gap-4"
              >
                {/* D34: playground identik dgn "Build Your Team", tanpa
                    dropdown Start session (footer = ringkasan tim). */}
                <TeamSetupView
                  project={{ id: project.id, name: project.name }}
                  personas={personas}
                  assignedIds={roster.map((r) => r.personaId)}
                  onAssign={(pid) => {
                    const p = personas.find((x) => x.id === pid);
                    if (!p || roster.some((r) => r.personaId === pid)) return;
                    void saveRoster([
                      ...roster,
                      {
                        personaId: pid,
                        role: p.expertise,
                        phases: [],
                        mcp: [],
                      },
                    ]);
                  }}
                  onUnassign={(pid) =>
                    void saveRoster(roster.filter((r) => r.personaId !== pid))
                  }
                  title="Rearrange Your Team"
                  footer={
                    <span className="text-caption text-dim" aria-live="polite">
                      {roster.length} on the team.
                    </span>
                  }
                />

              </section>
            )}
            {loaded && cfgMenu === "memory" && (
              <section
                aria-label="Memory, what Yui knows"
                className="flex flex-col gap-4"
              >
                <header className="flex flex-col gap-1">
                  <b className="text-body font-semibold text-primary">Memory</b>
                  <p className="text-caption text-dim">
                    Two living documents Yui reads at the start of every
                    session, keep them short and factual.
                  </p>
                </header>
                {[
                  {
                    scope: "user" as const,
                    title: "About You",
                    file: "USER.md",
                    Icon: UserCircle,
                    hint: "Cross-project: your style, language, and constraints.",
                    value: userMd,
                    base: userMdBase,
                    set: setUserMd,
                  },
                  {
                    scope: "project" as const,
                    title: "This Project",
                    file: "MEMORY.md",
                    Icon: Brain,
                    hint: `Decisions and context that apply to ${project.name}.`,
                    value: projMd,
                    base: projMdBase,
                    set: setProjMd,
                  },
                ].map((d) => {
                  const dirty = d.value !== d.base;
                  return (
                    <Card key={d.scope} className="p-4">
                      <header className="flex flex-wrap items-center gap-2.5">
                        <span
                          aria-hidden
                          className="flex size-7 shrink-0 items-center justify-center rounded-md2 border border-line bg-surface"
                        >
                          <d.Icon size={14} className="text-accent" />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <b className="text-body font-semibold text-primary">
                            {d.title}
                          </b>
                          <code className="font-mono text-caption text-dim">
                            {d.file}
                          </code>
                        </span>
                        <div className="ml-auto flex shrink-0 items-center gap-2">
                          {dirty && <Chip tone="warn">Unsaved</Chip>}
                          <Button
                            size="sm"
                            variant={dirty ? "primary" : "secondary"}
                            disabled={!dirty || memBusy === d.scope}
                            onClick={() => void saveMemoryDoc(d.scope)}
                          >
                            {memBusy === d.scope ? "Saving…" : "Save"}
                          </Button>
                        </div>
                      </header>
                      <TextArea
                        value={d.value}
                        onChange={(e) => d.set(e.target.value)}
                        rows={10}
                        spellCheck={false}
                        className="mt-3 font-mono text-caption leading-6"
                      />
                      <footer className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <small className="text-caption text-dim">
                          {d.hint}
                        </small>
                        <small className="shrink-0 text-caption text-muted">
                          {d.value.length.toLocaleString("en-US")} chars
                        </small>
                      </footer>
                    </Card>
                  );
                })}
              </section>
            )}
            {loaded && cfgMenu === "skills" && <SkillsTab />}
            {loaded && cfgMenu === "browser" && (
              <BrowserPolicySection projectId={project.id} />
            )}
            {/* Batch 13 (P2-WKS-6): workshop persisten, status/lifecycle/log/egress */}
            {loaded && cfgMenu === "workshop" && (
              <WorkshopPanel projectId={project.id} rev={rev} />
            )}
          </div>
        </div>
      )}

      {loaded && activeTab === "board" && (
        <section
          aria-label="Task kanban board"
          className="flex flex-col gap-4 min-h-[87dvh]"
        >
          {/* P2-PM-4/5: dashboard progres & health di paling atas, dibaca
              sekali lihat sebelum masuk board/detail. */}
          <ProjectDashboardView
            projectId={project.id}
            personas={personas}
            rev={rev}
          />
          {/* assign/reassign step workflow hidup di sini (keputusan user
              2026-11-08: Task = fokus penataan siapa-kerja-apa) */}
          <WorkflowStepsCard projectId={project.id} />
          <div>
            <header className="mb-5 flex items-center justify-between">
              <span className="text-sm text-dim">Task</span>
              <Button size="sm" onClick={openSheet}>
                Log Task
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
          </div>
        </section>
      )}

      {loaded && activeTab === "files" && <FileTab projectId={project.id} />}
      {/* Batch 14a++ (user 2026-11): tab Browser dibongkar, reader dihapus; live screen = floating window via bubble chat; tab = TERMINAL PENUH (Shell shared + Commands). */}
      {loaded && activeTab === "terminal" && (
        <TerminalFullTab project={{ id: project.id, name: project.name }} />
      )}

      {treeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Log Task"
          className={`fixed inset-0 z-50 flex justify-end bg-black/40 transition-opacity ease-[var(--ease-out-yui)] duration-[240ms] ${
            sheetVis ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeSheet}
        >
          {/* D33: slide kanan→kiri saat buka, mundur saat tutup (bukan pop). */}
          <div
            className={`flex h-full w-full max-w-[560px] flex-col gap-3 overflow-y-auto border-l border-line bg-canvas p-4 shadow-pop transition-transform ease-[var(--ease-out-yui)] duration-[240ms] ${
              sheetVis ? "translate-x-0" : "translate-x-full"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <b className="text-body font-semibold text-primary">Log Task</b>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Close"
                onClick={closeSheet}
              >
                <X size={14} weight="bold" aria-hidden />
              </Button>
            </header>
            <section aria-label="Task tree (TaskTree)">
              {tree.length === 0 ? (
                <p className="text-caption leading-5 text-dim">
                  The task tree is still empty, nodes grow from task events
                  (REST / tools <code className="font-mono">todo_*</code>) since
                  TaskTree went live. Pre-migration tasks only show on the Task
                  board.
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
          aria-label="Team, delegation hierarchy diagram"
          className="flex flex-col gap-4"
        >
          {/* merge Flow→Team FINAL (user 2026-11-08): Team = CANVAS MURNI,
              run workflow tampil sebagai tree of delegation (root conductor
              lead, fase implisit). Kendali run = chat; assign/reassign = Task. */}
          <TeamTree
            projectId={project.id}
            rootSessionId={activeSessionId}
            rootPersonaId={live.parentPersonaId}
            rootState={live.parentState}
          />
        </section>
      )}
    </div>
  );
}
