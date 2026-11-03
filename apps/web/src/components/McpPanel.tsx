"use client";
// Panel MCP (P1-MCP-3): trust gate workspace + status koneksi live + audit tail.
// Server tanpa trust = fail-closed (tidak dihubungkan). Toggle memanggil
// PUT /api/mcp/servers → runtime connect/disconnect dinamis.
import { useCallback, useEffect, useState } from "react";
import type { McpAuditEntry, McpServerStatus } from "@yui/contracts";

export function McpPanel() {
  const [servers, setServers] = useState<McpServerStatus[]>([]);
  const [audit, setAudit] = useState<McpAuditEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([fetch("/api/mcp/servers"), fetch("/api/mcp/audit?limit=5")]);
      if (s.ok) setServers(((await s.json()) as { servers: McpServerStatus[] }).servers);
      if (a.ok) setAudit(((await a.json()) as { entries: McpAuditEntry[] }).entries);
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

  return (
    <section className="mcp-section" aria-label="Server MCP">
      <div className="project-head">
        <span className="project-title">MCP</span>
        <button className="project-add" onClick={() => void refresh()} aria-label="Refresh MCP">
          ↻
        </button>
      </div>
      {servers.length === 0 && <p className="task-empty">Tidak ada server MCP dideklarasikan (mcp.json).</p>}
      <ul className="mcp-list">
        {servers.map((s) => (
          <li key={s.name} className="mcp-row" data-trusted={s.trusted || undefined}>
            <span className="mcp-dot" data-on={s.connected || undefined} />
            <span className="mcp-body">
              <b>{s.name}</b>
              <small>
                {s.connected ? `${s.toolCount} tools` : s.trusted ? "menghubungkan…" : "untrusted"}
              </small>
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
    </section>
  );
}
