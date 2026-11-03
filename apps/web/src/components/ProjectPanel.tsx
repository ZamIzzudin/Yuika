"use client";
import { useState } from "react";
import type { ProjectInfo } from "@yui/contracts";

/**
 * Panel Proyek (sidebar) — project = entitas first-class di atas workspace (D14).
 * Scope aktif menentukan tempat file & task sesi berada: null = workspace global.
 * v0 shell (P1-PRJ-6): pilih + buat; rename/archive menyusul.
 */
export function ProjectPanel({
  projects,
  activeId,
  onPick,
  onCreated,
}: {
  projects: ProjectInfo[];
  activeId: string | null;
  onPick: (id: string | null) => void;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setName("");
      setDesc("");
      setOpen(false);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="project-section" aria-label="Proyek">
      <div className="project-head">
        <span className="project-title">Proyek</span>
        <button className="project-add" onClick={() => setOpen((v) => !v)} aria-label="Proyek baru" disabled={open}>
          +
        </button>
      </div>

      {open && (
        <div className="project-form">
          <input
            autoFocus
            placeholder="Nama proyek"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <input
            placeholder="Deskripsi (opsional)"
            value={desc}
            maxLength={280}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          {err && <p className="project-err">{err}</p>}
          <div className="project-form-actions">
            <button className="btn secondary" onClick={() => setOpen(false)}>
              Batal
            </button>
            <button className="btn" onClick={create} disabled={!name.trim() || busy}>
              {busy ? "Menyimpan…" : "Buat"}
            </button>
          </div>
        </div>
      )}

      <div className="project-list">
        <button className="project-row" data-active={activeId === null ? "" : undefined} onClick={() => onPick(null)}>
          <i className="project-dot" />
          <span>
            <b>Workspace</b>
            <small>tanpa proyek — scope bebas</small>
          </span>
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            className="project-row"
            data-active={p.id === activeId ? "" : undefined}
            data-archived={p.status === "archived" ? "" : undefined}
            onClick={() => onPick(p.id)}
          >
            <i className="project-dot" />
            <span>
              <b>{p.name}</b>
              <small>{p.status === "archived" ? "arsip" : p.description || "proyek"}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
