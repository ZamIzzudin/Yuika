// @yuika/core, SCR-6 (Batch 14b): QA watch tools untuk persona QA (Sherlock).
// Sherlock MENONTON live screen persona lain (read-only, tanpa lease) dan
// mencatat hasil verifikasi sebagai event qa.check, NON-BLOCKING: tidak ada
// approval/gate, murni sinyal kualitas utk activity feed (tab Logs) dan
// laporan QA pasca-run.
import { z } from "zod";
import type { ToolResult } from "../registry.js";
import type { ToolContext } from "../registry.js";
import { registry } from "../registry.js";
import { moduleLogger } from "../logger.js";
import { qaWatch, screenSnapshot, listScreens } from "../screen/manager.js";
import { redactActive } from "../vault/redact.js";

const log = moduleLogger("qa");

// SCR-6/14c: resolusi target pintar, persona id BUKAN nama tampilan (Hiro
// = yui-coder) dan sesi target bisa hidup di project lain. Pola:
//   "project/personaId" → key penuh apa adanya
//   "personaId"         → cari di seluruh sesi aktif; unik → pakai (cross-project OK,
//                         baca read-only); ambigu → daftar pilihan; tidak ada →
//                         daftar semua screen aktif supaya pemanggil self-correct.
type ScreenBrief = { key: string; personaId: string; url: string; title: string; status: string };

type Resolved =
  | { key: string; crossProject?: boolean }
  | { error: string; hint: string; activeScreens: ScreenBrief[] };

function brief(s: { key: string; personaId: string; url: string; title: string; status: string }): ScreenBrief {
  return { key: s.key, personaId: s.personaId, url: s.url, title: s.title, status: s.status };
}

function resolveScreenTarget(projectId: string, target: string): Resolved {
  if (target.includes("/")) return { key: target };
  const matches = listScreens().filter((s) => s.personaId === target);
  if (matches.length === 1) {
    const m = matches[0]!;
    return { key: m.key, crossProject: m.projectId !== projectId };
  }
  if (matches.length > 1) {
    return {
      error: `persona '${target}' has ${matches.length} active screens across projects`,
      hint: "Pass the full key 'project/personaId' of the one you mean.",
      activeScreens: matches.map(brief),
    };
  }
  const all = listScreens().map(brief);
  return {
    error: `no active screen for '${target}' (persona ids are technical, e.g. Hiro is 'yui-coder', not the display name)`,
    hint: all.length
      ? "No session for that persona id. Active screens are listed, retry with the exact persona id or a full 'project/personaId' key."
      : "There are no active screen sessions at all right now, the target must open its browser first, then retry.",
    activeScreens: all,
  };
}

function registerQaTools(): void {
  registry.register({
    name: "qa_watch",
    description:
      "Watch another persona's live screen as a QA observer (read-only, no control taken). While you watch, the target session stays alive. Turn off with on=false when done. Then read the screen with qa_snapshot.",
    parameters: z.object({
      target: z.string().min(1).describe("Persona id whose screen to watch, e.g. yui-coder"),
      on: z.boolean().optional().describe("true = start watching (default), false = stop"),
    }),
    handler: async (args: { target: string; on?: boolean }, ctx: ToolContext): Promise<ToolResult> => {
      if (!ctx.projectId) return { isError: true, result: { error: "qa tools require a project context" } };
      const resolved = resolveScreenTarget(ctx.projectId, args.target);
      if ("error" in resolved) {
        // stop (on=false) pada sesi yang sudah mati → idempoten, bukan error
        if (args.on === false) return { result: { watching: false, target: args.target, note: "no active session, nothing to stop" } };
        return { isError: true, result: resolved };
      }
      try {
        const state = qaWatch(resolved.key, ctx.personaId ?? "user", args.on ?? true);
        return {
          result: {
            watching: args.on ?? true,
            target: resolved.key,
            ...(resolved.crossProject ? { crossProject: true } : {}),
            state: { url: state.url, title: state.title, status: state.status, watchers: state.watchers },
          },
        };
      } catch (e) {
        return {
          isError: true,
          result: {
            error: e instanceof Error ? e.message : String(e),
            hint: "The target persona has no active screen session, ask it to open one (or wait) and retry.",
          },
        };
      }
    },
  });

  registry.register({
    name: "qa_snapshot",
    description:
      "Read-only snapshot of another persona's live screen (same view as browser_snapshot, but for the target persona's session, no lease involved). Password fields are always masked.",
    parameters: z.object({
      target: z.string().min(1).describe("Persona id whose screen to read, e.g. yui-coder"),
    }),
    handler: async (args: { target: string }, ctx: ToolContext): Promise<ToolResult> => {
      if (!ctx.projectId) return { isError: true, result: { error: "qa tools require a project context" } };
      const resolved = resolveScreenTarget(ctx.projectId, args.target);
      if ("error" in resolved) return { isError: true, result: resolved };
      try {
        const snap = await screenSnapshot(resolved.key);
        // defense-in-depth (pola browser_snapshot): scrub active secret
        return { result: JSON.parse(redactActive(JSON.stringify(snap))) };
      } catch (e) {
        return {
          isError: true,
          result: {
            error: e instanceof Error ? e.message : String(e),
            hint: "The target persona has no active screen session, qa_watch first, then retry.",
          },
        };
      }
    },
  });

  registry.register({
    name: "qa_check",
    description:
      "Record one QA verdict about what you are observing (a persona's screen, a file, a command result). Non-blocking, it lands in the project activity feed as a quality signal. Call it per checklist item, honestly: reproduce before you verify, isolate before you blame.",
    parameters: z.object({
      item: z.string().min(1).max(120).describe("Short check name, e.g. 'login form accepts valid creds'"),
      status: z.enum(["pass", "fail", "warn"]).describe("pass | fail | warn"),
      note: z.string().max(500).optional().describe("Evidence / observation, one line"),
      target: z.string().optional().describe("Persona id being checked, if applicable"),
    }),
    handler: async (args: { item: string; status: "pass" | "fail" | "warn"; note?: string; target?: string }, ctx: ToolContext): Promise<ToolResult> => {
      if (!ctx.projectId) return { isError: true, result: { error: "qa tools require a project context" } };
      ctx.emit({
        type: "qa.check",
        projectId: ctx.projectId,
        personaId: ctx.personaId ?? "user",
        ...(args.target ? { targetPersonaId: args.target } : {}),
        item: args.item,
        status: args.status,
        ...(args.note ? { note: args.note } : {}),
      });
      log.info({ item: args.item, status: args.status, target: args.target ?? null }, "qa check recorded");
      return { result: { recorded: true, item: args.item, status: args.status } };
    },
  });
}

export { registerQaTools };
