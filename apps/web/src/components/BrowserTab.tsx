"use client";

// P2-STU-4 + Batch 14a (SCR-3): tab Browser dua mode —
//   Reader: URL riset via proxy server-side (sanitized, read-only) — fallback
//   Live:   shared screen persona (screencast + input dua arah, lease)
import { useCallback, useEffect, useState } from "react";
import { apiUrl, authFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { ScreenLive } from "./ScreenLive";

interface Visit {
  id: number;
  url: string;
  title: string | null;
  byRole: string;
  createdAt: number;
}

interface Policy {
  allow: string[];
  allowAll: boolean;
}

export function BrowserTab({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<"reader" | "live">("reader");
  const [personas, setPersonas] = useState<{ id: string; name: string }[]>([]);
  const [input, setInput] = useState("");
  const [page, setPage] = useState<{ url: string; title: string; html: string } | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  // Policy URL per-project (user 2026-11): allowAll = buka semua domain —
  // SSRF guard (IP private/loopback) tetap jalan di sisi server.
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [policyBusy, setPolicyBusy] = useState(false);

  const loadPolicy = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl(`/api/projects/${projectId}/browser/policy`));
      if (r.ok) setPolicy((await r.json()) as Policy);
    } catch {
      /* best-effort */
    }
  }, [projectId]);

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
    void loadPolicy();
  }, [loadVisits, loadPolicy]);

  // Batch 14a (SCR-3): mode Live butuh daftar persona (pemilik sesi screen).
  useEffect(() => {
    if (mode !== "live") return;
    void (async () => {
      try {
        const r = await authFetch(apiUrl("/api/personas"));
        if (!r.ok) return;
        const d = (await r.json()) as { personas?: { id: string; name: string; hidden?: boolean }[] };
        setPersonas((d.personas ?? []).filter((p) => !p.hidden).map((p) => ({ id: p.id, name: p.name })));
      } catch {
        /* best-effort */
      }
    })();
  }, [mode]);

  const toggleAllowAll = useCallback(async () => {
    if (!policy || policyBusy) return;
    setPolicyBusy(true);
    const next = !policy.allowAll;
    setPolicy({ ...policy, allowAll: next }); // optimistic
    try {
      const r = await authFetch(apiUrl(`/api/projects/${projectId}/browser/policy`), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowAll: next }),
      });
      if (r.ok) setPolicy((await r.json()) as Policy);
      else setPolicy((await r.json().catch(() => policy)) as Policy);
    } catch {
      setPolicy(policy); // revert
    } finally {
      setPolicyBusy(false);
    }
  }, [policy, policyBusy, projectId]);

  const open = useCallback(
    async (rawUrl: string) => {
      const url = rawUrl.trim();
      if (!url) return;
      setLoading(true);
      setErr(null);
      setDenied(null);
      try {
        const r = await authFetch(
          apiUrl(`/api/projects/${projectId}/browser/fetch?url=${encodeURIComponent(url)}`),
        );
        const body = (await r.json()) as { url?: string; title?: string; html?: string; error?: string; code?: string };
        if (!r.ok || !body.html) {
          setErr(body.error ?? `Failed to open page (${r.status})`);
          setDenied(body.code === "host_denied" ? url : null);
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
      {/* SCR-3: selector mode Reader (statis) | Live (shared screen) */}
      <div className="flex flex-none items-center gap-1" role="tablist" aria-label="Browser mode">
        {(["reader", "live"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-pill border px-3 py-1.5 text-caption capitalize transition-colors ${
              mode === m ? "border-accent/60 bg-accent/10 text-accent" : "border-line bg-surface text-muted hover:text-primary"
            }`}
          >
            {m === "reader" ? "Reader" : "Live screens"}
          </button>
        ))}
      </div>
      {mode === "live" ? (
        <ScreenLive projectId={projectId} personas={personas} />
      ) : (
      <>
      <form
        className="flex flex-none flex-wrap items-center gap-2"
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
        <label
          className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-pill border px-3 py-2 text-caption select-none transition-colors ${
            policy?.allowAll
              ? "border-accent/50 bg-accent/10 text-accent"
              : "border-line bg-surface text-muted hover:text-primary"
          }`}
          title="When on, every public domain can be opened without adding it to the allowlist. Private/loopback hosts stay blocked (SSRF guard)."
        >
          <input
            type="checkbox"
            className="accent-current"
            checked={policy?.allowAll ?? false}
            disabled={!policy || policyBusy}
            onChange={() => void toggleAllowAll()}
          />
          Allow all domains
        </label>
      </form>

      {err && (
        <p className="flex flex-none flex-wrap items-center gap-2 rounded-lg2 border border-line bg-surface px-3 py-2 text-caption text-rose-400" role="alert">
          <span className="min-w-0 flex-1">{err}</span>
          {denied && policy && !policy.allowAll && (
            <Button size="sm" onClick={() => void toggleAllowAll()} disabled={policyBusy}>
              Allow all domains
            </Button>
          )}
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
              {policy?.allowAll
                ? "Any public URL can be opened here. Scripts are stripped — this view is read-only."
                : "Open an allowlisted URL to read it here, or turn on \"Allow all domains\". Scripts are stripped — this view is read-only."}
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
      </>
      )}
    </div>
  );
}
