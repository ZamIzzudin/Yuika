"use client";
import { apiUrl, authFetch } from "@/lib/api";
// Panel MCP (P1-MCP-3 + P1-MCP-1): trust gate workspace + status koneksi live
// + audit tail + KATALOG server (install → mcp.json, uninstall). Fail-closed:
// install TIDAK menghubungkan, user harus Trust dulu (toggle di atas).
// DS-1: ui/* + Tailwind + Phosphor (docs/DESIGN-SYSTEM.md).
import { useCallback, useEffect, useState } from "react";
import type {
  McpAuditEntry,
  McpCatalogEntry,
  McpServerStatus,
} from "@yuika/contracts";
import {
  ArrowsClockwise,
  ArrowClockwise,
  Check,
  Warning,
  X,
} from "@phosphor-icons/react";
import { SkeletonRows } from "./Skeleton";
import {
  Button,
  Chip,
  ConfirmDialog,
  Dot,
  SectionTitle,
  TextInput,
} from "./ui";
import { toastErr, toastOk } from "./ui/toast";

const RISK_LABEL: Record<
  string,
  { label: string; tone: "ok" | "warn" | "danger" }
> = {
  rendah: { label: "safe", tone: "ok" },
  sedang: { label: "caution", tone: "warn" },
  tinggi: { label: "account access", tone: "danger" },
};

export function McpPanel() {
  const [servers, setServers] = useState<McpServerStatus[]>([]);
  const [audit, setAudit] = useState<McpAuditEntry[]>([]);
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [openForm, setOpenForm] = useState<string | null>(null); // id katalog dengan form env terbuka
  const [envVals, setEnvVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [uvx, setUvx] = useState<string | null | "loading">("loading");
  const [uvConfirm, setUvConfirm] = useState(false);
  // Popup konfirmasi uninstall server (dulu: langsung hapus dari mcp.json).
  const [confirmUn, setConfirmUn] = useState<McpCatalogEntry | null>(null);
  const [uvInstalling, setUvInstalling] = useState(false);
  const [uvLog, setUvLog] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, a, c, rt] = await Promise.all([
        authFetch(apiUrl("/api/mcp/servers")),
        authFetch(apiUrl("/api/mcp/audit?limit=5")),
        authFetch(apiUrl("/api/mcp/catalog")),
        authFetch(apiUrl("/api/mcp/runtime")),
      ]);
      if (s.ok)
        setServers(
          ((await s.json()) as { servers: McpServerStatus[] }).servers,
        );
      if (a.ok)
        setAudit(((await a.json()) as { entries: McpAuditEntry[] }).entries);
      if (c.ok)
        setCatalog(
          ((await c.json()) as { catalog: McpCatalogEntry[] }).catalog,
        );
      if (rt.ok)
        setUvx(
          ((await rt.json()) as { uvxPath: string | null }).uvxPath ?? null,
        );
    } catch {
      /* refresh berikutnya */
    }
  }, []);

  useEffect(() => {
    void refresh();
    // P1-MCP-6: daftar tool server bisa berubah kapan pun (notifikasi
    // tools/list_changed di core), poll ringan agar panel selalu segar.
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  /** One-click install uv (installer resmi astral.sh), konfirmasi eksplisit UI. */
  async function installUv() {
    setUvInstalling(true);
    setUvLog(null);
    try {
      const res = await authFetch(apiUrl("/api/mcp/runtime"), {
        method: "POST",
      });
      const j = (await res.json()) as {
        ok: boolean;
        uvxPath: string | null;
        log: string;
      };
      if (j.ok) {
        setUvx(j.uvxPath ?? "uvx");
        toastOk("uv installed, Python/uvx servers are ready to use.");
      } else {
        toastErr(
          "installer finished but uvx was not detected, try restarting the dev server",
        );
        setUvLog(j.log || null);
      }
      setUvConfirm(false);
    } catch {
      toastErr("failed to run the installer");
    } finally {
      setUvInstalling(false);
    }
  }

  async function toggle(s: McpServerStatus) {
    setBusy(s.name);
    try {
      const res = await authFetch(apiUrl("/api/mcp/servers"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          server: s.name,
          trusted: !s.trusted,
          denyTools: s.denyTools,
        }),
      });
      if (!res.ok)
        toastErr(
          ((await res.json()) as { error?: string }).error ?? "request failed",
        );
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  /** P0-MCP-1: coba hubungkan ulang server parked/reconnecting sekarang. */
  async function retry(name: string) {
    setBusy(name);
    try {
      const res = await authFetch(apiUrl("/api/mcp/servers"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ server: name }),
      });
      if (!res.ok)
        toastErr(
          ((await res.json()) as { error?: string }).error ??
            "reconnect failed",
        );
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function install(c: McpCatalogEntry) {
    setBusy(c.id);
    try {
      const res = await authFetch(apiUrl("/api/mcp/install"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ catalogId: c.id, env: envVals }),
      });
      if (!res.ok)
        toastErr(
          ((await res.json()) as { error?: string }).error ?? "request failed",
        );
      else {
        setOpenForm(null);
        setEnvVals({});
        toastOk(`${c.name} added to mcp.json, Trust it to connect.`);
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function uninstall(c: McpCatalogEntry) {
    setBusy(c.id);
    try {
      const res = await authFetch(
        apiUrl(`/api/mcp/install?name=${encodeURIComponent(c.id)}`),
        { method: "DELETE" },
      );
      if (!res.ok)
        toastErr(
          ((await res.json()) as { error?: string }).error ?? "request failed",
        );
      else toastOk(`${c.name} removed from mcp.json.`);
      setConfirmUn(null);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const declared = new Set(
    servers.filter((s) => s.declared).map((s) => s.name),
  );
  const booting = servers.length === 0 && catalog.length === 0;
  const q = query.trim().toLowerCase();
  const shown = catalog
    .filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.includes(q),
    )
    // D39: server yang sudah ter-install selalu di urutan paling awal.
    .sort((a, b) => Number(declared.has(b.id)) - Number(declared.has(a.id)));

  const rowBtn = "h-7 shrink-0 whitespace-nowrap px-2.5 text-caption";

  return (
    <section aria-label="MCP servers" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <SectionTitle>MCP</SectionTitle>
        <Button
          size="sm"
          onClick={() => void refresh()}
          aria-label="Refresh MCP"
          title="Reload MCP status"
        >
          <ArrowsClockwise size={12} aria-hidden />
        </Button>
      </div>
      {booting ? (
        <SkeletonRows rows={3} />
      ) : (
        <>
          {servers.length === 0 && (
            <p className="text-caption leading-5 text-dim">
              No MCP servers declared, install one from the catalog below.
            </p>
          )}
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {servers.map((s) => (
              <li
                key={s.name}
                className={`flex flex-col gap-2 rounded-lg2 border px-3 py-2.5 ${s.trusted ? "border-accent/30 bg-accent-soft/30" : "border-line bg-surface"}`}
              >
                <div className="flex items-center gap-2">
                  <Dot
                    tone={
                      s.connected
                        ? "ok"
                        : s.state === "parked"
                          ? "danger"
                          : s.trusted
                            ? "accent"
                            : "muted"
                    }
                    pulse={
                      !s.connected && (s.state === "reconnecting" || s.trusted)
                    }
                  />
                  <b className="min-w-0 flex-1 truncate text-body font-semibold text-primary">
                    {s.name}
                  </b>
                  {(s.state === "parked" || s.state === "reconnecting") && (
                    <Button
                      size="sm"
                      className={rowBtn}
                      disabled={busy === s.name}
                      onClick={() => void retry(s.name)}
                      title="Try reconnecting now"
                    >
                      <ArrowClockwise size={12} aria-hidden />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className={rowBtn}
                    variant={s.trusted ? "secondary" : "primary"}
                    onClick={() => void toggle(s)}
                    disabled={busy === s.name || (s.trusted && !s.declared)}
                    title={
                      s.trusted
                        ? "Disconnect & revoke trust (fail-closed)"
                        : "Trust this server in the workspace"
                    }
                  >
                    {busy === s.name ? "…" : s.trusted ? "Untrust" : "Trust"}
                  </Button>
                </div>
                <small className="text-caption text-muted">
                  {s.state === "reconnecting"
                    ? `reconnecting… ${s.nextRetryAt ? `(${Math.max(0, Math.round((s.nextRetryAt - Date.now()) / 1000))}s)` : ""}`
                    : s.state === "parked"
                      ? "parked, 5× failed"
                      : s.connected
                        ? `${s.toolCount} tools`
                        : s.trusted
                          ? "connecting…"
                          : s.declared
                            ? "untrusted"
                            : "not installed"}
                </small>
                {s.lastError && s.state !== "connected" && (
                  <small className="flex items-start gap-1 text-caption leading-4 text-danger">
                    <Warning
                      size={11}
                      aria-hidden
                      className="mt-0.5 shrink-0"
                    />{" "}
                    {s.lastError.slice(0, 64)}
                  </small>
                )}
              </li>
            ))}
          </ul>
          {audit.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <SectionTitle>Audit</SectionTitle>
              <ul className="flex flex-col gap-0.5">
                {audit.map((a) => (
                  <li
                    key={a.id}
                    className={`flex items-center gap-1.5 text-caption ${a.ok ? "text-muted" : "text-danger"}`}
                  >
                    {a.ok ? (
                      <Check
                        size={11}
                        weight="bold"
                        aria-hidden
                        className="text-success"
                      />
                    ) : (
                      <X size={11} weight="bold" aria-hidden />
                    )}
                    <code className="font-mono">{a.tool}</code>
                    {a.error ? (
                      <span className="truncate text-dim">
                        , {a.error.slice(0, 46)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2.5 border-t border-line pt-3">
            <SectionTitle>
              Catalog {booting ? "" : `(${catalog.length})`}
            </SectionTitle>
            <div className="flex flex-wrap items-center gap-2 rounded-md2 border border-line bg-inset px-3 py-2">
              {uvx === "loading" ? (
                <small className="text-caption text-dim">
                  checking Python runtime (uvx)…
                </small>
              ) : uvx ? (
                <small className="flex items-center gap-1.5 text-caption text-secondary">
                  <Check
                    size={12}
                    weight="bold"
                    aria-hidden
                    className="text-success"
                  />{" "}
                  Python/uvx ready,{" "}
                  <code className="font-mono text-dim">
                    {uvx === "uvx" ? "on PATH" : uvx}
                  </code>
                </small>
              ) : uvInstalling ? (
                <small className="text-caption text-muted">
                  running the official astral.sh installer… (±30–120s)
                </small>
              ) : uvConfirm ? (
                <>
                  <small className="flex-1 text-caption leading-5 text-secondary">
                    <b>Install uv?</b> This runs the official{" "}
                    <code className="font-mono">astral.sh/uv</code> installer on
                    this machine (~30 MB, user profile). Continue?
                  </small>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void installUv()}
                  >
                    Yes, install
                  </Button>
                  <Button size="sm" onClick={() => setUvConfirm(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <small className="flex-1 text-caption leading-5 text-dim">
                    Python/uvx: not installed, the Git/Time servers need it (the
                    other 18 don't)
                  </small>
                  <Button size="sm" onClick={() => setUvConfirm(true)}>
                    Install uv
                  </Button>
                </>
              )}
            </div>
            {uvLog && (
              <small className="text-caption text-dim">
                installer log: {uvLog}
              </small>
            )}
            <TextInput
              placeholder="Search servers… (web, data, github…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {booting ? (
              <SkeletonRows rows={5} />
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {shown.map((c) => {
                  const isInstalled = declared.has(c.id);
                  const risk = RISK_LABEL[c.risk] ?? RISK_LABEL.rendah!;
                  return (
                    <li
                      key={c.id}
                      className={`flex flex-col gap-2 rounded-lg2 border px-3 py-2.5 ${isInstalled ? "border-accent/30 bg-accent-soft/20" : "border-line bg-surface"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-body font-semibold text-primary">
                        <div className="flex flex-col">
                          <span>{c.name}</span>
                          {c.runtime === "python" && (
                            <span
                              title={
                                c.setupNote ??
                                "This server is Python-based (uvx)"
                              }
                              className="text-dim text-xs"
                            >
                              (Python/uvx)
                            </span>
                          )}
                        </div>
                        <Chip tone={risk.tone}>{risk.label}</Chip>
                      </div>

                      <small className="text-caption leading-5 text-muted">
                        {c.description}
                      </small>
                      {c.runtime === "python" && c.setupNote && (
                        <small className="flex items-start gap-1 text-caption leading-4 text-warn">
                          <Warning
                            size={11}
                            aria-hidden
                            className="mt-0.5 shrink-0"
                          />{" "}
                          {c.setupNote}
                        </small>
                      )}
                      <div className="mt-auto flex items-center justify-end">
                        {isInstalled ? (
                          <Button
                            size="sm"
                            className={rowBtn}
                            onClick={() => setConfirmUn(c)}
                            disabled={busy === c.id}
                            title="Remove from mcp.json (disconnects)"
                          >
                            {busy === c.id ? "…" : "Remove"}
                          </Button>
                        ) : c.runtime === "python" && uvx === null ? (
                          <Button
                            size="sm"
                            className={rowBtn}
                            disabled
                            title={
                              c.setupNote ??
                              "Requires uv (Python), click Install uv above"
                            }
                          >
                            Needs uv
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className={rowBtn}
                            onClick={() => {
                              setOpenForm(c.id);
                              setEnvVals({});
                            }}
                            disabled={busy === c.id}
                            title={
                              c.envKeys.length > 0
                                ? "Requires API key"
                                : "Install now"
                            }
                          >
                            {c.envKeys.length > 0 ? "Set up…" : "Install"}
                          </Button>
                        )}
                      </div>
                      {openForm === c.id && (
                        <div className="flex flex-col gap-2 border-t border-line pt-2">
                          {c.envKeys.map((k) => (
                            <TextInput
                              key={k.key}
                              type="password"
                              className="w-full"
                              placeholder={`${k.label}${k.required ? " *" : ""}`}
                              value={envVals[k.key] ?? ""}
                              onChange={(e) =>
                                setEnvVals({
                                  ...envVals,
                                  [k.key]: e.target.value,
                                })
                              }
                            />
                          ))}
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => void install(c)}
                              disabled={
                                busy === c.id ||
                                c.envKeys.some(
                                  (k) => k.required && !envVals[k.key]?.trim(),
                                )
                              }
                            >
                              Install
                            </Button>
                            <Button size="sm" onClick={() => setOpenForm(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {/* Popup konfirmasi uninstall server dari mcp.json */}
      <ConfirmDialog
        open={confirmUn !== null}
        title="Remove MCP server"
        message={
          confirmUn && (
            <>
              Remove <b>“{confirmUn.name}”</b> from mcp.json? Active sessions
              using its tools will be disconnected. You can reinstall it from
              the catalog anytime.
            </>
          )
        }
        confirmLabel="Remove server"
        busy={confirmUn !== null && busy === confirmUn.id}
        busyLabel="Removing…"
        onConfirm={() => confirmUn && void uninstall(confirmUn)}
        onClose={() => setConfirmUn(null)}
      />
    </section>
  );
}
