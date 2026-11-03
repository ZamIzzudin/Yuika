"use client";
import { useCallback, useEffect, useState } from "react";
import type { PersonaInfo, ProjectInfo, RosterEntry, TaskItem, TaskStatus } from "@yui/contracts";
import { PersonaFace } from "./PersonaPicker";

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
  personas,
  open,
  onClose,
  rev,
}: {
  project: ProjectInfo;
  personas: PersonaInfo[];
  open: boolean;
  onClose: () => void;
  rev: number;
}) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [title, setTitle] = useState("");
  const [pick, setPick] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        fetch(`/api/projects/${project.id}/tasks`),
        fetch(`/api/projects/${project.id}/roster`),
      ]);
      if (t.ok) setTasks(((await t.json()) as { tasks: TaskItem[] }).tasks);
      if (r.ok) setRoster(((await r.json()) as { roster: RosterEntry[] }).roster);
    } catch {
      /* drawer refresh berikutnya */
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
    void saveRoster([...roster, { personaId: persona.id, role: role.trim(), phases: [], mcp: [] }]);
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
          <b>Proyek</b>
          <small>
            {project.name} · {done}/{tasks.length} task selesai
          </small>
        </div>
        <button className="task-close" onClick={onClose} aria-label="Tutup panel proyek">
          ✕
        </button>
      </header>

      <section className="roster-section" aria-label="Roster proyek">
        <span className="project-title">Roster</span>
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
            <button className="btn" onClick={assign} disabled={!pick || !role.trim() || busy}>
              Assign
            </button>
          </div>
        )}
      </section>

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
