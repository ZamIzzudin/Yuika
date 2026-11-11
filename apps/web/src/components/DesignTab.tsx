"use client";
// P2-DSN-3: tab Design — canvas Penpot ter-embed (viewer share-link).
// File desain dibuat/diubah persona Designer lewat tools penpot_*; tab ini
// hanya MEMANTAU live (viewer menerima perubahan realtime via websocket).
import { useCallback, useEffect, useState } from "react";
import { ArrowsClockwise, ArrowSquareOut, FrameCorners } from "@phosphor-icons/react";
import { apiUrl, authFetch } from "@/lib/api";
import { Button, Chip, EmptyState, Select } from "./ui";

interface PenpotFileRow {
  fileId: string;
  name: string;
  revn: number;
  viewerUrl: string | null;
}

interface PenpotFilesResponse {
  configured: boolean;
  baseUrl: string;
  files: PenpotFileRow[];
}

export function DesignTab(): React.ReactElement {
  const [cfg, setCfg] = useState<PenpotFilesResponse | null>(null);
  const [sel, setSel] = useState<string>("");
  const [frameKey, setFrameKey] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl("/api/penpot/files"));
      if (r.ok) {
        const j = (await r.json()) as PenpotFilesResponse;
        setCfg(j);
        setSel((cur) => (j.files.some((f) => f.fileId === cur) ? cur : (j.files[0]?.fileId ?? "")));
      }
    } catch {
      /* host belum siap */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15_000); // file baru dari persona muncul sendiri
    return () => clearInterval(t);
  }, [refresh]);

  if (!cfg) return <EmptyState icon={<FrameCorners />} title="Loading design files…" />;

  if (!cfg.configured) {
    return (
      <EmptyState
        icon={<FrameCorners />}
        title="Penpot is not connected yet"
        hint={
          <>
            Set <code className="rounded bg-inset px-1">YUI_PENPOT_URL</code> (self-host origin, e.g.
            http://localhost:9001) and <code className="rounded bg-inset px-1">YUI_PENPOT_TOKEN</code>{" "}
            (personal access token from Penpot profile settings) on the host, then restart it. See{" "}
            <code className="rounded bg-inset px-1">deploy/penpot/</code> for the bundled stack.
          </>
        }
      />
    );
  }

  const file = cfg.files.find((f) => f.fileId === sel) ?? null;

  if (!file || !file.viewerUrl) {
    return (
      <EmptyState
        icon={<FrameCorners />}
        title="No design files yet"
        hint={
          <>
            Ask the Designer persona to create one (tool{" "}
            <code className="rounded bg-inset px-1">penpot_create_file</code>) or run{" "}
            <code className="rounded bg-inset px-1">penpot_setup_project</code> first. The share-link
            viewer appears here and updates live while the persona draws.
          </>
        }
        action={<Button onClick={() => void refresh()}><ArrowsClockwise size={13} aria-hidden /> Refresh</Button>}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Design file">
          {cfg.files.map((f) => (
            <option key={f.fileId} value={f.fileId}>
              {f.name} (rev {f.revn})
            </option>
          ))}
        </Select>
        <Chip tone="accent">live viewer</Chip>
        <span className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => setFrameKey((k) => k + 1)}>
          <ArrowsClockwise size={13} aria-hidden /> Reload
        </Button>
        <a href={file.viewerUrl} target="_blank" rel="noreferrer">
          <Button size="sm" variant="secondary">
            <ArrowSquareOut size={13} aria-hidden /> Open in Penpot
          </Button>
        </a>
      </div>
      {/* viewer share-link: tanpa X-Frame-Options (deploy override), updates realtime */}
      <iframe
        key={`${file.fileId}-${frameKey}`}
        src={file.viewerUrl}
        title={`Penpot design: ${file.name}`}
        className="min-h-0 w-full flex-1 rounded-xl border border-line bg-surface"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
