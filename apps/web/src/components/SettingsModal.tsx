"use client";
// Settings modal (feedback user sesi dev 9): menu khusus untuk hal yang tidak muat
// di sidebar — seksi: Provider & Model (API key/base URL/model, swap panas),
// MCP (katalog + trust + audit — dulunya sesak di dasar sidebar), + fondasi
// seksi setelan lain ke depan.
import { useCallback, useEffect, useState } from "react";
import type { ModelRoutes, ProviderSettings } from "@yui/contracts";
import { McpPanel } from "./McpPanel";
import { Skeleton } from "./Skeleton";

type Section = "provider" | "mcp" | "usage";

const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: "provider", label: "Provider & Model", hint: "API key, base URL, model" },
  { id: "mcp", label: "MCP & Tools", hint: "katalog, trust, audit" },
  { id: "usage", label: "Metering", hint: "pemakaian token per persona/model" },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("provider");
  const [cfg, setCfg] = useState<ProviderSettings | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [kind, setKind] = useState<"openai-compat" | "anthropic" | "gemini">("openai-compat");
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
        setKind(c.kind ?? "openai-compat");
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
          ...(kind !== (cfg?.kind ?? "openai-compat") ? { kind } : {}),
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
    kind !== (cfg?.kind ?? "openai-compat") ||
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
                  <span>Jenis provider (P1-INF-2)</span>
                  <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                    <option value="openai-compat">OpenAI-compatible (GLM / OpenRouter / …)</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="gemini">Google Gemini</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>Base URL ({kind === "anthropic" ? "default: https://api.anthropic.com" : kind === "gemini" ? "default: https://generativelanguage.googleapis.com" : "OpenAI-compatible"})</span>
                  <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={kind === "anthropic" ? "https://api.anthropic.com" : kind === "gemini" ? "https://generativelanguage.googleapis.com" : "https://api.…/v1"} spellCheck={false} />
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
            {section === "usage" && (
              <section aria-label="Metering pemakaian">
                <BudgetPanel />
                <UsagePanel />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** P1-MDL: editor model per persona — kosong = ikut default; tersimpan ke
 *  model-overrides.json, sesi berikutnya langsung memakai route baru.
 *  P1-MDL-2: panel smoke test — model gagal tool-call 2 langkah → fallback otomatis. */
function ModelRoutesEditor({ defaultModel }: { defaultModel: string }) {
  const [routes, setRoutes] = useState<ModelRoutes | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [smoke, setSmoke] = useState<{ running: boolean; results: { model: string; ok: boolean; latencyMs: number; error: string | null }[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/settings/models");
      if (r.ok) setRoutes((await r.json()) as ModelRoutes);
      const s = await fetch("/api/settings/provider/smoke");
      if (s.ok) setSmoke((await s.json()) as NonNullable<typeof smoke>);
    } catch {
      /* coba lagi */
    }
  }, []);
  useEffect(() => {
    void load();
    // smoke berjalan async (auto setelah ganti provider) — poll ringan
    const t = setInterval(() => {
      if (smoke?.running) void load();
    }, 3_000);
    return () => clearInterval(t);
  }, [load, smoke?.running]);

  async function runSmoke() {
    setSmoke({ running: true, results: smoke?.results ?? [] });
    try {
      const r = await fetch("/api/settings/provider/smoke", { method: "POST" });
      if (r.ok) setSmoke((await r.json()) as NonNullable<typeof smoke>);
    } catch {
      setSmoke(null);
    }
  }

  if (!routes) return <Skeleton lines={3} />;
  return (
    <div className="settings-field model-routes">
      <span className="field-title">Model per persona (P1-MDL)</span>
      <small className="dim">
        Kosongkan untuk ikut default (<code>{defaultModel}</code>). Anak delegasi memakai model
        persona-nya sendiri — jadi Conductor & Coder bisa berjalan di model berbeda dalam satu run.
      </small>
      {/* P1-MDL-2: smoke test — verifikasi tool-call 2 langkah per model aktif */}
      <div className="smoke-panel">
        <button className="btn" onClick={() => void runSmoke()} disabled={smoke?.running}>
          {smoke?.running ? "menguji…" : "Uji semua model"}
        </button>
        {smoke && smoke.results.length > 0 && (
          <ul className="smoke-list">
            {smoke.results.map((s) => (
              <li key={s.model} data-ok={s.ok ? "" : undefined} title={s.error ?? undefined}>
                {s.ok ? "✓" : "✕"} <code>{s.model}</code> · {(s.latencyMs / 1000).toFixed(1)}s
                {!s.ok && <small> — fallback otomatis aktif</small>}
              </li>
            ))}
          </ul>
        )}
        {smoke && smoke.results.length === 0 && !smoke.running && <small className="dim">belum ada hasil — klik "Uji semua model"</small>}
      </div>
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

/** P1-CRED-2/3/4: panel saldo & batas — belanja jujur dari metering × price
 *  book, burn-rate 24 j, hold aktif, limit harian/total (mode warn/block),
 *  rate-limit turn/menit & cap delegasi paralel. Edit = blur → PUT budget. */
function BudgetPanel() {
  const [st, setSt] = useState<{
    config: { mode: "warn" | "block"; dailyLimit: number | null; totalLimit: number | null; maxTurnsPerMinute: number | null; maxDelegationConcurrency: number | null };
    spentToday: number; spentTotal: number; burnRatePerHour: number; activeHolds: number;
    coverage: "full" | "partial" | "none"; currency: "USD" | "IDR" | null; dailyLimitHit: boolean; totalLimitHit: boolean;
  } | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await fetch("/api/settings/budget");
    if (r.ok) setSt(await r.json());
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5_000);
    return () => clearInterval(t);
  }, [load]);

  const save = (patch: Record<string, number | "warn" | "block" | null>) =>
    void fetch("/api/settings/budget", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setSt(s));

  if (!st) return <Skeleton lines={3} />;
  const cur = st.currency ?? "USD";
  const fmtC = (n: number) => `${n.toLocaleString("id-ID", { maximumFractionDigits: n < 100 ? 3 : 0 })} ${cur}`;
  const bar = (spent: number, limit: number | null) => {
    if (!limit) return null;
    const pct = Math.min(100, Math.round((spent / limit) * 100));
    return (
      <div className="budget-bar" title={`${pct}% dari limit`}>
        <div style={{ width: `${pct}%` }} data-hot={spent >= limit ? "" : undefined} />
        <span>{pct}%</span>
      </div>
    );
  };
  const numField = (key: "dailyLimit" | "totalLimit" | "maxTurnsPerMinute" | "maxDelegationConcurrency", label: string, placeholder: string) => (
    <label className="field">
      <span className="field-title">{label}</span>
      <input
        inputMode="decimal"
        placeholder={placeholder}
        value={draft[key] ?? (st.config[key] === null ? "" : String(st.config[key]))}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        onBlur={() => {
          if (!(key in draft)) return;
          const raw = draft[key]!.trim();
          const n = Number(raw.replace(",", "."));
          const v = raw === "" ? null : Number.isFinite(n) && n > 0 ? n : undefined;
          if (v === undefined) { setDraft(({ [key]: _, ...rest }) => rest); return; } // tidak valid → batal
          save({ [key]: v } as Record<string, number | null>);
          setDraft(({ [key]: _, ...rest }) => rest);
        }}
      />
    </label>
  );
  return (
    <div className="budget-panel">
      <div className="budget-grid">
        <div>
          <span className="field-title">Hari ini</span>
          <p>
            <b>{fmtC(st.spentToday)}</b>
            {st.config.dailyLimit !== null ? <> / {fmtC(st.config.dailyLimit)}</> : <small className="dim"> (tanpa batas)</small>}
          </p>
          {bar(st.spentToday, st.config.dailyLimit)}
        </div>
        <div>
          <span className="field-title">Total</span>
          <p>
            <b>{fmtC(st.spentTotal)}</b>
            {st.config.totalLimit !== null ? <> / {fmtC(st.config.totalLimit)}</> : <small className="dim"> (tanpa batas)</small>}
          </p>
          {bar(st.spentTotal, st.config.totalLimit)}
        </div>
        <div>
          <span className="field-title">Burn-rate</span>
          <p>
            <b>{fmtC(st.burnRatePerHour)}</b>/j <small className="dim">(rata² 24 j)</small>
          </p>
          <p className="dim">
            Hold aktif: {fmtC(st.activeHolds)}
          </p>
        </div>
      </div>
      {(st.dailyLimitHit || st.totalLimitHit) && (
        <p className={st.config.mode === "block" ? "budget-hit" : "pane-hint"}>
          {st.config.mode === "block"
            ? "⛔ Limit tercapai — turn baru DITOLAK (mode block)."
            : "⚠ Limit tercapai (mode warn) — turn tetap berjalan."}
        </p>
      )}
      {st.coverage !== "full" && (
        <p className="pane-hint">
          {st.coverage === "none"
            ? "Angka biaya butuh harga model — isi di editor Harga model di bawah."
            : "Sebagian model belum dihargai — angka = batas bawah (jujur, bukan 0)."}
        </p>
      )}
      <div className="budget-limits">
        {numField("dailyLimit", `Limit harian (${cur})`, "— tanpa batas")}
        {numField("totalLimit", `Limit total (${cur})`, "— tanpa batas")}
        {numField("maxTurnsPerMinute", "Turn / menit", "— tanpa batas")}
        {numField("maxDelegationConcurrency", "Delegasi paralel", "— default 2")}
        <label className="field">
          <span className="field-title">Saat limit tercapai</span>
          <select value={st.config.mode} onChange={(e) => save({ mode: e.target.value as "warn" | "block" })}>
            <option value="warn">warn — peringatkan saja</option>
            <option value="block">block — tolak turn</option>
          </select>
        </label>
      </div>
    </div>
  );
}

/** P1-CRED-1 + P1-MDL-3: panel metering — rollup token per persona & model +
 *  estimasi biaya dari price book (hanya bila harga di-set — tanpa harga = tak
 *  dihitung, bukan 0). Editor harga inline per 1 jt token. */
function UsagePanel() {
  const [data, setData] = useState<{ summary: { calls: number; promptTokens: number; outputTokens: number; byPersona: { key: string; calls: number; promptTokens: number; outputTokens: number }[]; byModel: { key: string; calls: number; promptTokens: number; outputTokens: number }[]; windowStart: number | null }; recent?: { at: number; personaId: string; model: string; promptTokens: number; outputTokens: number; latencyMs: number }[]; matrix?: { personaId: string; model: string; calls: number; promptTokens: number; outputTokens: number; cost: number | null; currency: "USD" | "IDR" | null }[] } | null>(null);
  const [prices, setPrices] = useState<Record<string, { inputPerMillion: number; outputPerMillion: number; currency: "USD" | "IDR" }> | null>(null);
  const [hours, setHours] = useState<number>(0); // 0 = semua waktu

  const load = useCallback(async () => {
    const since = hours > 0 ? Date.now() - hours * 3_600_000 : undefined;
    const [u, p] = await Promise.all([
      fetch(`/api/usage?recent=8&matrix=1${since ? `&since=${since}` : ""}`),
      fetch("/api/settings/models/prices"),
    ]);
    if (u.ok) setData(await u.json());
    if (p.ok) setPrices(await p.json());
  }, [hours]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5_000);
    return () => clearInterval(t);
  }, [load]);

  const fmt = (n: number) => n.toLocaleString("id-ID");
  /** Estimasi biaya baris model — null bila model tak berharga (jujur, bukan 0). */
  const cost = (m: { key: string; promptTokens: number; outputTokens: number }): number | null => {
    const p = prices?.[m.key];
    if (!p || (!p.inputPerMillion && !p.outputPerMillion)) return null;
    return (m.promptTokens / 1_000_000) * p.inputPerMillion + (m.outputTokens / 1_000_000) * p.outputPerMillion;
  };
  const pricedCurrency =
    Object.entries(prices ?? {}).find(([, p]) => p.inputPerMillion || p.outputPerMillion)?.[1].currency ?? "USD";
  const fmtCost = (c: number | null) => (c === null ? "—" : `${c.toLocaleString("id-ID", { maximumFractionDigits: c < 100 ? 2 : 0 })} ${pricedCurrency}`);
  const totalCost = data ? data.summary.byModel.reduce((acc, m) => acc + (cost(m) ?? 0), 0) : 0;
  const anyPriced = data?.summary.byModel.some((m) => cost(m) !== null) ?? false;

  async function savePrice(model: string, p: { inputPerMillion: number; outputPerMillion: number; currency: "USD" | "IDR" }) {
    const r = await fetch("/api/settings/models/prices", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, price: p }),
    });
    if (r.ok) setPrices(await r.json());
  }
  return (
    <div className="usage-panel">
      <div className="usage-range">
        {[
          [0, "Semua"],
          [24, "24 jam"],
          [1, "1 jam"],
        ].map(([h, label]) => (
          <button key={h} className="btn secondary" data-active={hours === h ? "" : undefined} onClick={() => setHours(h as number)}>
            {label as string}
          </button>
        ))}
      </div>
      {data === null ? (
        <Skeleton lines={4} />
      ) : data.summary.calls === 0 ? (
        <p className="pane-hint">Belum ada pemakaian tercatat. Metering aktif otomatis — angka hanya dari laporan usage provider (tanpa estimasi).</p>
      ) : (
        <>
          <p className="usage-total">
            <b>{fmt(data.summary.calls)}</b> panggilan model · <b>{fmt(data.summary.promptTokens)}</b> token masuk ·{" "}
            <b>{fmt(data.summary.outputTokens)}</b> token keluar
            {anyPriced && <> · est. biaya <b>{fmtCost(totalCost)}</b></>}
            {data.summary.windowStart && <small className="dim"> (sejak {new Date(data.summary.windowStart).toLocaleString("id-ID")})</small>}
          </p>
          <table className="usage-table" aria-label="Pemakaian per persona">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Panggilan</th>
                <th>Tok masuk</th>
                <th>Tok keluar</th>
              </tr>
            </thead>
            <tbody>
              {data.summary.byPersona.map((r) => (
                <tr key={r.key}>
                  <td>{r.key.replace("yui-", "")}</td>
                  <td>{fmt(r.calls)}</td>
                  <td>{fmt(r.promptTokens)}</td>
                  <td>{fmt(r.outputTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="usage-table" aria-label="Pemakaian per model">
            <thead>
              <tr>
                <th>Model</th>
                <th>Panggilan</th>
                <th>Tok masuk</th>
                <th>Tok keluar</th>
                <th>Est. biaya</th>
              </tr>
            </thead>
            <tbody>
              {data.summary.byModel.map((r) => (
                <tr key={r.key}>
                  <td>
                    <code>{r.key}</code>
                  </td>
                  <td>{fmt(r.calls)}</td>
                  <td>{fmt(r.promptTokens)}</td>
                  <td>{fmt(r.outputTokens)}</td>
                  <td>{fmtCost(cost(r))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.matrix && data.matrix.length > 0 && (
            <>
              <span className="field-title">Attribution biaya (persona × model)</span>
              <table className="usage-table" aria-label="Attribution biaya persona per model">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Model</th>
                    <th>Panggilan</th>
                    <th>Token</th>
                    <th>Est. biaya</th>
                  </tr>
                </thead>
                <tbody>
                  {data.matrix.map((r) => (
                    <tr key={`${r.personaId}|${r.model}`}>
                      <td>{r.personaId.replace("yui-", "")}</td>
                      <td>
                        <code>{r.model}</code>
                      </td>
                      <td>{fmt(r.calls)}</td>
                      <td>{fmt(r.promptTokens + r.outputTokens)}</td>
                      <td>{r.cost === null ? "—" : `${r.cost.toLocaleString("id-ID", { maximumFractionDigits: 3 })} ${r.currency}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <PriceBookEditor models={data.summary.byModel.map((m) => m.key)} prices={prices} onSave={savePrice} />
          {data.recent && data.recent.length > 0 && (
            <>
              <span className="field-title">Terbaru</span>
              <ul className="usage-recent">
                {data.recent.map((e, i) => (
                  <li key={i}>
                    <code>{e.model}</code> · {e.personaId.replace("yui-", "")} · {fmt(e.promptTokens)}+{fmt(e.outputTokens)} tok · {e.latencyMs} ms
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** P1-MDL-3: editor price book — harga per 1 jt token (in/out) + mata uang.
 *  Baris = model yang terlihat di metering + yang sudah berharga; blur = simpan. */
function PriceBookEditor({
  models,
  prices,
  onSave,
}: {
  models: string[];
  prices: Record<string, { inputPerMillion: number; outputPerMillion: number; currency: "USD" | "IDR" }> | null;
  onSave: (model: string, p: { inputPerMillion: number; outputPerMillion: number; currency: "USD" | "IDR" }) => Promise<void>;
}) {
  const rows = Array.from(new Set([...(prices ? Object.keys(prices) : []), ...models]));
  const [draft, setDraft] = useState<Record<string, { i: string; o: string; c: "USD" | "IDR" }>>({});

  const rowOf = (m: string) => draft[m] ?? {
    i: String(prices?.[m]?.inputPerMillion ?? ""),
    o: String(prices?.[m]?.outputPerMillion ?? ""),
    c: prices?.[m]?.currency ?? "USD",
  };
  return (
    <details className="usage-prices">
      <summary>
        Harga model (indikator biaya) — per 1 juta token
      </summary>
      <p className="pane-hint">
        Isi sesuai tagihan provider-mu. Model tanpa harga tidak dihitung biayanya (bukan nol) — angka token metering
        tetap akurat apa pun.
      </p>
      <table className="usage-table" aria-label="Harga per model">
        <thead>
          <tr>
            <th>Model</th>
            <th>Masuk / 1jt</th>
            <th>Keluar / 1jt</th>
            <th> Mata uang</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="dim">
                Belum ada model tercatat — kirim satu turn chat dulu.
              </td>
            </tr>
          ) : (
            rows.map((m) => {
              const r = rowOf(m);
              const commit = () =>
                void onSave(m, {
                  inputPerMillion: Number(r.i) || 0,
                  outputPerMillion: Number(r.o) || 0,
                  currency: r.c,
                });
              return (
                <tr key={m}>
                  <td>
                    <code>{m}</code>
                  </td>
                  <td>
                    <input
                      className="price-input"
                      inputMode="decimal"
                      value={r.i}
                      placeholder="—"
                      onChange={(e) => setDraft((d) => ({ ...d, [m]: { ...r, i: e.target.value } }))}
                      onBlur={commit}
                    />
                  </td>
                  <td>
                    <input
                      className="price-input"
                      inputMode="decimal"
                      value={r.o}
                      placeholder="—"
                      onChange={(e) => setDraft((d) => ({ ...d, [m]: { ...r, o: e.target.value } }))}
                      onBlur={commit}
                    />
                  </td>
                  <td>
                    <select
                      value={r.c}
                      onChange={(e) => {
                        const c = e.target.value as "USD" | "IDR";
                        setDraft((d) => ({ ...d, [m]: { ...r, c } }));
                        void onSave(m, { inputPerMillion: Number(r.i) || 0, outputPerMillion: Number(r.o) || 0, currency: c });
                      }}
                    >
                      <option value="USD">USD</option>
                      <option value="IDR">IDR</option>
                    </select>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </details>
  );
}
