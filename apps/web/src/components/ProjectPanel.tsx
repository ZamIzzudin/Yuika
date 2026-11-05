"use client";
import { apiUrl, authFetch } from "@/lib/api";
import { useState } from "react";
import { DeleteProjectResult, type ProjectInfo } from "@yuika/contracts";
import { Plus, Trash } from "@phosphor-icons/react";
import { SkeletonRows } from "./Skeleton";
import { Button, Card, ConfirmDialog, Field, TextInput } from "./ui";
import { toastErr, toastOk } from "./ui/toast";

/**
 * Panel Proyek (sidebar) — project = entitas first-class di atas workspace (D14).
 * Scope aktif menentukan tempat file & task sesi berada: null = workspace global.
 * v0 (P1-PRJ-6): pilih + buat · P1-PRJ-8: hapus project + artefak terkait
 * (sesi, file, memory project) — skill persona & metering DIPERTAHANKAN.
 * DS-1: ui/* + Tailwind semantik (docs/DESIGN-SYSTEM.md).
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
  // P1-PRJ-8: konfirmasi dua langkah — klik 🗑 → popup konfirmasi → Delete.
  const [confirmP, setConfirmP] = useState<ProjectInfo | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await authFetch(apiUrl("/api/projects"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
      });
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`,
        );
      setName("");
      setDesc("");
      setOpen(false);
      onCreated();
    } catch (e) {
      toastErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: ProjectInfo) {
    if (deleting) return;
    setDeleting(p.id);
    try {
      const res = await fetch(
        apiUrl(`/api/projects/${encodeURIComponent(p.id)}`),
        {
          method: "DELETE",
        },
      );
      const body = (await res
        .json()
        .catch(() => ({}))) as DeleteProjectResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setConfirmP(null);
      toastOk(
        `“${p.name}” deleted — ${body.deleted.sessions} sessions, ${body.deleted.tasks} tasks cleaned up. Persona skills & metering are kept.`,
      );
      onDeleted(p.id, DeleteProjectResult.parse(body));
    } catch (e) {
      toastErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  }

  const rowBase =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-md2 border px-2.5 py-2 text-left transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)]";

  return (
    <section aria-label="project" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-2.5">
        <span className="text-caption font-semibold tracking-wide text-dim uppercase">
          Project
        </span>
        <button
          className="flex cursor-pointer items-center justify-center rounded-md2 border border-transparent p-1 text-dim transition-colors hover:bg-hover hover:text-primary disabled:cursor-default disabled:opacity-40"
          onClick={() => setOpen((v) => !v)}
          aria-label="New project"
          disabled={open}
        >
          <Plus size={13} weight="bold" aria-hidden />
        </button>
      </div>

      {open && (
        <Card variant="inset" className="flex flex-col gap-2.5 p-3">
          <Field label="Name">
            <TextInput
              autoFocus
              placeholder="Project Name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
          </Field>
          <Field label="Description">
            <TextInput
              placeholder="Description (optional)"
              value={desc}
              maxLength={280}
              onChange={(e) => setDesc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={create}
              disabled={!name.trim() || busy}
            >
              {busy ? "Creating…" : "Create"}
            </Button>
          </div>
        </Card>
      )}
      <div className="flex flex-col gap-3">
        <button
          className={`${rowBase} ${
            activeId === null
              ? "border-line bg-hover text-primary"
              : "border-transparent text-secondary hover:bg-hover hover:text-primary"
          }`}
          onClick={() => onPick(null)}
        >
          <i
            className={`h-[7px] w-[7px] shrink-0 rounded-pill ${activeId ? "bg-line-strong" : "bg-accent"}`}
            aria-hidden
          />
          <span className="flex min-w-0 flex-col">
            <b className="text-body font-semibold">Workspace</b>
            <small className="text-caption text-dim">Freespace</small>
          </span>
        </button>
        {!booted && <SkeletonRows rows={3} />}
        {projects.map((p) => (
          <div key={p.id} className="flex flex-col gap-0.5">
            {/* SATU kartu: border/bg/hover di wadah — tombol select & trash di
                dalamnya transparan (fix 2026-11: dulu tombol trash punya kotaknya
                sendiri → saat selected/hover terlihat seperti dua karta berbeda). */}
            <div
              className={`group flex items-stretch rounded-md2 border transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
                p.id === activeId
                  ? "border-line bg-hover"
                  : "border-transparent hover:border-line hover:bg-hover"
              } ${p.status === "archived" ? "opacity-60" : ""}`}
            >
              <button
                className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md2 px-2.5 py-2 text-left ${
                  p.id === activeId ? "text-primary" : "text-secondary hover:text-primary"
                }`}
                onClick={() => onPick(p.id)}
              >
                <i
                  className={`h-[7px] w-[7px] shrink-0 rounded-pill ${p.id === activeId ? "bg-accent" : "bg-line-strong"}`}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col">
                  <b className="truncate text-body font-semibold">{p.name}</b>
                  <small className="truncate text-caption text-dim">
                    {p.status === "archived"
                      ? "archived"
                      : p.description || "project"}
                  </small>
                </span>
              </button>
              <button
                className="my-auto mr-1 flex shrink-0 cursor-pointer items-center justify-center rounded-md2 p-1.5 text-dim opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 hover:text-danger focus-visible:text-danger"
                aria-label={`Delete project ${p.name}`}
                title={`Delete project ${p.name} and all its artifacts`}
                disabled={deleting === p.id}
                onClick={() => setConfirmP(p)}
              >
                <Trash size={13} aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Popup konfirmasi delete project (menggantikan baris merah inline) */}
      <ConfirmDialog
        open={confirmP !== null}
        title="Delete project"
        message={
          confirmP && (
            <>
              Permanently delete <b>“{confirmP.name}”</b>? Sessions, tasks,
              files, project memory &amp; its audit trail will be removed.
              <br />
              <small className="text-dim">
                Skills learned by personas &amp; metering are kept.
              </small>
            </>
          )
        }
        confirmLabel="Delete permanently"
        busy={confirmP !== null && deleting === confirmP.id}
        onConfirm={() => confirmP && void remove(confirmP)}
        onClose={() => setConfirmP(null)}
      />
    </section>
  );
}
