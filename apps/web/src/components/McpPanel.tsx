"use client";
// Panel MCP (P1-MCP-3 + P1-MCP-1): trust gate workspace + status koneksi live
// + audit tail + KATALOG server (install → mcp.json, uninstall). Fail-closed:
// install TIDAK menghubungkan — user harus Trust dulu (toggle di atas).
// DS-1: ui/* + Tailwind + Phosphor (docs/DESIGN-SYSTEM.md).
import { useCallback, useEffect, useState } from "react";
import type { McpAuditEntry, McpCatalogEntry, McpServerStatus } from "@yui/contracts";
import { ArrowsClockwise, ArrowClockwise, Check, Warning, X } from "@phosphor-icons/react";
import { SkeletonRows } from "./Skeleton";
import { Button, Chip, Dot, SectionTitle, TextInput } from "./ui";
import { toastErr, toastOk } from "./ui/toast";

const RISK_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "danger" }> = {
  rendah: { label: "aman", tone: "ok" },
  sedang: { label: "hati-hati", tone: "warn" },
  tinggi: { label: "akses akun", tone: "danger" },
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
  const [uvInstalling, setUvInstalling] = useState(false);
  const [uvLog, setUvLog] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, a, c, rt] = await Promise.all([
        fetch("/api/mcp/servers"),
        fetch("/api/mcp/audit?limit=5"),
        fetch("/api/mcp/catalog"),
        fetch("/api/mcp/runtime"),
      ]);
      if (s.ok) setServers(((await s.json()) as { servers: McpServerStatus[] }).servers);
      if (a.ok) setAudit(((await a.json()) as { entries: McpAuditEntry[] }).entries);
      if (c.ok) setCatalog(((await c.json()) as { catalog: McpCatalogEntry[] }).catalog);
      if (rt.ok) setUvx((((await rt.json()) as { uvxPath: string | null }).uvxPath) ?? null);
    } catch {
      /* refresh berikutnya */
    }
  }, []);

  useEffect(() => {
    void refresh();
    // P1-MCP-6: daftar tool server bisa berubah kapan pun (notifikasi
    // tools/list_changed di core) — poll ringan agar panel selalu segar.
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  /** One-click install uv (installer resmi astral.sh) — konfirmasi eksplisit UI. */
  async function installUv() {
    setUvInstalling(true);
    setUvLog(null);
    try {
      const res = await fetch("/api/mcp/runtime", { method: "POST" });
      const j = (await res.json()) as { ok: boolean; uvxPath: string | null; log: string };
      if (j.ok) {
        setUvx(j.uvxPath ?? "uvx");
        toastOk("uv terpasang — server Python/uvx siap dipakai.");
      }
      else {
        toastErr("installer selesai tapi uvx belum terdeteksi — coba restart dev server");
        setUvLog(j.log || null);
      }
      setUvConfirm(false);
    } catch {
      toastErr("gagal menjalankan installer");
    } finally {
      setUvInstalling(false);
    }
  }

  async function toggle(s: McpServerStatus) {
    setBusy(s.name);
    try {
      const res = await fetch("/api/mcp/servers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ server: s.name, trusted: !s.trusted, denyTools: s.denyTools }),
      });
      if (!res.ok) toastErr(((await res.json()) as { error?: string }).error ?? "gagal");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  /** P0-MCP-1: coba hubungkan ulang server parked/reconnecting sekarang. */
  async function retry(name: string) {
    setBusy(name);
    try {
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ server: name }),
      });
      if (!res.ok) toastErr(((await res.json()) as { error?: string }).error ?? "gagal reconnect");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function install(c: McpCatalogEntry) {
    setBusy(c.id);
    try {
      const res = await fetch("/api/mcp/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ catalogId: c.id, env: envVals }),
      });
      if (!res.ok) toastErr(((await res.json()) as { error?: string }).error ?? "gagal");
      else {
        setOpenForm(null);
        setEnvVals({});
        toastOk(`${c.name} ditambahkan ke mcp.json — Trust untuk menghubungkan.`);
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function uninstall(c: McpCatalogEntry) {
    setBusy(c.id);
    try {
      const res = await fetch(`/api/mcp/install?name=${encodeURIComponent(c.id)}`, { method: "DELETE" });
      if (!res.ok) toastErr(((await res.json()) as { error?: string }).error ?? "gagal");
      else toastOk(`${c.name} dilepas dari mcp.json.`);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const declared = new Set(servers.filter((s) => s.declared).map((s) => s.name));
  const booting = servers.length === 0 && catalog.length === 0;
  const q = query.trim().toLowerCase();
  const shown = catalog.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.category.includes(q),
  );

  const rowBtn = "h-7 shrink-0 whitespace-nowrap px-2.5 text-caption";

  return (
    <section aria-label="Server MCP" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <SectionTitle>MCP</SectionTitle>
        <Button size="sm" onClick={() => void refresh()} aria-label="Refresh MCP" title="Muat ulang status MCP">
          <ArrowsClockwise size={12} aria-hidden />
        </Button>
      </div>
      {booting ? (
        <SkeletonRows rows={3} />
      ) : (
        <>
          {servers.length === 0 && (
            <p className="text-caption leading-5 text-dim">Tidak ada server MCP dideklarasikan — pasang dari katalog di bawah.</p>
          )}
          <ul className="flex flex-col gap-1.5">
            {servers.map((s) => (
              <li
                key={s.name}
                className={`flex items-center gap-2.5 rounded-lg2 border px-3 py-2 ${s.trusted ? "border-accent/30 bg-accent-soft/30" : "border-line bg-surface"}`}
              >
                <Dot tone={s.connected ? "ok" : s.state === "parked" ? "danger" : s.trusted ? "accent" : "muted"} pulse={!s.connected && (s.state === "reconnecting" || s.trusted)} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <b className="text-body font-semibold text-primary">{s.name}</b>
                  <small className="text-caption text-muted">
                    {s.state === "reconnecting"
                      ? `sambung ulang… ${s.nextRetryAt ? `(${Math.max(0, Math.round((s.nextRetryAt - Date.now()) / 1000))}d)` : ""}`
                      : s.state === "parked"
                        ? "parkir — 5× gagal"
                        : s.connected
                          ? `${s.toolCount} tools`
                          : s.trusted
                            ? "menghubungkan…"
                            : s.declared
                              ? "untrusted"
                              : "tak terpasang"}
                  </small>
                  {s.lastError && s.state !== "connected" && (
                    <small className="flex items-center gap-1 text-caption leading-4 text-danger">
                      <Warning size={11} aria-hidden className="shrink-0" /> {s.lastError.slice(0, 64)}
                    </small>
                  )}
                </span>
                {(s.state === "parked" || s.state === "reconnecting") && (
                  <Button size="sm" className={rowBtn} disabled={busy === s.name} onClick={() => void retry(s.name)} title="Coba hubungkan ulang sekarang">
                    <ArrowClockwise size={12} aria-hidden />
                  </Button>
                )}
                <Button
                  size="sm"
                  className={rowBtn}
                  variant={s.trusted ? "secondary" : "primary"}
                  onClick={() => void toggle(s)}
                  disabled={busy === s.name || (s.trusted && !s.declared)}
                  title={s.trusted ? "Putuskan & matikan trust (fail-closed)" : "Trust server ini di workspace"}
                >
                  {busy === s.name ? "…" : s.trusted ? "Untrust" : "Trust"}
                </Button>
              </li>
            ))}
          </ul>
          {audit.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <SectionTitle>Audit</SectionTitle>
              <ul className="flex flex-col gap-0.5">
                {audit.map((a) => (
                  <li key={a.id} className={`flex items-center gap-1.5 text-caption ${a.ok ? "text-muted" : "text-danger"}`}>
                    {a.ok ? <Check size={11} weight="bold" aria-hidden className="text-success" /> : <X size={11} weight="bold" aria-hidden />}
                    <code className="font-mono">{a.tool}</code>
                    {a.error ? <span className="truncate text-dim"> — {a.error.slice(0, 46)}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2.5 border-t border-line pt-3">
            <SectionTitle>Katalog {booting ? "" : `(${catalog.length})`}</SectionTitle>
            <div className="flex flex-wrap items-center gap-2 rounded-md2 border border-line bg-inset px-3 py-2">
              {uvx === "loading" ? (
                <small className="text-caption text-dim">cek runtime Python (uvx)…</small>
              ) : uvx ? (
                <small className="flex items-center gap-1.5 text-caption text-secondary">
                  <Check size={12} weight="bold" aria-hidden className="text-success" /> Python/uvx siap —{" "}
                  <code className="font-mono text-dim">{uvx === "uvx" ? "di PATH" : uvx}</code>
                </small>
              ) : uvInstalling ? (
                <small className="text-caption text-muted">menjalankan installer resmi astral.sh… (±30–120 dtk)</small>
              ) : uvConfirm ? (
                <>
                  <small className="flex-1 text-caption leading-5 text-secondary">
                    <b>Install uv?</b> Menjalankan installer resmi <code className="font-mono">astral.sh/uv</code> di mesin ini
                    (~30 MB, profil user). Lanjut?
                  </small>
                  <Button size="sm" variant="primary" onClick={() => void installUv()}>
                    Ya, install
                  </Button>
                  <Button size="sm" onClick={() => setUvConfirm(false)}>
                    Batal
                  </Button>
                </>
              ) : (
                <>
                  <small className="flex-1 text-caption leading-5 text-dim">
                    Python/uvx: belum terpasang — server Git/Time butuh ini (18 server lain tak butuh)
                  </small>
                  <Button size="sm" onClick={() => setUvConfirm(true)}>
                    Install uv
                  </Button>
                </>
              )}
            </div>
            {uvLog && <small className="text-caption text-dim">log installer: {uvLog}</small>}
            <TextInput
              placeholder="Cari server… (web, data, github…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {booting ? (
              <SkeletonRows rows={5} />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {shown.map((c) => {
                  const isInstalled = declared.has(c.id);
                  const risk = RISK_LABEL[c.risk] ?? RISK_LABEL.rendah!;
                  return (
                    <li
                      key={c.id}
                      className={`flex flex-wrap items-center gap-2.5 rounded-lg2 border px-3 py-2 ${isInstalled ? "border-accent/30 bg-accent-soft/20" : "border-line bg-surface"}`}
                    >
                      <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                        <b className="flex flex-wrap items-center gap-1.5 text-body font-semibold text-primary">
                          {c.name} <Chip tone={risk.tone}>{risk.label}</Chip>
                          {c.runtime === "python" && (
                            <span title={c.setupNote ?? "Server ini berbasis Python (uvx)"}>
                              <Chip tone="muted">Python/uvx</Chip>
                            </span>
                          )}
                        </b>
                        <small className="text-caption leading-5 text-muted">{c.description}</small>
                        {c.runtime === "python" && c.setupNote && (
                          <small className="flex items-center gap-1 text-caption leading-4 text-warn">
                            <Warning size={11} aria-hidden className="shrink-0" /> {c.setupNote}
                          </small>
                        )}
                      </span>
                      {isInstalled ? (
                        <Button size="sm" className={rowBtn} onClick={() => void uninstall(c)} disabled={busy === c.id} title="Lepas dari mcp.json (putuskan koneksi)">
                          {busy === c.id ? "…" : "Lepas"}
                        </Button>
                      ) : c.runtime === "python" && uvx === null ? (
                        <Button size="sm" className={rowBtn} disabled title={c.setupNote ?? "Butuh uv (Python) — klik Install uv di atas"}>
                          Butuh uv
                        </Button>
                      ) : openForm === c.id ? (
                        <div className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-2">
                          {c.envKeys.map((k) => (
                            <TextInput
                              key={k.key}
                              type="password"
                              className="h-7 w-44"
                              placeholder={`${k.label}${k.required ? " *" : ""}`}
                              value={envVals[k.key] ?? ""}
                              onChange={(e) => setEnvVals({ ...envVals, [k.key]: e.target.value })}
                            />
                          ))}
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => void install(c)}
                            disabled={busy === c.id || c.envKeys.some((k) => k.required && !envVals[k.key]?.trim())}
                          >
                            Pasang
                          </Button>
                          <Button size="sm" onClick={() => setOpenForm(null)}>
                            Batal
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className={rowBtn}
                          onClick={() => {
                            setOpenForm(c.id);
                            setEnvVals({});
                          }}
                          disabled={busy === c.id}
                          title={c.envKeys.length > 0 ? "Perlu API key" : "Pasang sekarang"}
                        >
                          {c.envKeys.length > 0 ? "Atur…" : "Pasang"}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
