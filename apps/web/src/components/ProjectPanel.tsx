"use client";
// Panel Proyek (sidebar) — Batch 16: HANYA daftar + hapus. Membuat project
// pindah ke halaman HOME (kartu "New project" + form modal); workspace/
// freespace dihapus total — semua sesi hidup di dalam project.
// v0 (P1-PRJ-6): pilih · P1-PRJ-8: hapus project + artefak terkait
// (sesi, file, memory project) — skill persona & metering DIPERTAHANKAN.
import { useState } from "react";
import { DeleteProjectResult, type ProjectInfo } from "@yuika/contracts";
import { Trash } from "@phosphor-icons/react";
import { SkeletonRows } from "./Skeleton";
import { ConfirmDialog } from "./ui";
import { toastErr, toastOk } from "./ui/toast";
import { apiUrl, authFetch } from "@/lib/api";

export function ProjectPanel({
  projects,
  booted = true,
  activeId,
  onPick,
  onDeleted,
}: {
  projects: ProjectInfo[];
  /** false = masih fetch awal → tampil skeleton, bukan "0 proyek". */
  booted?: boolean;
  activeId: string | null;
  onPick: (id: string) => void;
  /** Dipanggil setelah project terhapus (parent: refresh daftar & reset scope). */
  onDeleted: (projectId: string, result: DeleteProjectResult) => void;
}) {
  const [confirmP, setConfirmP] = useState<ProjectInfo | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(p: ProjectInfo) {
    if (deleting) return;
    setDeleting(p.id);
    try {
      const res = await authFetch(
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

  return (
    <section aria-label="project" className="flex flex-col gap-1.5">
      <div className="flex items-center px-2.5">
        <span className="text-caption font-semibold tracking-wide text-dim uppercase">
          Project
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {!booted && <SkeletonRows rows={3} />}
        {booted && projects.length === 0 && (
          <p className="px-2.5 text-caption text-dim">
            No projects yet — create one from the home screen.
          </p>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
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
        ))}
      </div>

      {/* Popup konfirmasi delete project */}
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
