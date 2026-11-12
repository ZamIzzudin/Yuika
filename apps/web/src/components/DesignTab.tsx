"use client";
// P3-CANVAS: tab Design — editor canvas embedded (bukan iframe eksternal).
// File desain = JSON host; dibuat oleh persona (tools design_*) atau user
// (tombol New); keduanya melihat perubahan satu sama lain (polling).
// D91: file DIIKAT PER-PROJECT (list ?project=, create projectId=).
// D92: pemilih file = dropdown custom (bukan <select> bawaan browser) +
// form nama desain = modal proper (bukan window.prompt).
import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDown, FrameCorners, Play, Plus, X } from "@phosphor-icons/react";
import { apiUrl, authFetch } from "@/lib/api";
import { Button, EmptyState } from "./ui";
import { DesignCanvas } from "./DesignCanvas";
import type { DesignRefPayload } from "@/lib/designRef";
import { DesignPrototype } from "./DesignPrototype";

interface DesignRow {
  id: string;
  name: string;
  projectId: string | null;
  revn: number;
  updatedAt: number;
  pages: number;
}

/** D92 (#7): dropdown file custom — list + New design… (bukan <select>). */
function FileMenu({
  files,
  sel,
  onPick,
  onNew,
}: {
  files: DesignRow[];
  sel: string;
  onPick: (id: string) => void;
  onNew: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const cur = files.find((f) => f.id === sel);
  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        className="!max-w-56 !px-2 !py-1"
        title="Switch design file"
        onClick={() => setOpen((o) => !o)}
      >
        <FrameCorners size={14} />
        <span className="max-w-36 truncate text-[13px]">
          {cur?.name ?? "Select file"}
        </span>
        <CaretDown size={11} className="text-dim" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-80 overflow-hidden rounded-lg2 border border-line bg-surface shadow-2xl">
          <div className="max-h-72 overflow-y-auto p-1">
            {files.map((f) => (
              <button
                key={f.id}
                className={`flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-[13px] ${
                  f.id === sel
                    ? "bg-accent/25 text-fg"
                    : "text-fg/85 hover:bg-inset"
                }`}
                onClick={() => {
                  onPick(f.id);
                  setOpen(false);
                }}
                title={f.name}
              >
                <FrameCorners
                  size={13}
                  className={f.id === sel ? "text-accent" : "text-dim"}
                />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-[11px] text-dim">
                  {f.pages} page{f.pages === 1 ? "" : "s"}
                  {f.projectId ? "" : " · no project"}
                </span>
              </button>
            ))}
          </div>
          <button
            className="flex w-full cursor-pointer items-center gap-2 border-t border-line px-3 py-2.5 text-left text-[13px] text-accent hover:bg-inset"
            onClick={() => {
              setOpen(false);
              onNew();
            }}
          >
            <Plus size={13} /> New design…
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** D92 (#8): modal input nama (menggantikan window.prompt). */
function NameModal({
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}): React.ReactElement {
  const [v, setV] = useState("Untitled design");
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-lg2 border border-line bg-surface p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-fg">New design file</span>
          <button
            className="cursor-pointer text-dim hover:text-fg"
            onClick={onCancel}
            title="Cancel"
          >
            <X size={15} />
          </button>
        </div>
        <label
          className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-dim"
          htmlFor="yui-design-name"
        >
          Name
        </label>
        <input
          id="yui-design-name"
          autoFocus
          className="w-full rounded border border-line bg-inset px-2.5 py-2 text-[13px]"
          value={v}
          disabled={busy}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && v.trim()) onSubmit(v.trim());
            else if (e.key === "Escape") onCancel();
            e.stopPropagation();
          }}
        />
        {error ? (
          <div className="mt-2 text-[12px] text-danger">{error}</div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!v.trim() || busy}
            onClick={() => onSubmit(v.trim())}
          >
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DesignTab({
  projectId,
  onAttachToChat,
}: {
  projectId: string;
  /** D93: canvas klik kanan → attach komponen ke composer chat. */
  onAttachToChat?: (refs: DesignRefPayload[]) => void;
}): React.ReactElement {
  const [files, setFiles] = useState<DesignRow[] | null>(null);
  const [sel, setSel] = useState("");
  const [playing, setPlaying] = useState(false);
  const [modal, setModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await authFetch(
        apiUrl(`/api/design/files?project=${projectId}`),
      );
      if (r.ok) {
        const j = (await r.json()) as { files: DesignRow[] };
        setFiles(j.files);
        setSel((cur) =>
          j.files.some((f) => f.id === cur) ? cur : (j.files[0]?.id ?? ""),
        );
      }
    } catch {
      /* host belum siap */
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  const create = async (name: string) => {
    setCreating(true);
    setCreateErr("");
    try {
      const r = await authFetch(apiUrl("/api/design/files"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, projectId }),
      });
      if (!r.ok) {
        setCreateErr(
          ((await r.json()) as { error?: string }).error ??
            "failed to create design",
        );
        return;
      }
      const j = (await r.json()) as { id: string };
      setModal(false);
      await refresh();
      setSel(j.id);
    } catch {
      setCreateErr("host unreachable, try again");
    } finally {
      setCreating(false);
    }
  };

  const tryIt = (
    <Button
      variant="primary"
      className="!px-2.5 !py-1"
      title="Try this design as a live prototype"
      onClick={() => setPlaying(true)}
    >
      <Play size={14} weight="fill" /> Try it
    </Button>
  );

  if (!files)
    return <EmptyState icon={<FrameCorners />} title="Loading design files…" />;

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<FrameCorners />}
        title="No design files in this project yet"
        hint="Ask the designer persona to design a screen (it draws via design_* tools), or start one yourself. Files created here belong to this project."
        action={
          <Button variant="primary" onClick={() => setModal(true)}>
            <Plus size={15} /> New design file
          </Button>
        }
      />
    );
  }

  const current = files.find((f) => f.id === sel);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {sel ? (
        <div className="min-h-0 flex-1">
          <DesignCanvas
            key={sel}
            fileId={sel}
            projectId={projectId}
            onAttachToChat={onAttachToChat}
            headerRight={
              <>
                <FileMenu
                  files={files}
                  sel={sel}
                  onPick={(id) => setSel(id)}
                  onNew={() => {
                    setCreateErr("");
                    setModal(true);
                  }}
                />
                {tryIt}
              </>
            }
          />
        </div>
      ) : null}
      {playing && sel ? (
        <DesignPrototype fileId={sel} onClose={() => setPlaying(false)} />
      ) : null}
      {modal ? (
        <NameModal
          busy={creating}
          error={createErr}
          onCancel={() => setModal(false)}
          onSubmit={(n) => void create(n)}
        />
      ) : null}
      <span className="sr-only">revn {current?.revn ?? 0}</span>
    </div>
  );
}
