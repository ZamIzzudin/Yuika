"use client";

// P2-STU-4: tab Browser read-only — user membuka URL riset lewat proxy
// server-side (allowlist project + SSRF guard + sanitizer) dan melihat riwayat
// kunjungan agent. Render di iframe sandbox KOSONG (tanpa allow-scripts /
// allow-same-origin) — pertahanan terakhir setelah sanitizer server.
import { useCallback, useEffect, useState } from "react";
import { apiUrl, authFetch } from "@/lib/api";
import { Button } from "@/components/ui";

interface Visit {
  id: number;
  url: string;
  title: string | null;
  byRole: string;
  createdAt: number;
}

export function BrowserTab({ projectId }: { projectId: string }) {
  const [input, setInput] = useState("");
  const [page, setPage] = useState<{ url: string; title: string; html: string } | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadVisits = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl(`/api/projects/${projectId}/browser/visits`));
      const body = (await r.json()) as { visits?: Visit[] };
      setVisits(body.visits ?? []);
    } catch {
      /* best-effort */
    }
  }, [projectId]);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);

  const open = useCallback(
    async (rawUrl: string) => {
      const url = rawUrl.trim();
      if (!url) return;
      setLoading(true);
      setErr(null);
      try {
        const r = await authFetch(
          apiUrl(`/api/projects/${projectId}/browser/fetch?url=${encodeURIComponent(url)}`),
        );
        const body = (await r.json()) as { url?: string; title?: string; html?: string; error?: string };
        if (!r.ok || !body.html) {
          setErr(body.error ?? `Failed to open page (${r.status})`);
          setPage(null);
        } else {
          setPage({ url: body.url ?? url, title: body.title ?? url, html: body.html });
          void loadVisits();
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to open page");
      } finally {
        setLoading(false);
      }
    },
    [projectId, loadVisits],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      <form
        className="flex flex-none gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void open(input);
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-pill border border-line bg-surface px-4 py-2 text-body text-primary outline-none focus:border-line-strong"
          placeholder="https://example.com/page"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Browser URL"
          inputMode="url"
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          {loading ? "Opening…" : "Open"}
        </Button>
      </form>

      {err && (
        <p className="flex-none rounded-lg2 border border-line bg-surface px-3 py-2 text-caption text-rose-400" role="alert">
          {err}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[220px_1fr]">
        <aside className="flex min-h-0 flex-col overflow-y-auto rounded-lg2 border border-line bg-surface p-2">
          <h3 className="px-2 pb-1 text-caption font-semibold uppercase tracking-wide text-dim">History</h3>
          {visits.length === 0 ? (
            <p className="px-2 text-caption text-muted">No visits yet. Open a URL or let an agent research.</p>
          ) : (
            visits.map((v) => (
              <button
                key={v.id}
                className="flex w-full flex-col gap-0.5 rounded-pill px-2 py-1.5 text-left transition-colors hover:bg-hover"
                onClick={() => {
                  setInput(v.url);
                  void open(v.url);
                }}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`rounded-pill px-1.5 text-[10px] font-semibold uppercase ${
                      v.byRole === "agent" ? "bg-accent/20 text-accent" : "bg-emph/10 text-secondary"
                    }`}
                  >
                    {v.byRole}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-caption text-secondary">{v.title ?? v.url}</span>
                </span>
                <span className="truncate text-[11px] text-muted">{v.url}</span>
              </button>
            ))
          )}
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg2 border border-line bg-surface">
          {!page ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-caption text-muted">
              Open an allowlisted URL to read it here. Scripts are stripped — this view is read-only.
            </div>
          ) : (
            <>
              <header className="flex flex-none items-center gap-2 border-b border-line px-3 py-2">
                <b className="min-w-0 flex-1 truncate text-body text-primary">{page.title}</b>
                <a
                  className="shrink-0 text-caption text-accent underline-offset-2 hover:underline"
                  href={page.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {new URL(page.url).hostname}
                </a>
              </header>
              <iframe
                title={page.title}
                sandbox=""
                className="min-h-0 flex-1 bg-white"
                srcDoc={page.html}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
