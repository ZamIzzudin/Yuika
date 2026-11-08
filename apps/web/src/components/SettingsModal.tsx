"use client";
import { apiUrl, authFetch, clearAuthToken } from "@/lib/api";
// Settings modal (D38): anotasi kode P0/P1 & hint berlebihan dibuang agar
// bersih; section Usage jadi dashboard informatif (KPI tiles + bar chart
// token per persona + tabel model). Rumah hal yang tak muat di sidebar:
// Provider & Model, MCP & Tools, Usage, Portal, Account.
// DS-1: ui/* + Tailwind semantik + ikon Phosphor (docs/DESIGN-SYSTEM.md).
import { useCallback, useEffect, useState } from "react";
import type { AuthStatusT, ProviderSettings } from "@yuika/contracts";
import {
  Globe,
  Prohibit,
  SignOut,
  UserCircle,
  Warning,
} from "@phosphor-icons/react";
import { McpPanel } from "./McpPanel";
import { PortalSettings } from "./PortalSettings";
import { Skeleton } from "./Skeleton";
import { toastErr, toastOk } from "./ui/toast";
import { Button, Card, Dropdown, Field, Modal, TextInput } from "./ui";

type Section = "provider" | "mcp" | "usage" | "portal" | "account";

const SECTIONS: { id: Section; label: string; hint: string }[] = [
  {
    id: "provider",
    label: "Provider & Model",
    hint: "API key, base URL, model",
  },
  { id: "mcp", label: "MCP & Tools", hint: "catalog, trust, audit" },
  { id: "usage", label: "Usage", hint: "spend, limits, tokens" },
  { id: "portal", label: "Portal", hint: "link devices, remote control" },
];

/** Tile statistik kecil untuk dashboard Usage. */
function Stat({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg2 border border-line bg-surface p-4">
      <span className="text-caption font-semibold uppercase tracking-wide text-dim">
        {label}
      </span>
      <p className="text-title font-semibold text-primary">{value}</p>
      {sub && <p className="text-caption text-muted">{sub}</p>}
      {children}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en-US");
const compact = (n: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("provider");
  const [cfg, setCfg] = useState<ProviderSettings | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [kind, setKind] = useState<"openai-compat" | "anthropic" | "gemini">(
    "openai-compat",
  );
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
          ...(baseUrl.trim() && baseUrl !== cfg?.baseUrl
            ? { baseUrl: baseUrl.trim() }
            : {}),
          ...(model.trim() && model !== cfg?.model
            ? { model: model.trim() }
            : {}),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(fallback.trim()
            ? { fallbackModel: fallback.trim() }
            : cfg?.fallbackModel && !fallback.trim()
              ? { fallbackModel: null }
              : {}),
          ...(aux !== (cfg?.auxModel ?? "")
            ? { auxModel: aux.trim() || null }
            : {}),
        }),
      });
      if (!res.ok) {
        toastErr(
          (((await res.json()) as { error?: string }).error ??
            "failed to save") + "",
        );
        return;
      }
      setApiKey("");
      toastOk("Saved. New sessions use the new config.");
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
                section === s.id
                  ? "bg-hover text-primary"
                  : "text-dim hover:bg-hover hover:text-secondary"
              }`}
            >
              <b className="text-body font-semibold">{s.label}</b>
              <small className="text-caption">{s.hint}</small>
            </button>
          ))}
          <div className="flex-1" />
          <button
            aria-current={section === "account" ? "page" : undefined}
            onClick={() => setSection("account")}
            className="flex cursor-pointer flex-col gap-0.5 rounded-lg2 border border-transparent px-3 py-2.5 text-left transition-colors ease-[var(--ease-out-yui)] duration-[var(--yui-dur-fast)] text-dim hover:bg-hover hover:text-secondary"
          >
            <b className="text-body font-semibold">Account</b>
            <small className="text-caption">portal session, sign out</small>
          </button>
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {section === "provider" && (
            <section
              aria-label="Provider and model"
              className="flex flex-col gap-4"
            >
              {cfg === null ? (
                <Skeleton lines={5} />
              ) : (
                <>
                  <Field label="Provider kind">
                    <Dropdown
                      value={kind}
                      onChange={(v) => setKind(v)}
                      options={[
                        {
                          value: "openai-compat",
                          label: "OpenAI-compatible (GLM / OpenRouter / …)",
                        },
                        { value: "anthropic", label: "Anthropic (Claude)" },
                        { value: "gemini", label: "Google Gemini" },
                      ]}
                    />
                  </Field>
                  <Field label="Base URL">
                    <TextInput
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder={
                        kind === "anthropic"
                          ? "https://api.anthropic.com"
                          : kind === "gemini"
                            ? "https://generativelanguage.googleapis.com"
                            : "https://api.…/v1"
                      }
                      spellCheck={false}
                    />
                  </Field>
                  <Field
                    label="API key"
                    hint={
                      cfg.hasApiKey ? "stored, leave empty to keep" : undefined
                    }
                  >
                    <TextInput
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={cfg.hasApiKey ? "••••••••" : "sk-…"}
                      spellCheck={false}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Primary model">
                      <TextInput
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="glm/glm-5.1"
                        spellCheck={false}
                      />
                    </Field>
                    <Field label="Fallback model (Opsional)">
                      <TextInput
                        value={fallback}
                        onChange={(e) => setFallback(e.target.value)}
                        placeholder="glm/glm-5"
                        spellCheck={false}
                      />
                    </Field>
                  </div>
                  <Field
                    label="Aux model"
                    hint="lightweight tasks, empty = primary"
                  >
                    <TextInput
                      value={aux}
                      onChange={(e) => setAux(e.target.value)}
                      placeholder="glm/glm-5-flash"
                      spellCheck={false}
                    />
                  </Field>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="primary"
                      onClick={() => void save()}
                      disabled={!dirty}
                    >
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
            <section
              aria-label="Usage metering"
              className="flex flex-col gap-5"
            >
              <BudgetDashboard />
              <UsageDashboard />
            </section>
          )}
          {section === "portal" && <PortalSettings />}
          {section === "account" && <AccountPanel />}
        </div>
      </div>
    </Modal>
  );
}

/** Saldo & batas belanja (metering × price book): burn-rate 24 j, hold aktif,
 *  limit harian/total (mode warn/block), rate-limit turn/menit & cap
 *  delegasi paralel. Edit = blur → PUT budget. */
function BudgetDashboard() {
  const [st, setSt] = useState<{
    config: {
      mode: "warn" | "block";
      dailyLimit: number | null;
      totalLimit: number | null;
      maxTurnsPerMinute: number | null;
      maxDelegationConcurrency: number | null;
    };
    spentToday: number;
    spentTotal: number;
    burnRatePerHour: number;
    activeHolds: number;
    coverage: "full" | "partial" | "none";
    currency: "USD" | "IDR" | null;
    dailyLimitHit: boolean;
    totalLimitHit: boolean;
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
    void authFetch(apiUrl("/api/settings/budget"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setSt(s));

  if (!st) return <Skeleton lines={3} />;
  const cur = st.currency ?? "USD";
  const fmtC = (n: number) =>
    `${n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 3 : 0 })} ${cur}`;
  const bar = (spent: number, limit: number | null) => {
    if (!limit) return null;
    const pct = Math.min(100, Math.round((spent / limit) * 100));
    return (
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-pill bg-inset"
        title={`${pct}% of limit`}
      >
        <div
          className={`h-full rounded-pill ${spent >= limit ? "bg-danger" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  };
  const numField = (
    key:
      | "dailyLimit"
      | "totalLimit"
      | "maxTurnsPerMinute"
      | "maxDelegationConcurrency",
    label: string,
    placeholder: string,
  ) => (
    <Field label={label} className="col-span-1">
      <TextInput
        inputMode="decimal"
        placeholder={placeholder}
        value={
          draft[key] ?? (st.config[key] === null ? "" : String(st.config[key]))
        }
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        onBlur={() => {
          if (!(key in draft)) return;
          const raw = draft[key]!.trim();
          const n = Number(raw.replace(",", "."));
          const v =
            raw === "" ? null : Number.isFinite(n) && n > 0 ? n : undefined;
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
      <span className="text-caption font-semibold uppercase tracking-wide text-dim">
        Spend &amp; limits
      </span>
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Today"
          value={fmtC(st.spentToday)}
          sub={
            st.config.dailyLimit !== null
              ? `of ${fmtC(st.config.dailyLimit)}`
              : "no limit"
          }
        >
          {bar(st.spentToday, st.config.dailyLimit)}
        </Stat>
        <Stat
          label="Total"
          value={fmtC(st.spentTotal)}
          sub={
            st.config.totalLimit !== null
              ? `of ${fmtC(st.config.totalLimit)}`
              : "no limit"
          }
        >
          {bar(st.spentTotal, st.config.totalLimit)}
        </Stat>
        <Stat
          label="Burn-rate"
          value={`${fmtC(st.burnRatePerHour)}/h`}
          sub={`active holds ${fmtC(st.activeHolds)}`}
        />
      </div>
      {(st.dailyLimitHit || st.totalLimitHit) && (
        <p
          className={`flex items-center gap-2 rounded-md2 border px-3 py-1.5 text-caption ${st.config.mode === "block" ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-hover text-muted"}`}
        >
          {st.config.mode === "block" ? (
            <Prohibit size={14} aria-hidden />
          ) : (
            <Warning size={14} aria-hidden />
          )}
          {st.config.mode === "block"
            ? "Limit reached, new turns are rejected."
            : "Limit reached, turns keep running."}
        </p>
      )}
      {st.coverage !== "full" && (
        <p className="text-caption text-dim">
          {st.coverage === "none"
            ? "Costs need model prices, set them below."
            : "Some models are unpriced, figures are a lower bound."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {numField("dailyLimit", `Daily limit (${cur})`, "—")}
        {numField("totalLimit", `Total limit (${cur})`, "—")}
        {numField("maxTurnsPerMinute", "Turns / minute", "—")}
        {numField("maxDelegationConcurrency", "Parallel delegations", "3")}
        <Field label="When the limit is reached">
          <Dropdown
            value={st.config.mode}
            onChange={(v) => save({ mode: v })}
            options={[
              { value: "warn", label: "Warn only" },
              { value: "block", label: "Block turns" },
            ]}
          />
        </Field>
      </div>
    </div>
  );
}

/** Metering konsumsi: KPI tiles + bar chart token per persona + tabel per
 *  model + atribusi biaya persona×model, harga dari price book (tanpa harga
 *  = tak dihitung, bukan 0). */
function UsageDashboard() {
  const [data, setData] = useState<{
    summary: {
      calls: number;
      promptTokens: number;
      outputTokens: number;
      byPersona: {
        key: string;
        calls: number;
        promptTokens: number;
        outputTokens: number;
      }[];
      byModel: {
        key: string;
        calls: number;
        promptTokens: number;
        outputTokens: number;
      }[];
      windowStart: number | null;
    };
    recent?: {
      at: number;
      personaId: string;
      model: string;
      promptTokens: number;
      outputTokens: number;
      latencyMs: number;
    }[];
    matrix?: {
      personaId: string;
      model: string;
      calls: number;
      promptTokens: number;
      outputTokens: number;
      cost: number | null;
      currency: "USD" | "IDR" | null;
    }[];
  } | null>(null);
  const [prices, setPrices] = useState<Record<
    string,
    {
      inputPerMillion: number;
      outputPerMillion: number;
      currency: "USD" | "IDR";
    }
  > | null>(null);
  const [hours, setHours] = useState<number>(0); // 0 = semua waktu
  /** Nama tampilan persona (mis. “Hiro Yui”) untuk label chart & tabel. */
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void authFetch(apiUrl("/api/personas"))
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (j: { personas?: { id: string; name: string }[] } | null) =>
          j &&
          setNames(Object.fromEntries(j.personas!.map((p) => [p.id, p.name]))),
      )
      .catch(() => undefined);
  }, []);
  const nameOf = (id: string) => names[id] ?? id.replace("yui-", "");

  const load = useCallback(async () => {
    const since = hours > 0 ? Date.now() - hours * 3_600_000 : undefined;
    const [u, p] = await Promise.all([
      authFetch(
        apiUrl(`/api/usage?recent=8&matrix=1${since ? `&since=${since}` : ""}`),
      ),
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

  /** Estimasi biaya baris model, null bila model tak berharga (jujur, bukan 0). */
  const cost = (m: {
    key: string;
    promptTokens: number;
    outputTokens: number;
  }): number | null => {
    const p = prices?.[m.key];
    if (!p || (!p.inputPerMillion && !p.outputPerMillion)) return null;
    return (
      (m.promptTokens / 1_000_000) * p.inputPerMillion +
      (m.outputTokens / 1_000_000) * p.outputPerMillion
    );
  };
  const pricedCurrency =
    Object.entries(prices ?? {}).find(
      ([, p]) => p.inputPerMillion || p.outputPerMillion,
    )?.[1].currency ?? "USD";
  const fmtCost = (c: number | null) =>
    c === null
      ? "—"
      : `${c.toLocaleString("en-US", { maximumFractionDigits: c < 100 ? 2 : 0 })} ${pricedCurrency}`;
  const totalCost = data
    ? data.summary.byModel.reduce((acc, m) => acc + (cost(m) ?? 0), 0)
    : 0;
  const anyPriced =
    data?.summary.byModel.some((m) => cost(m) !== null) ?? false;

  async function savePrice(
    model: string,
    p: {
      inputPerMillion: number;
      outputPerMillion: number;
      currency: "USD" | "IDR";
    },
  ) {
    const r = await authFetch(apiUrl("/api/settings/models/prices"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, price: p }),
    });
    if (r.ok) setPrices(await r.json());
  }

  const Table = ({
    head,
    children,
    label,
  }: {
    head: string[];
    children: React.ReactNode;
    label: string;
  }) => (
    <table className="w-full text-caption" aria-label={label}>
      <thead>
        <tr className="border-b border-line-strong">
          {head.map((h) => (
            <th key={h} className="py-1 pr-3 text-left font-medium text-dim">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );

  if (data === null) return <Skeleton lines={4} />;

  const maxPersona = Math.max(
    ...data.summary.byPersona.map((p) => p.promptTokens + p.outputTokens),
    1,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-dim">
          Consumption
        </span>
        <div className="flex gap-2">
          {[
            [0, "All"],
            [24, "24 h"],
            [1, "1 h"],
          ].map(([h, label]) => (
            <Button
              key={h}
              size="sm"
              active={hours === h}
              onClick={() => setHours(h as number)}
            >
              {label as string}
            </Button>
          ))}
        </div>
      </div>

      {data.summary.calls === 0 ? (
        <Card className="p-4 text-caption leading-5 text-dim">
          No usage recorded yet. Metering is automatic, figures come only from
          provider usage reports.
        </Card>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Model calls" value={fmt(data.summary.calls)} />
            <Stat
              label="Input tokens"
              value={compact(data.summary.promptTokens)}
              sub={fmt(data.summary.promptTokens)}
            />
            <Stat
              label="Output tokens"
              value={compact(data.summary.outputTokens)}
              sub={fmt(data.summary.outputTokens)}
            />
            <Stat
              label="Est. cost"
              value={anyPriced ? fmtCost(totalCost) : "—"}
            />
          </div>

          {/* Bar chart token per persona (in + out stacked) */}
          {data.summary.byPersona.length > 0 && (
            <Card className="flex flex-col gap-2.5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-caption font-semibold uppercase tracking-wide text-dim">
                  Tokens by persona
                </span>
                <span className="flex items-center gap-3 text-caption text-dim">
                  <span className="flex items-center gap-1.5">
                    <i
                      aria-hidden
                      className="inline-block size-2 rounded-xs bg-accent"
                    />
                    input
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i
                      aria-hidden
                      className="inline-block size-2 rounded-xs bg-accent/40"
                    />
                    output
                  </span>
                </span>
              </div>
              {data.summary.byPersona.map((p) => {
                const total = p.promptTokens + p.outputTokens;
                const wIn = (p.promptTokens / maxPersona) * 100;
                const wOut = (p.outputTokens / maxPersona) * 100;
                return (
                  <div key={p.key} className="flex items-center gap-3">
                    <span
                      className="w-24 shrink-0 truncate text-caption text-secondary"
                      title={p.key}
                    >
                      {nameOf(p.key)}
                    </span>
                    <div className="flex h-3 min-w-0 flex-1 overflow-hidden rounded-pill bg-inset">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${wIn}%` }}
                        title={`${fmt(p.promptTokens)} input`}
                      />
                      <div
                        className="h-full bg-accent/40"
                        style={{ width: `${wOut}%` }}
                        title={`${fmt(p.outputTokens)} output`}
                      />
                    </div>
                    <span
                      className="w-14 shrink-0 text-right text-caption tabular-nums text-dim"
                      title={`${fmt(total)} tokens · ${fmt(p.calls)} calls`}
                    >
                      {compact(total)}
                    </span>
                  </div>
                );
              })}
            </Card>
          )}

          {/* Tabel per model */}
          <Card className="p-4">
            <span className="text-caption font-semibold uppercase tracking-wide text-dim">
              By model
            </span>
            <div className="mt-1">
              <Table
                label="Usage per model"
                head={["Model", "Calls", "In", "Out", "Est. cost"]}
              >
                {data.summary.byModel.map((r) => (
                  <tr key={r.key} className="border-b border-line">
                    <td className="py-1 pr-3">
                      <code className="font-mono">{r.key}</code>
                    </td>
                    <td className="py-1 pr-3 tabular-nums">{fmt(r.calls)}</td>
                    <td className="py-1 pr-3 tabular-nums">
                      {fmt(r.promptTokens)}
                    </td>
                    <td className="py-1 pr-3 tabular-nums">
                      {fmt(r.outputTokens)}
                    </td>
                    <td className="py-1 pr-3">{fmtCost(cost(r))}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </Card>

          {/* Atribusi biaya persona × model */}
          {data.matrix && data.matrix.length > 0 && (
            <Card className="p-4">
              <span className="text-caption font-semibold uppercase tracking-wide text-dim">
                Cost attribution (persona × model)
              </span>
              <div className="mt-1">
                <Table
                  label="Persona cost attribution per model"
                  head={["Persona", "Model", "Calls", "Tokens", "Est. cost"]}
                >
                  {data.matrix.map((r) => (
                    <tr
                      key={`${r.personaId}|${r.model}`}
                      className="border-b border-line"
                    >
                      <td className="py-1 pr-3">{nameOf(r.personaId)}</td>
                      <td className="py-1 pr-3">
                        <code className="font-mono">{r.model}</code>
                      </td>
                      <td className="py-1 pr-3 tabular-nums">{fmt(r.calls)}</td>
                      <td className="py-1 pr-3 tabular-nums">
                        {fmt(r.promptTokens + r.outputTokens)}
                      </td>
                      <td className="py-1 pr-3">
                        {r.cost === null
                          ? "—"
                          : `${r.cost.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${r.currency}`}
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            </Card>
          )}

          <PriceBookEditor
            models={data.summary.byModel.map((m) => m.key)}
            prices={prices}
            onSave={savePrice}
          />

          {data.recent && data.recent.length > 0 && (
            <Card className="p-4">
              <span className="text-caption font-semibold uppercase tracking-wide text-dim">
                Recent calls
              </span>
              <div className="mt-1">
                <Table
                  label="Recent calls"
                  head={["Time", "Persona", "Model", "In", "Out", "Latency"]}
                >
                  {data.recent.map((e, i) => (
                    <tr
                      key={`${e.at}|${e.model}|${i}`}
                      className="border-b border-line last:border-0"
                    >
                      <td
                        className="py-1 pr-3 tabular-nums text-dim"
                        title={new Date(e.at).toLocaleString("en-US")}
                      >
                        {new Date(e.at).toLocaleTimeString("en-US", {
                          hour12: false,
                        })}
                      </td>
                      <td className="py-1 pr-3">{nameOf(e.personaId)}</td>
                      <td className="py-1 pr-3">
                        <code className="font-mono">{e.model}</code>
                      </td>
                      <td className="py-1 pr-3 tabular-nums">
                        {fmt(e.promptTokens)}
                      </td>
                      <td className="py-1 pr-3 tabular-nums">
                        {fmt(e.outputTokens)}
                      </td>
                      <td className="py-1 pr-3 tabular-nums text-dim">
                        {e.latencyMs} ms
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/** Editor price book, harga per 1 jt token (in/out) + mata uang.
 *  Baris = model yang terlihat di metering + yang sudah berharga; blur = simpan. */
function PriceBookEditor({
  models,
  prices,
  onSave,
}: {
  models: string[];
  prices: Record<
    string,
    {
      inputPerMillion: number;
      outputPerMillion: number;
      currency: "USD" | "IDR";
    }
  > | null;
  onSave: (
    model: string,
    p: {
      inputPerMillion: number;
      outputPerMillion: number;
      currency: "USD" | "IDR";
    },
  ) => Promise<void>;
}) {
  const rows = Array.from(
    new Set([...(prices ? Object.keys(prices) : []), ...models]),
  );
  const [draft, setDraft] = useState<
    Record<string, { i: string; o: string; c: "USD" | "IDR" }>
  >({});

  const rowOf = (m: string) =>
    draft[m] ?? {
      i: String(prices?.[m]?.inputPerMillion ?? ""),
      o: String(prices?.[m]?.outputPerMillion ?? ""),
      c: prices?.[m]?.currency ?? "USD",
    };
  return (
    <details className="rounded-md2 border border-line bg-inset px-3 py-2">
      <summary className="cursor-pointer list-none text-caption text-secondary select-none [&::-webkit-details-marker]:hidden">
        Model prices, per 1 million tokens
      </summary>
      <p className="mt-2 text-caption leading-5 text-dim">
        Fill these in from your provider&apos;s invoice. Unpriced models
        contribute no cost (not zero), token metering stays accurate regardless.
      </p>
      <table className="mt-2 w-full text-caption" aria-label="Prices per model">
        <thead>
          <tr className="border-b border-line-strong">
            <th className="py-1 pr-3 text-left font-medium text-dim">Model</th>
            <th className="py-1 pr-3 text-left font-medium text-dim">
              In / 1M
            </th>
            <th className="py-1 pr-3 text-left font-medium text-dim">
              Out / 1M
            </th>
            <th className="py-1 text-left font-medium text-dim">Currency</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-2 text-dim">
                No models recorded yet, send a chat turn first.
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
                  <td className="py-1 pr-3">
                    <code className="font-mono">{m}</code>
                  </td>
                  <td className="py-1 pr-3">
                    <TextInput
                      inputMode="decimal"
                      value={r.i}
                      placeholder="—"
                      className="w-24"
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [m]: { ...r, i: e.target.value },
                        }))
                      }
                      onBlur={commit}
                    />
                  </td>
                  <td className="py-1 pr-3">
                    <TextInput
                      inputMode="decimal"
                      value={r.o}
                      placeholder="—"
                      className="w-24"
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [m]: { ...r, o: e.target.value },
                        }))
                      }
                      onBlur={commit}
                    />
                  </td>
                  <td className="py-1">
                    <Dropdown
                      value={r.c}
                      menuClassName="w-20"
                      onChange={(c) => {
                        setDraft((d) => ({ ...d, [m]: { ...r, c } }));
                        void onSave(m, {
                          inputPerMillion: Number(r.i) || 0,
                          outputPerMillion: Number(r.o) || 0,
                          currency: c,
                        });
                      }}
                      options={[
                        { value: "USD", label: "USD" },
                        { value: "IDR", label: "IDR" },
                      ]}
                    />
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

/** D37: akun portal, rumah tombol sign in/out (dulu pill AuthPill di footer
 *  sidebar). Sesi aktif: email + tombol Sign out (danger); mode terbuka:
 *  ajakan sign-in + tombol portal (CP-3 SSO). */
function AccountPanel() {
  const [status, setStatus] = useState<AuthStatusT | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl("/api/auth/me"));
      if (r.ok) setStatus(await r.json());
    } catch {
      /* offline, tampilkan mode terbuka */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function signOut() {
    clearAuthToken();
    await authFetch(apiUrl("/api/auth/logout"), { method: "POST" }).catch(
      () => undefined,
    );
    window.location.reload();
  }

  /** CP-3 SSO: minta URL authorize portal lalu arahkan browser (PKCE). */
  async function signIn() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await authFetch(apiUrl("/api/auth/portal/start"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirectUri: `${window.location.origin}/auth/callback`,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as {
        authorizeUrl?: string;
        error?: string;
      };
      if (!r.ok || !body.authorizeUrl)
        throw new Error(body.error ?? "portal sign-in unavailable");
      window.location.href = body.authorizeUrl;
    } catch (err) {
      const { toastErr } = await import("./ui/toast");
      toastErr(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (!status) return <Skeleton lines={2} />;
  const user = status.user;
  return (
    <section aria-label="Account" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <b className="text-body font-semibold text-primary">Account</b>
        <p className="text-caption leading-5 text-dim">
          Your Yuika Portal session. Signing in links this device to your portal
          account, the first sign-in on a server closes open mode.
        </p>
      </header>
      {user ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <UserCircle size={28} aria-hidden className="shrink-0 text-dim" />
            <div className="flex min-w-0 flex-col">
              <b className="truncate text-body font-medium text-primary">
                {user.email}
              </b>
              <small className="text-caption text-dim">
                Signed in via Yuika Portal
              </small>
            </div>
          </div>
          <Button
            variant="danger"
            title="Sign out"
            onClick={() => void signOut()}
          >
            <SignOut size={13} aria-hidden /> Sign out
          </Button>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-caption leading-5 text-muted">
            Not signed in. This server runs in open mode, anyone local can use
            it. Sign in with your Yuika Portal account to claim it.
          </p>
          <div>
            <Button disabled={busy} onClick={() => void signIn()}>
              <Globe size={13} aria-hidden />{" "}
              {busy ? "Redirecting…" : "Sign in with Yuika Portal"}
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}
