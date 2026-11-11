"use client";
// P3-CANVAS: tab Design — editor canvas embedded (bukan iframe eksternal).
// File desain = JSON host; dibuat oleh persona (tools design_*) atau user
// (tombol New); keduanya melihat perubahan satu sama lain (polling).
import { useCallback, useEffect, useState } from "react";
import { FrameCorners, Play, Plus } from "@phosphor-icons/react";
import { apiUrl, authFetch } from "@/lib/api";
import { Button, EmptyState, Select } from "./ui";
import { DesignCanvas } from "./DesignCanvas";
import { DesignPrototype } from "./DesignPrototype";

interface DesignRow {
  id: string;
  name: string;
  revn: number;
  updatedAt: number;
  pages: number;
}

export function DesignTab(): React.ReactElement {
  const [files, setFiles] = useState<DesignRow[] | null>(null);
  const [sel, setSel] = useState("");
  const [playing, setPlaying] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl("/api/design/files"));
      if (r.ok) {
        const j = (await r.json()) as { files: DesignRow[] };
        setFiles(j.files);
        setSel((cur) => (j.files.some((f) => f.id === cur) ? cur : (j.files[0]?.id ?? "")));
      }
    } catch {
      /* host belum siap */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  const create = async () => {
    const name = window.prompt("Design file name", "Untitled design");
    if (!name) return;
    const r = await authFetch(apiUrl("/api/design/files"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      const j = (await r.json()) as { id: string };
      await refresh();
      setSel(j.id);
    }
  };

  if (!files) return <EmptyState icon={<FrameCorners />} title="Loading design files…" />;

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<FrameCorners />}
        title="No design files yet"
        hint="Ask the designer persona to design a screen (it draws via design_* tools), or start one yourself."
        action={
          <Button variant="primary" onClick={() => void create()}>
            <Plus size={15} /> New design file
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Design file" className="max-w-56">
          {files.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
        <Button variant="ghost" className="!px-2 !py-1" title="New design file" onClick={() => void create()}>
          <Plus size={15} />
        </Button>
        <Button
          variant="primary"
          className="!px-2.5 !py-1"
          title="Try this design as a live prototype"
          onClick={() => setPlaying(true)}
        >
          <Play size={14} weight="fill" /> Try it
        </Button>
        <span className="ml-auto text-xs text-dim">revn {files.find((f) => f.id === sel)?.revn ?? 0}</span>
      </div>
      {sel ? (
        <div className="min-h-0 flex-1">
          <DesignCanvas key={sel} fileId={sel} />
        </div>
      ) : null}
      {playing && sel ? <DesignPrototype fileId={sel} onClose={() => setPlaying(false)} /> : null}
    </div>
  );
}
