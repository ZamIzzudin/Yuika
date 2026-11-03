"use client";
// Panel MCP (P1-MCP-3 + P1-MCP-1): trust gate workspace + status koneksi live
// + audit tail + KATALOG server (install → mcp.json, uninstall). Fail-closed:
// install TIDAK menghubungkan — user harus Trust dulu (toggle di atas).
import { useCallback, useEffect, useState } from "react";
import type { McpAuditEntry, McpCatalogEntry, McpServerStatus } from "@yui/contracts";

const RISK_LABEL: Record<string, string> = { rendah: "aman", sedang: "hati-hati", tinggi: "akses akun" };

export function McpPanel() {
  const [servers, setServers] = useState<McpServerStatus[]>([]);
  const [audit, setAudit] = useState<McpAuditEntry[]>([]);
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [openForm, setOpenForm] = useState<string | null>(null); // id katalog dengan form env terbuka
  const [envVals, setEnvVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, a, c] = await Promise.all([
        fetch("/api/mcp/servers"),
        fetch("/api/mcp/audit?limit=5"),
        fetch("/api/mcp/catalog"),
      ]);
      if (s.ok) setServers(((await s.json()) as { servers: McpServerStatus[] }).servers);
      if (a.ok) setAudit(((await a.json()) as { entries: McpAuditEntry[] }).entries);
      if (c.ok) setCatalog(((await c.json()) as { catalog: McpCatalogEntry[] }).catalog);
    } catch {
      /* refresh berikutnya */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle(s: McpServerStatus) {
    setBusy(s.name);
    setErr(null);
    try {
      const res = await fetch("/api/mcp/servers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ server: s.name, trusted: !s.trusted, denyTools: s.denyTools }),
      });
      if (!res.ok) setErr((((await res.json()) as { error?: string }).error ?? "gagal") + "");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function install(c: McpCatalogEntry) {
    setBusy(c.id);
    setErr(null);
    try {
      const res = await fetch("/api/mcp/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ catalogId: c.id, env: envVals }),
      });
      if (!res.ok) setErr((((await res.json()) as { error?: string }).error ?? "gagal") + "");
      else {
        setOpenForm(null);
        setEnvVals({});
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function uninstall(c: McpCatalogEntry) {
    setBusy(c.id);
    setErr(null);
    try {
      const res = await fetch(`/api/mcp/install?name=${encodeURIComponent(c.id)}`, { method: "DELETE" });
      if (!res.ok) setErr((((await res.json()) as { error?: string }).error ?? "gagal") + "");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const declared = new Set(servers.filter((s) => s.declared).map((s) => s.name));
  const q = query.trim().toLowerCase();
  const shown = catalog.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.category.includes(q),
  );

  return (
    <section className="mcp-section" aria-label="Server MCP">
      <div className="project-head">
        <span className="project-title">MCP</span>
        <button className="project-add" onClick={() => void refresh()} aria-label="Refresh MCP">
          ↻
        </button>
      </div>
      {servers.length === 0 && <p className="task-empty">Tidak ada server MCP dideklarasikan — pasang dari katalog di bawah.</p>}
      <ul className="mcp-list">
        {servers.map((s) => (
          <li key={s.name} className="mcp-row" data-trusted={s.trusted || undefined}>
            <span className="mcp-dot" data-on={s.connected || undefined} />
            <span className="mcp-body">
              <b>{s.name}</b>
              <small>{s.connected ? `${s.toolCount} tools` : s.trusted ? "menghubungkan…" : s.declared ? "untrusted" : "tak terpasang"}</small>
            </span>
            <button
              className="btn mcp-toggle"
              onClick={() => void toggle(s)}
              disabled={busy === s.name || (s.trusted && !s.declared)}
              title={s.trusted ? "Putuskan & matikan trust (fail-closed)" : "Trust server ini di workspace"}
            >
              {busy === s.name ? "…" : s.trusted ? "Untrust" : "Trust"}
            </button>
          </li>
        ))}
      </ul>
      {err && <p className="project-err">{err}</p>}
      {audit.length > 0 && (
        <div className="mcp-audit">
          <span className="project-title">Audit</span>
          <ul>
            {audit.map((a) => (
              <li key={a.id} data-ok={a.ok || undefined}>
                {a.ok ? "✓" : "✕"} {a.tool}
                {a.error ? ` — ${a.error.slice(0, 46)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mcp-catalog">
        <div className="project-head">
          <span className="project-title">Katalog ({catalog.length})</span>
        </div>
        <input
          className="mcp-search"
          placeholder="Cari server… (web, data, github…)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="catalog-list">
          {shown.map((c) => {
            const isInstalled = declared.has(c.id);
            return (
              <li key={c.id} className="catalog-row" data-installed={isInstalled || undefined}>
                <span className="catalog-body">
                  <b>
                    {c.name} <small className="catalog-risk" data-r={c.risk}>{RISK_LABEL[c.risk]}</small>
                  </b>
                  <small>{c.description}</small>
                </span>
                {isInstalled ? (
                  <button className="btn mcp-toggle" onClick={() => void uninstall(c)} disabled={busy === c.id} title="Lepas dari mcp.json (putuskan koneksi)">
                    {busy === c.id ? "…" : "Lepas"}
                  </button>
                ) : openForm === c.id ? (
                  <div className="catalog-form">
                    {c.envKeys.map((k) => (
                      <input
                        key={k.key}
                        type="password"
                        placeholder={`${k.label}${k.required ? " *" : ""}`}
                        value={envVals[k.key] ?? ""}
                        onChange={(e) => setEnvVals({ ...envVals, [k.key]: e.target.value })}
                      />
                    ))}
                    <button
                      className="btn"
                      onClick={() => void install(c)}
                      disabled={busy === c.id || c.envKeys.some((k) => k.required && !envVals[k.key]?.trim())}
                    >
                      Pasang
                    </button>
                    <button className="btn secondary" onClick={() => setOpenForm(null)}>
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn mcp-toggle"
                    onClick={() => {
                      setOpenForm(c.id);
                      setEnvVals({});
                    }}
                    disabled={busy === c.id}
                    title={c.envKeys.length > 0 ? "Perlu API key" : "Pasang sekarang"}
                  >
                    {c.envKeys.length > 0 ? "Atur…" : "Pasang"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
