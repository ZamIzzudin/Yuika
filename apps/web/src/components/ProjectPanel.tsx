"use client";
import { useState } from "react";
import { DeleteProjectResult, type ProjectInfo } from "@yui/contracts";
import { SkeletonRows } from "./Skeleton";

/**
 * Panel Proyek (sidebar) — project = entitas first-class di atas workspace (D14).
 * Scope aktif menentukan tempat file & task sesi berada: null = workspace global.
 * v0 (P1-PRJ-6): pilih + buat · P1-PRJ-8: hapus project + artefak terkait
 * (sesi, file, memory project) — skill persona & metering DIPERTAHANKAN.
 */
export function ProjectPanel({
  projects,
  booted = true,
  activeId,
  onPick,
  onCreated,
  onDeleted,
}: {
  projects: ProjectInfo[];
  /** false = masih fetch awal → tampil skeleton, bukan "0 proyek". */
  booted?: boolean;
  activeId: string | null;
  onPick: (id: string | null) => void;
  onCreated: () => void;
  /** Dipanggil setelah project terhapus (parent: refresh daftar & reset scope). */
  onDeleted: (projectId: string, result: DeleteProjectResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // P1-PRJ-8: konfirmasi dua langkah — klik 🗑 → baris konfirmasi merah → Hapus.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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

  async function remove(p: ProjectInfo) {
    if (deleting) return;
    setDeleting(p.id);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(p.id)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as DeleteProjectResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setConfirmId(null);
      setNote(
        `“${p.name}” dihapus — ${body.deleted.sessions} sesi, ${body.deleted.tasks} task, file & memory project dibersihkan. Skill persona & metering tetap tersimpan.`,
      );
      onDeleted(p.id, DeleteProjectResult.parse(body));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
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
        {!booted && <SkeletonRows rows={2} />}
        <button className="project-row" data-active={activeId === null ? "" : undefined} onClick={() => onPick(null)}>
          <i className="project-dot" />
          <span>
            <b>Workspace</b>
            <small>tanpa proyek — scope bebas</small>
          </span>
        </button>
        {projects.map((p) => (
          <div key={p.id} className="project-row-wrap">
            <button
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
            <button
              className="project-del"
              aria-label={`Hapus proyek ${p.name}`}
              title={`Hapus proyek ${p.name} + semua artefaknya`}
              disabled={deleting === p.id}
              onClick={() => setConfirmId(confirmId === p.id ? null : p.id)}
            >
              ✕
            </button>
            {confirmId === p.id && (
              <div className="project-del-confirm">
                <p>
                  Hapus <b>“{p.name}”</b> permanen? Sesi, task, file, memory project & audit ikut dibersihkan.
                  <br />
                  <small>Skill yang dipelajari persona & metering tetap tersimpan.</small>
                </p>
                <div className="project-form-actions">
                  <button className="btn secondary" onClick={() => setConfirmId(null)}>
                    Batal
                  </button>
                  <button className="btn danger" onClick={() => void remove(p)} disabled={deleting === p.id}>
                    {deleting === p.id ? "Menghapus…" : "Hapus permanen"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {note && <p className="project-note">{note}</p>}
        {err && !open && <p className="project-err">{err}</p>}
      </div>
    </section>
  );
}
