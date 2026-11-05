
"use client";
import { apiUrl, authFetch } from "@/lib/api";
// Settings modal (feedback user sesi dev 9): menu khusus untuk hal yang tidak muat
// di sidebar — seksi: Provider & Model (API key/base URL/model, swap panas),
// MCP (katalog + trust + audit — dulunya sesak di dasar sidebar), + metering.
// DS-1: ui/* + Tailwind semantik + ikon Phosphor (docs/DESIGN-SYSTEM.md).
import { useCallback, useEffect, useState } from "react";
import type { ProviderSettings } from "@yuika/contracts";
import { Check, Prohibit, Warning, X } from "@phosphor-icons/react";
import { McpPanel } from "./McpPanel";
import { PortalSettings } from "./PortalSettings";
import { Skeleton } from "./Skeleton";
import { toastErr, toastOk } from "./ui/toast";
import { Button, Card, Field, Modal, Select, TextInput } from "./ui";

type Section = "provider" | "mcp" | "usage" | "portal";

const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: "provider", label: "Provider & Model", hint: "API key, base URL, model" },
  { id: "mcp", label: "MCP & Tools", hint: "catalog, trust, audit" },
  { id: "usage", label: "Usage", hint: "token usage per persona/model" },
  { id: "portal", label: "Portal", hint: "link devices, remote control" },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("provider");
  const [cfg, setCfg] = useState<ProviderSettings | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [kind, setKind] = useState<"openai-compat" | "anthropic" | "gemini">("openai-compat");
  const [model, setModel] = useState("");
  const [fallback, setFallback] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [aux, setAux] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authFetch(apiUrl("/api/settings/provider"));
      if (res.ok) {
        const c = (await res.json()) as ProviderSettings;
        setCfg(c);
        setBaseUrl(c.baseUrl);
        setModel(c.model);
        setFallback(c.fallbackModel ?? "");
        setKind(c.kind ?? "openai-compat");
        setAux(c.auxModel ?? "");
      }
    } catch {
      /* coba lagi saat buka */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    try {
      const res = await authFetch(apiUrl("/api/settings/provider"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(kind !== (cfg?.kind ?? "openai-compat") ? { kind } : {}),
          ...(baseUrl.trim() && baseUrl !== cfg?.baseUrl ? { baseUrl: baseUrl.trim() } : {}),
          ...(model.trim() && model !== cfg?.model ? { model: model.trim() } : {}),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(fallback.trim() ? { fallbackModel: fallback.trim() } : cfg?.fallbackModel && !fallback.trim() ? { fallbackModel: null } : {}),
          ...(aux !== (cfg?.auxModel ?? "") ? { auxModel: aux.trim() || null } : {}),
        }),
      });
      if (!res.ok) {
        toastErr((((await res.json()) as { error?: string }).error ?? "failed to save") + "");
        return;
      }
      setApiKey("");
      toastOk("Saved — new sessions & turns use the new config (.env updated).");
      await load();
    } catch {
      toastErr("could not reach the server");
    }
  }

  const dirty = Boolean(
    kind !== (cfg?.kind ?? "openai-compat") ||
      aux !== (cfg?.auxModel ?? "") ||
      (baseUrl.trim() && baseUrl !== cfg?.baseUrl) ||
      (model.trim() && model !== cfg?.model) ||
      apiKey.trim() ||
      fallback.trim(),
  );

  return (
    <Modal open onClose={onClose} title="Settings" wide>
      <div className="flex h-[70vh] min-h-0">
        <nav className="flex w-[200px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line p-3">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              aria-current={section === s.id ? "page" : undefined}
              onClick={() => setSection(s.id)}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-lg2 border border-transparent px-3 py-2.5 text-left transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] ${
                section === s.id ? "bg-hover text-primary" : "text-dim hover:bg-hover hover:text-secondary"
              }`}
            >
              <b className="text-body font-semibold">{s.label}</b>
              <small className="text-caption">{s.hint}</small>
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {section === "provider" && (
            <section aria-label="Provider and model" className="flex flex-col gap-4">
              {cfg === null ? (
                <Skeleton lines={5} />
              ) : (
                <>
                  <p className="text-caption text-dim">
                    Stored key: <code className="font-mono">{cfg.hasApiKey ? cfg.keyPreview : "none"}</code> · active:{" "}
                    <code className="font-mono">{cfg.model}</code>
                  </p>
                  <Field label="Provider kind (P1-INF-2)">
                    <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                      <option value="openai-compat">OpenAI-compatible (GLM / OpenRouter / …)</option>
                      <option value="anthropic">Anthropic (Claude)</option>
                      <option value="gemini">Google Gemini</option>
                    </Select>
                  </Field>
                  <Field
                    label={`Base URL (${kind === "anthropic" ? "default: https://api.anthropic.com" : kind === "gemini" ? "default: https://generativelanguage.googleapis.com" : "OpenAI-compatible"})`}
                  >
                    <TextInput
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder={kind === "anthropic" ? "https://api.anthropic.com" : kind === "gemini" ? "https://generativelanguage.googleapis.com" : "https://api.…/v1"}
                      spellCheck={false}
                    />
                  </Field>
                  <Field label={`API key ${cfg?.hasApiKey ? "(leave empty to keep)" : ""}`}>
                    <TextInput type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={cfg?.hasApiKey ? "••••••••" : "sk-…"} spellCheck={false} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Primary model">
                      <TextInput value={model} onChange={(e) => setModel(e.target.value)} placeholder="glm/glm-5.1" spellCheck={false} />
                    </Field>
                    <Field label="Fallback model (optional)" hint="used automatically when the primary model fails (P0-CORE-2)">
                      <TextInput value={fallback} onChange={(e) => setFallback(e.target.value)} placeholder="glm/glm-5" spellCheck={false} />
                    </Field>
                  </div>
                  <Field label="Aux model (optional)" hint="lightweight tasks like memory learning; empty = primary model (P1-INF-3)">
                    <TextInput value={aux} onChange={(e) => setAux(e.target.value)} placeholder="glm/glm-5-flash" spellCheck={false} />
                  </Field>
                  <div className="flex items-center gap-3">
                    <Button variant="primary" onClick={() => void save()} disabled={!dirty}>
                      Save
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}
          {section === "mcp" && (
            <div className="max-w-[640px]">
              <McpPanel />
            </div>
          )}
          {section === "usage" && (
            <section aria-label="Usage metering" className="flex flex-col gap-5">
              <BudgetPanel />
              <UsagePanel />
            </section>
          )}
          {section === "portal" && <PortalSettings />}
        </div>
      </div>
    </Modal>
  );
}

/** P1-MDL: editor model per persona — kosong = ikut default; tersimpan ke
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
    const r = await authFetch(apiUrl("/api/settings/budget"));
    if (r.ok) setSt(await r.json());
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5_000);
    return () => clearInterval(t);
  }, [load]);

  const save = (patch: Record<string, number | "warn" | "block" | null>) =>
    void authFetch(apiUrl("/api/settings/budget"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setSt(s));

  if (!st) return <Skeleton lines={3} />;
  const cur = st.currency ?? "USD";
  const fmtC = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 3 : 0 })} ${cur}`;
  const bar = (spent: number, limit: number | null) => {
    if (!limit) return null;
    const pct = Math.min(100, Math.round((spent / limit) * 100));
    return (
      <div className="relative mt-1 h-4 w-full overflow-hidden rounded-pill bg-inset" title={`${pct}% of limit`}>
        <div className={`h-full rounded-pill ${spent >= limit ? "bg-danger" : "bg-accent"}`} style={{ width: `${pct}%` }} />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-secondary">{pct}%</span>
      </div>
    );
  };
  const numField = (key: "dailyLimit" | "totalLimit" | "maxTurnsPerMinute" | "maxDelegationConcurrency", label: string, placeholder: string) => (
    <Field label={label} className="col-span-1">
      <TextInput
        inputMode="decimal"
        placeholder={placeholder}
        value={draft[key] ?? (st.config[key] === null ? "" : String(st.config[key]))}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        onBlur={() => {
          if (!(key in draft)) return;
          const raw = draft[key]!.trim();
          const n = Number(raw.replace(",", "."));
          const v = raw === "" ? null : Number.isFinite(n) && n > 0 ? n : undefined;
          if (v === undefined) {
            setDraft(({ [key]: _, ...rest }) => rest);
            return; // tidak valid → batal
          }
          save({ [key]: v } as Record<string, number | null>);
          setDraft(({ [key]: _, ...rest }) => rest);
        }}
      />
    </Field>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <span className="text-caption font-semibold tracking-wide text-dim uppercase">Today</span>
          <p className="mt-1 text-body text-primary">
            <b>{fmtC(st.spentToday)}</b>
            {st.config.dailyLimit !== null ? <> / {fmtC(st.config.dailyLimit)}</> : <small className="text-dim"> (no limit)</small>}
          </p>
          {bar(st.spentToday, st.config.dailyLimit)}
        </div>
        <div>
          <span className="text-caption font-semibold tracking-wide text-dim uppercase">Total</span>
          <p className="mt-1 text-body text-primary">
            <b>{fmtC(st.spentTotal)}</b>
            {st.config.totalLimit !== null ? <> / {fmtC(st.config.totalLimit)}</> : <small className="text-dim"> (no limit)</small>}
          </p>
          {bar(st.spentTotal, st.config.totalLimit)}
        </div>
        <div>
          <span className="text-caption font-semibold tracking-wide text-dim uppercase">Burn-rate</span>
          <p className="mt-1 text-body text-primary">
            <b>{fmtC(st.burnRatePerHour)}</b>/h <small className="text-dim">(24 h average)</small>
          </p>
          <p className="text-caption text-muted">Active holds: {fmtC(st.activeHolds)}</p>
        </div>
      </div>
      {(st.dailyLimitHit || st.totalLimitHit) && (
        <p className={`flex items-center gap-2 rounded-md2 border px-3 py-1.5 text-caption ${st.config.mode === "block" ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-hover text-muted"}`}>
          {st.config.mode === "block" ? <Prohibit size={14} aria-hidden /> : <Warning size={14} aria-hidden />}
          {st.config.mode === "block" ? "Limit reached — new turns are REJECTED (block mode)." : "Limit reached (warn mode) — turns keep running."}
        </p>
      )}
      {st.coverage !== "full" && (
        <p className="text-caption text-dim">
          {st.coverage === "none"
            ? "Cost figures need model prices — fill them in the Model Prices editor below."
            : "Some models are unpriced — figures are a lower bound (honest, not zero)."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {numField("dailyLimit", `Daily limit (${cur})`, "— no limit")}
        {numField("totalLimit", `Total limit (${cur})`, "— no limit")}
        {numField("maxTurnsPerMinute", "Turns / minute", "— no limit")}
        {numField("maxDelegationConcurrency", "Parallel delegations", "— default 3")}
        <Field label="When the limit is reached">
          <Select value={st.config.mode} onChange={(e) => save({ mode: e.target.value as "warn" | "block" })}>
            <option value="warn">warn — just warn</option>
            <option value="block">block — reject turns</option>
          </Select>
        </Field>
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
      authFetch(apiUrl(`/api/usage?recent=8&matrix=1${since ? `&since=${since}` : ""}`)),
      authFetch(apiUrl("/api/settings/models/prices")),
    ]);
    if (u.ok) setData(await u.json());
    if (p.ok) setPrices(await p.json());
  }, [hours]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5_000);
    return () => clearInterval(t);
  }, [load]);

  const fmt = (n: number) => n.toLocaleString("en-US");
  /** Estimasi biaya baris model — null bila model tak berharga (jujur, bukan 0). */
  const cost = (m: { key: string; promptTokens: number; outputTokens: number }): number | null => {
    const p = prices?.[m.key];
    if (!p || (!p.inputPerMillion && !p.outputPerMillion)) return null;
    return (m.promptTokens / 1_000_000) * p.inputPerMillion + (m.outputTokens / 1_000_000) * p.outputPerMillion;
  };
  const pricedCurrency = Object.entries(prices ?? {}).find(([, p]) => p.inputPerMillion || p.outputPerMillion)?.[1].currency ?? "USD";
  const fmtCost = (c: number | null) => (c === null ? "—" : `${c.toLocaleString("en-US", { maximumFractionDigits: c < 100 ? 2 : 0 })} ${pricedCurrency}`);
  const totalCost = data ? data.summary.byModel.reduce((acc, m) => acc + (cost(m) ?? 0), 0) : 0;
  const anyPriced = data?.summary.byModel.some((m) => cost(m) !== null) ?? false;

  async function savePrice(model: string, p: { inputPerMillion: number; outputPerMillion: number; currency: "USD" | "IDR" }) {
    const r = await authFetch(apiUrl("/api/settings/models/prices"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, price: p }),
    });
    if (r.ok) setPrices(await r.json());
  }

  const Table = ({ head, children, label }: { head: string[]; children: React.ReactNode; label: string }) => (
    <table className="w-full text-caption" aria-label={label}>
      <thead>
        <tr className="border-b border-line-strong">
          {head.map((h) => (
            <th key={h} className="py-1 pr-3 text-left font-medium text-dim">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {[
          [0, "All"],
          [24, "24 h"],
          [1, "1 h"],
        ].map(([h, label]) => (
          <Button key={h} size="sm" active={hours === h} onClick={() => setHours(h as number)}>
            {label as string}
          </Button>
        ))}
      </div>
      {data === null ? (
        <Skeleton lines={4} />
      ) : data.summary.calls === 0 ? (
        <p className="text-caption text-dim">No usage recorded yet. Metering is automatic — figures come only from provider usage reports (no estimation).</p>
      ) : (
        <>
          <p className="text-caption text-secondary">
            <b className="text-primary">{fmt(data.summary.calls)}</b> model calls · <b className="text-primary">{fmt(data.summary.promptTokens)}</b> input tokens ·{" "}
            <b className="text-primary">{fmt(data.summary.outputTokens)}</b> output tokens
            {anyPriced && (
              <>
                {" "}· est. cost <b className="text-primary">{fmtCost(totalCost)}</b>
              </>
            )}
            {data.summary.windowStart && <span className="text-dim"> (since {new Date(data.summary.windowStart).toLocaleString("en-US")})</span>}
          </p>
          <Table label="Usage per persona" head={["Persona", "Calls", "In tokens", "Out tokens"]}>
            {data.summary.byPersona.map((r) => (
              <tr key={r.key} className="border-b border-line">
                <td className="py-1 pr-3">{r.key.replace("yui-", "")}</td>
                <td className="py-1 pr-3">{fmt(r.calls)}</td>
                <td className="py-1 pr-3">{fmt(r.promptTokens)}</td>
                <td className="py-1 pr-3">{fmt(r.outputTokens)}</td>
              </tr>
            ))}
          </Table>
          <Table label="Usage per model" head={["Model", "Calls", "In tokens", "Out tokens", "Est. cost"]}>
            {data.summary.byModel.map((r) => (
              <tr key={r.key} className="border-b border-line">
                <td className="py-1 pr-3"><code className="font-mono">{r.key}</code></td>
                <td className="py-1 pr-3">{fmt(r.calls)}</td>
                <td className="py-1 pr-3">{fmt(r.promptTokens)}</td>
                <td className="py-1 pr-3">{fmt(r.outputTokens)}</td>
                <td className="py-1 pr-3">{fmtCost(cost(r))}</td>
              </tr>
            ))}
          </Table>
          {data.matrix && data.matrix.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-caption font-semibold tracking-wide text-dim uppercase">Cost attribution (persona × model)</span>
              <Table label="Persona cost attribution per model" head={["Persona", "Model", "Calls", "Tokens", "Est. cost"]}>
                {data.matrix.map((r) => (
                  <tr key={`${r.personaId}|${r.model}`} className="border-b border-line">
                    <td className="py-1 pr-3">{r.personaId.replace("yui-", "")}</td>
                    <td className="py-1 pr-3"><code className="font-mono">{r.model}</code></td>
                    <td className="py-1 pr-3">{fmt(r.calls)}</td>
                    <td className="py-1 pr-3">{fmt(r.promptTokens + r.outputTokens)}</td>
                    <td className="py-1 pr-3">{r.cost === null ? "—" : `${r.cost.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${r.currency}`}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
          <PriceBookEditor models={data.summary.byModel.map((m) => m.key)} prices={prices} onSave={savePrice} />
          {data.recent && data.recent.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-caption font-semibold tracking-wide text-dim uppercase">Recent</span>
              <ul className="flex flex-col gap-0.5 text-caption text-muted">
                {data.recent.map((e, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2">
                    <code className="font-mono">{e.model}</code> · {e.personaId.replace("yui-", "")} · {fmt(e.promptTokens)}+{fmt(e.outputTokens)} tok · {e.latencyMs} ms
                  </li>
                ))}
              </ul>
            </div>
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

  const rowOf = (m: string) =>
    draft[m] ?? {
      i: String(prices?.[m]?.inputPerMillion ?? ""),
      o: String(prices?.[m]?.outputPerMillion ?? ""),
      c: prices?.[m]?.currency ?? "USD",
    };
  return (
    <details className="rounded-md2 border border-line bg-inset px-3 py-2">
      <summary className="cursor-pointer list-none text-caption text-secondary select-none [&::-webkit-details-marker]:hidden">
        Model prices (cost indicator) — per 1 million tokens
      </summary>
      <p className="mt-2 text-caption leading-5 text-dim">
        Fill these in from your provider's invoice. Unpriced models contribute no cost (not zero) — token metering stays accurate regardless.
      </p>
      <table className="mt-2 w-full text-caption" aria-label="Prices per model">
        <thead>
          <tr className="border-b border-line-strong">
            <th className="py-1 pr-3 text-left font-medium text-dim">Model</th>
            <th className="py-1 pr-3 text-left font-medium text-dim">In / 1M</th>
            <th className="py-1 pr-3 text-left font-medium text-dim">Out / 1M</th>
            <th className="py-1 text-left font-medium text-dim">Currency</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-2 text-dim">
                No models recorded yet — send a chat turn first.
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
                <tr key={m} className="border-b border-line last:border-0">
                  <td className="py-1 pr-3"><code className="font-mono">{m}</code></td>
                  <td className="py-1 pr-3">
                    <TextInput
                      inputMode="decimal"
                      value={r.i}
                      placeholder="—"
                      className="h-6 w-24"
                      onChange={(e) => setDraft((d) => ({ ...d, [m]: { ...r, i: e.target.value } }))}
                      onBlur={commit}
                    />
                  </td>
                  <td className="py-1 pr-3">
                    <TextInput
                      inputMode="decimal"
                      value={r.o}
                      placeholder="—"
                      className="h-6 w-24"
                      onChange={(e) => setDraft((d) => ({ ...d, [m]: { ...r, o: e.target.value } }))}
                      onBlur={commit}
                    />
                  </td>
                  <td className="py-1">
                    <Select
                      value={r.c}
                      className="h-6 w-20"
                      onChange={(e) => {
                        const c = e.target.value as "USD" | "IDR";
                        setDraft((d) => ({ ...d, [m]: { ...r, c } }));
                        void onSave(m, { inputPerMillion: Number(r.i) || 0, outputPerMillion: Number(r.o) || 0, currency: c });
                      }}
                    >
                      <option value="USD">USD</option>
                      <option value="IDR">IDR</option>
                    </Select>
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
