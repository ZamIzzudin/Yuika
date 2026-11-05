"use client";
// Modal model per persona — DIPINDAH dari SettingsModal (permintaan user):
// dibuka lewat tombol gear di card identitas page Persona. Berisi form model
// persona aktif (primary + fallback, kosong = ikut default) + tombol
// "Check connection" (smoke test P1-MDL-2: tool-call 2 langkah per model aktif).
// Data: GET/PUT /api/settings/models · POST/GET /api/settings/provider/smoke.
import { useCallback, useEffect, useState } from "react";
import type { ModelRoutes } from "@yui/contracts";
import { Check, X } from "@phosphor-icons/react";
import { Skeleton } from "./Skeleton";
import { Button, Field, Modal, TextInput } from "./ui";
import { toastErr, toastOk } from "./ui/toast";
import { apiUrl } from "@/lib/api";

type Smoke = {
  running: boolean;
  results: { model: string; ok: boolean; latencyMs: number; error: string | null }[];
};

/** Modal setup model untuk SATU persona (persona aktif di stage). */
export function PersonaModelModal({
  personaId,
  personaName,
  onClose,
}: {
  personaId: string;
  personaName: string;
  onClose: () => void;
}) {
  const [routes, setRoutes] = useState<ModelRoutes | null>(null);
  const [model, setModel] = useState("");
  const [fallback, setFallback] = useState("");
  const [saving, setSaving] = useState(false);
  const [smoke, setSmoke] = useState<Smoke | null>(null);

  const loadRoutes = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/settings/models"));
      if (!r.ok) return;
      const d = (await r.json()) as ModelRoutes;
      setRoutes(d);
      const o = d.overrides[personaId];
      setModel(o?.model ?? "");
      setFallback(o?.fallback ?? "");
    } catch {
      /* coba lagi saat buka ulang */
    }
  }, [personaId]);

  const loadSmoke = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/settings/provider/smoke"));
      if (r.ok) setSmoke((await r.json()) as Smoke);
    } catch {
      /* diabaikan */
    }
  }, []);

  useEffect(() => {
    void loadRoutes();
    void loadSmoke();
  }, [loadRoutes, loadSmoke]);

  // smoke berjalan async — poll ringan sampai selesai
  useEffect(() => {
    if (!smoke?.running) return;
    const t = setInterval(() => void loadSmoke(), 3_000);
    return () => clearInterval(t);
  }, [smoke?.running, loadSmoke]);

  async function save() {
    if (!routes) return;
    setSaving(true);
    try {
      const r = await fetch(apiUrl("/api/settings/models"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personaId,
          model: model.trim(),
          fallback: fallback.trim(),
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "failed to save");
      setRoutes((await r.json()) as ModelRoutes);
      toastOk("Saved — the next session uses the new route.");
    } catch (e) {
      toastErr(e instanceof Error ? e.message : "failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function checkConnection() {
    setSmoke({ running: true, results: smoke?.results ?? [] });
    try {
      const r = await fetch(apiUrl("/api/settings/provider/smoke"), { method: "POST" });
      if (r.ok) setSmoke((await r.json()) as Smoke);
    } catch {
      setSmoke(null);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Model — ${personaName}`}>
      {!routes ? (
        <Skeleton lines={3} />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-caption leading-5 text-muted">
            Leave empty to follow the default (<code className="font-mono">{routes.defaultModel}</code>). Children in
            delegations use their own persona&apos;s model.
          </p>
          <Field label="Primary model">
            <TextInput
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={routes.defaultModel}
              spellCheck={false}
            />
          </Field>
          <Field
            label="Fallback model (optional)"
            hint="used automatically when the primary model fails"
          >
            <TextInput
              value={fallback}
              onChange={(e) => setFallback(e.target.value)}
              placeholder={routes.defaultFallback || "—"}
              spellCheck={false}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button onClick={() => void checkConnection()} disabled={smoke?.running}>
              {smoke?.running ? "testing…" : "Check connection"}
            </Button>
          </div>
          {/* hasil smoke — per model aktif */}
          {smoke && smoke.results.length > 0 && (
            <ul className="flex flex-col gap-1" aria-label="Connection check results">
              {smoke.results.map((s) => (
                <li
                  key={s.model}
                  className={`flex items-center gap-1.5 text-caption ${s.ok ? "text-secondary" : "text-danger"}`}
                  title={s.error ?? undefined}
                >
                  {s.ok ? <Check size={12} weight="bold" aria-hidden /> : <X size={12} weight="bold" aria-hidden />}
                  <code className="font-mono">{s.model}</code> · {(s.latencyMs / 1000).toFixed(1)}s
                  {!s.ok && <small className="text-dim"> — automatic fallback engaged</small>}
                </li>
              ))}
            </ul>
          )}
          {smoke && smoke.results.length === 0 && !smoke.running && (
            <small className="text-caption text-dim">
              No results yet — click “Check connection” to test every active model.
            </small>
          )}
        </div>
      )}
    </Modal>
  );
}
