// @yuika/core, model router ( + ): model & fallback PER PERSONA.
// Sumber resolusi (urut): override file (Settings UI) → persona.yaml
// (model.primary.name / .fallback) → default env (YUI_MODEL + YUI_MODEL_FALLBACK).
// Cooldown: model yang gagal dicap "unhealthy" 5 menit, resolve berikutnya
// langsung ke fallback tanpa mencoba model yang sekarat lagi.
import fs from "node:fs";
import path from "node:path";
import { listPersonas } from "./personas/loader.js";

export interface ModelRoute {
  model: string;
  fallback?: string;
}

export interface ModelOverride {
  model?: string;
  fallback?: string;
}

export type ModelOverrides = Record<string, ModelOverride>;

export function loadModelOverrides(file: string): ModelOverrides {
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as ModelOverrides;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {}; // belum ada file / rusak → mulai kosong (bukan error fatal)
  }
}

export function saveModelOverride(file: string, personaId: string, override: ModelOverride): ModelOverrides {
  const all = loadModelOverrides(file);
  if (override.model?.trim() || override.fallback?.trim()) all[personaId] = { model: override.model?.trim() || undefined, fallback: override.fallback?.trim() || undefined };
  else delete all[personaId]; // kosong = hapus override → ikut default/persona.yaml
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2), "utf-8");
  return all;
}

/** Route persona.yaml: model.primary {name?, fallback?} (opsional, kosong = default). */
function personaRoute(personasDir: string, personaId: string): ModelRoute {
  const p = listPersonas(personasDir).find((x) => x.manifest.id === personaId);
  const primary = p?.manifest.model?.primary as { name?: string; fallback?: string } | undefined;
  return { model: primary?.name ?? "", fallback: primary?.fallback };
}

const COOLDOWN_MS = 5 * 60_000;

export function buildModelRouter(opts: {
  defaultModel: string | (() => string); // getter: default bisa di-swap panas via Settings
  defaultFallback?: string;
  personasDir: string;
  overridesFile: string;
}) {
  const unhealthy = new Map<string, number>(); // model → cooldown sampai (epoch ms)

  return {
    route(personaId: string): ModelRoute {
      const ovr = loadModelOverrides(opts.overridesFile)[personaId] ?? {};
      const py = personaRoute(opts.personasDir, personaId);
      const def = typeof opts.defaultModel === "function" ? opts.defaultModel() : opts.defaultModel;
      let model = ovr.model || py.model || def;
      const fallback = ovr.fallback || py.fallback || opts.defaultFallback;
      // cooldown: primary sekarat → langsung fallback (jangan buang 2 retry + timeout lagi)
      if (unhealthy.get(model) && Date.now() < (unhealthy.get(model) ?? 0) && fallback && fallback !== model) {
        model = fallback;
      }
      return { model, fallback: fallback && fallback !== model ? fallback : undefined };
    },
    markUnhealthy(model: string): void {
      unhealthy.set(model, Date.now() + COOLDOWN_MS);
    },
 /** smoke lulus → bersihkan cooldown (model dipercaya lagi). */
    markHealthy(model: string): void {
      unhealthy.delete(model);
    },
    isCooling(model: string): boolean {
      const until = unhealthy.get(model) ?? 0;
      return Date.now() < until;
    },
  };
}
