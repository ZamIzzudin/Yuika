"use client";
import { useCallback, useEffect, useState } from "react";
import type { ProjectInfo, TaskItem, TaskStatus } from "@yui/contracts";

/** Status cycle: klik chip = maju satu langkah. */
const NEXT: Record<TaskStatus, TaskStatus> = { todo: "doing", doing: "review", review: "done", done: "todo" };
const LABEL: Record<TaskStatus, string> = { todo: "Belum", doing: "Kerja", review: "Reviu", done: "Selesai" };

/**
 * Drawer tasklist project (P1-PRJ-4 UI). Data via REST /api/projects/:id/tasks;
 * `rev` naik tiap kali agent memanggil tool todo_* → auto-refresh (monitoring gratis
 * dari event stream). Tambah task manual + cycle status via PATCH.
 */
export function TaskDrawer({
  project,
  open,
  onClose,
  rev,
}: {
  project: ProjectInfo;
  open: boolean;
  onClose: () => void;
  rev: number;
}) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${project.id}/tasks`);
      if (!r.ok) return;
      setTasks(((await r.json()) as { tasks: TaskItem[] }).tasks);
    } catch {
      /* drawer refresh berikutnya */
    }
  }, [project.id]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, rev, refresh]);

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

  return (
    <aside className="task-drawer" aria-label={`Tasklist ${project.name}`}>
      <header className="task-drawer-head">
        <div>
          <b>Tasklist</b>
          <small>
            {project.name} · {done}/{tasks.length} selesai
          </small>
        </div>
        <button className="task-close" onClick={onClose} aria-label="Tutup tasklist">
          ✕
        </button>
      </header>

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
    </aside>
  );
}
