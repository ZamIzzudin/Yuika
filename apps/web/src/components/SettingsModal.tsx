"use client";
// Settings modal (feedback user sesi dev 9): menu khusus untuk hal yang tidak muat
// di sidebar — seksi: Provider & Model (API key/base URL/model, swap panas),
// MCP (katalog + trust + audit — dulunya sesak di dasar sidebar), + fondasi
// seksi setelan lain ke depan.
import { useCallback, useEffect, useState } from "react";
import type { ModelRoutes, ProviderSettings } from "@yui/contracts";
import { McpPanel } from "./McpPanel";
import { Skeleton } from "./Skeleton";

type Section = "provider" | "mcp";

const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: "provider", label: "Provider & Model", hint: "API key, base URL, model" },
  { id: "mcp", label: "MCP & Tools", hint: "katalog, trust, audit" },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("provider");
  const [cfg, setCfg] = useState<ProviderSettings | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [fallback, setFallback] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/provider");
      if (res.ok) {
        const c = (await res.json()) as ProviderSettings;
        setCfg(c);
        setBaseUrl(c.baseUrl);
        setModel(c.model);
        setFallback(c.fallbackModel ?? "");
      }
    } catch {
      /* coba lagi saat buka */ 
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setErr(null);
    setFlash(null);
    try {
      const res = await fetch("/api/settings/provider", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(baseUrl.trim() && baseUrl !== cfg?.baseUrl ? { baseUrl: baseUrl.trim() } : {}),
          ...(model.trim() && model !== cfg?.model ? { model: model.trim() } : {}),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(fallback.trim() ? { fallbackModel: fallback.trim() } : {}),
        }),
      });
      if (!res.ok) {
        setErr((((await res.json()) as { error?: string }).error ?? "gagal menyimpan") + "");
        return;
      }
      setApiKey("");
      setFlash("Tersimpan — sesi & turn berikutnya memakai config baru (.env diperbarui).");
      await load();
    } catch {
      setErr("gagal menghubungi server");
    }
  }

  const dirty = Boolean(
    (baseUrl.trim() && baseUrl !== cfg?.baseUrl) ||
      (model.trim() && model !== cfg?.model) ||
      apiKey.trim() ||
      fallback.trim(),
  );

  return (
    <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal>
      <div className="settings-modal">
        <header className="settings-head">
          <b>Pengaturan</b>
          <button className="settings-close" onClick={onClose} aria-label="Tutup pengaturan">
            ✕
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav">
            {SECTIONS.map((s) => (
              <button key={s.id} data-active={section === s.id ? "" : undefined} onClick={() => setSection(s.id)}>
                <b>{s.label}</b>
                <small>{s.hint}</small>
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {section === "provider" && (
              <section aria-label="Provider dan model">
                {cfg === null ? (
                  <Skeleton lines={5} />
                ) : (
                  <>
                {cfg && (
                  <p className="pane-hint">
                    Key tersimpan: <code>{cfg.hasApiKey ? cfg.keyPreview : "belum ada"}</code> · aktif:{" "}
                    <code>{cfg.model}</code>
                  </p>
                )}
                <label className="settings-field">
                  <span>Base URL (OpenAI-compatible)</span>
                  <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.…/v1" spellCheck={false} />
                </label>
                <label className="settings-field">
                  <span>API key {cfg?.hasApiKey ? "(kosongkan untuk keep)" : ""}</span>
                  <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={cfg?.hasApiKey ? "••••••••" : "sk-…"} spellCheck={false} />
                </label>
                <label className="settings-field">
                  <span>Model utama</span>
                  <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="glm/glm-5.1" spellCheck={false} />
                </label>
                <label className="settings-field">
                  <span>Model fallback (opsional — dipakai otomatis bila model utama gagal, P0-CORE-2)</span>
                  <input value={fallback} onChange={(e) => setFallback(e.target.value)} placeholder="glm/glm-5" spellCheck={false} />
                </label>
                <ModelRoutesEditor defaultModel={cfg.model} />
                <div className="settings-actions">
                  <button className="btn" onClick={() => void save()} disabled={!dirty}>
                    Simpan
                  </button>
                  {flash && <small className="ok">{flash}</small>}
                  {err && <small className="project-err">{err}</small>}
                </div>
                  </>
                )}
              </section>
            )}
            {section === "mcp" && (
              <div className="settings-mcp">
                <McpPanel />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** P1-MDL: editor model per persona — kosong = ikut default; tersimpan ke
 *  model-overrides.json, sesi berikutnya langsung memakai route baru. */
function ModelRoutesEditor({ defaultModel }: { defaultModel: string }) {
  const [routes, setRoutes] = useState<ModelRoutes | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/settings/models");
      if (r.ok) setRoutes((await r.json()) as ModelRoutes);
    } catch {
      /* coba lagi */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!routes) return <Skeleton lines={3} />;
  return (
    <div className="settings-field model-routes">
      <span className="field-title">Model per persona (P1-MDL)</span>
      <small className="dim">
        Kosongkan untuk ikut default (<code>{defaultModel}</code>). Anak delegasi memakai model
        persona-nya sendiri — jadi Conductor & Coder bisa berjalan di model berbeda dalam satu run.
      </small>
      <table className="model-table">
        <tbody>
          {routes.personas.map((p) => {
            const o = routes.overrides[p.id];
            return (
              <tr key={p.id} data-dirty={saving === p.id ? "" : undefined}>
                <th>{p.name}</th>
                <td>
                  <input
                    defaultValue={o?.model ?? ""}
                    placeholder={defaultModel}
                    spellCheck={false}
                    onBlur={(e) => void save(p.id, "model", e.target.value, routes, setRoutes, setSaving, setOk)}
                  />
                </td>
                <td>
                  <input
                    defaultValue={o?.fallback ?? ""}
                    placeholder={routes.defaultFallback || "—"}
                    spellCheck={false}
                    onBlur={(e) => void save(p.id, "fallback", e.target.value, routes, setRoutes, setSaving, setOk)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {ok && <small className="ok">{ok}</small>}
    </div>
  );
}

async function save(
  personaId: string,
  field: "model" | "fallback",
  value: string,
  routes: ModelRoutes,
  setRoutes: (m: ModelRoutes) => void,
  setSaving: (s: string | null) => void,
  setOk: (s: string | null) => void,
) {
  const cur = routes.overrides[personaId] ?? {};
  const next = { ...cur, [field]: value.trim() } as { model?: string; fallback?: string };
  const empty = !next.model && !next.fallback;
  setSaving(personaId);
  setOk(null);
  try {
    const r = await fetch("/api/settings/models", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personaId, model: empty ? "" : next.model ?? "", fallback: empty ? "" : next.fallback ?? "" }),
    });
    if (r.ok) {
      setRoutes((await r.json()) as ModelRoutes);
      setOk("Tersimpan — sesi berikutnya memakai route baru.");
    }
  } finally {
    setSaving(null);
  }
}
