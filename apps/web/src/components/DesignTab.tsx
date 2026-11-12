"use client";
// P3-CANVAS: tab Design — editor canvas embedded (bukan iframe eksternal).
// File desain = JSON host; dibuat oleh persona (tools design_*) atau user
// (tombol New); keduanya melihat perubahan satu sama lain (polling).
// D91: file DIIKAT PER-PROJECT (list ?project=, create projectId=); pemilih
// file + Try it pindah ke toolbar canvas (ujung kanan, sebelah chip Saved).
import { useCallback, useEffect, useState } from "react";
import { FrameCorners, Play, Plus } from "@phosphor-icons/react";
import { apiUrl, authFetch } from "@/lib/api";
import { Button, EmptyState, Select } from "./ui";
import { DesignCanvas } from "./DesignCanvas";
import { DesignPrototype } from "./DesignPrototype";

interface DesignRow {
  id: string;
  name: string;
  projectId: string | null;
  revn: number;
  updatedAt: number;
  pages: number;
}

export function DesignTab({ projectId }: { projectId: string }): React.ReactElement {
  const [files, setFiles] = useState<DesignRow[] | null>(null);
  const [sel, setSel] = useState("");
  const [playing, setPlaying] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl(`/api/design/files?project=${projectId}`));
      if (r.ok) {
        const j = (await r.json()) as { files: DesignRow[] };
        setFiles(j.files);
        setSel((cur) => (j.files.some((f) => f.id === cur) ? cur : (j.files[0]?.id ?? "")));
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

  const create = async () => {
    const name = window.prompt("Design file name", "Untitled design");
    if (!name) return;
    const r = await authFetch(apiUrl("/api/design/files"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, projectId }),
    });
    if (r.ok) {
      const j = (await r.json()) as { id: string };
      await refresh();
      setSel(j.id);
    }
  };

  const tryIt = (
    <Button variant="primary" className="!px-2.5 !py-1" title="Try this design as a live prototype" onClick={() => setPlaying(true)}>
      <Play size={14} weight="fill" /> Try it
    </Button>
  );

  if (!files) return <EmptyState icon={<FrameCorners />} title="Loading design files…" />;

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<FrameCorners />}
        title="No design files in this project yet"
        hint="Ask the designer persona to design a screen (it draws via design_* tools), or start one yourself. Files created here belong to this project."
        action={
          <Button variant="primary" onClick={() => void create()}>
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
            headerRight={
              <>
                <Select
                  value={sel}
                  onChange={(e) => setSel(e.target.value)}
                  aria-label="Design file"
                  className="max-w-52"
                >
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.projectId ? "" : " (no project)"}
                    </option>
                  ))}
                </Select>
                <Button variant="ghost" className="!px-2 !py-1" title="New design file" onClick={() => void create()}>
                  <Plus size={15} />
                </Button>
                {tryIt}
              </>
            }
          />
        </div>
      ) : null}
      {playing && sel ? <DesignPrototype fileId={sel} onClose={() => setPlaying(false)} /> : null}
      <span className="sr-only">revn {current?.revn ?? 0}</span>
    </div>
  );
}
