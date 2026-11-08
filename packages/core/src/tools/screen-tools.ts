// @yuika/core, (SCR-2): browser_* tools agent via sesi screen
// SHARED dengan user (satu Chromium per project×persona). Input dikirim ke
// browser yang SAMA yang sedang di-stream ke user, yang dilihat user =
// yang dilihat agent (take control dua arah, ).
//
// Lease: agent tools butuh lease (owner personaId); bila user pegang →
// error jelas + saran request_takeover. browser_snapshot = READ-ONLY,
// tanpa lease (watch bebas).
import { z } from "zod";
import { registry, type ToolContext, type ToolResult } from "../registry.js";
import { moduleLogger } from "../logger.js";
import {
  ensureScreen, screenKey, screenNavigate, screenSnapshot, screenClick,
  screenType, screenPress, screenScroll, takeLease, leaseOwner,
  openTakeoverRequest, listScreens, getScreenState,
  openLoginRequest, screenFillLogin,
} from "../screen/manager.js";
import { getVault } from "../vault/manager.js";
import { redactActive } from "../vault/redact.js";

const log = moduleLogger("tools:screen");

/** Direktori data runtime (dipasang saat register, runtime.ts). */
let dataDir = "";

export function registerScreenTools(opts: { dataDir: string }): void {
  dataDir = opts.dataDir;

  const actorOf = (ctx: ToolContext): string => ctx.personaId ?? "agent";

  const needScreen = async (ctx: ToolContext): Promise<string> => {
    if (!ctx.projectId) throw new Error("screen tools need an active project");
    const key = screenKey(ctx.projectId, actorOf(ctx));
    const created = !getScreenState(key);
    if (created) {
      const st = await ensureScreen(dataDir, ctx.projectId, actorOf(ctx));
      // sesi baru → agent otomatis pegang lease (pelopor pembuka)
      if (st.leaseOwner === null) takeLease(key, actorOf(ctx));
      // Bubble chat (SCR-3 follow-up): beri tahu user browser hidup,
      // tombol "Open Browser" membuka floating window.
      ctx.emit({
        type: "screen.state",
        projectId: ctx.projectId,
        personaId: actorOf(ctx),
        status: st.status,
        url: st.url,
        title: st.title,
        leaseOwner: st.leaseOwner ?? actorOf(ctx),
      });
    }
    return key;
  };

  const withScreen = async (ctx: ToolContext, fn: (key: string) => Promise<unknown>): Promise<ToolResult> => {
    try {
      const key = await needScreen(ctx);
      return { result: await fn(key) };
    } catch (e) {
      return { isError: true, result: { error: e instanceof Error ? e.message : String(e) } };
    }
  };

  const openSchema = z.object({ url: z.string().min(1).describe("absolute URL or bare domain") });
  const snapSchema = z.object({});
  const clickSchema = z.object({
    ref: z.number().int().nonnegative().optional().describe("element ref from browser_snapshot"),
    x: z.number().optional().describe("viewport x (alternative to ref)"),
    y: z.number().optional().describe("viewport y (alternative to ref)"),
  });
  const typeSchema = z.object({
    ref: z.number().int().nonnegative(),
    text: z.string().max(4_000),
    submit: z.boolean().optional().describe("press Enter after typing"),
  });
  const scrollSchema = z.object({
    deltaY: z.number().optional().describe("positive scrolls down"),
    deltaX: z.number().optional(),
  });
  const pressSchema = z.object({ key: z.string().min(1).describe("enter|tab|escape|backspace|delete|arrows or single char") });
  const takeoverSchema = z.object({
    reason: z.string().min(1).max(200).describe("short user-facing reason, English"),
  });

  registry.register({
    name: "browser_open",
    description:
      "Navigate the shared live browser (the one the user watches) to a URL. The page opens visibly on the shared screen. Follow up with browser_snapshot to read it.",
    parameters: openSchema,
    handler: (args: { url: string }, ctx) =>
      withScreen(ctx, async (key) => {
        const r = await screenNavigate(key, actorOf(ctx), args.url);
        return { ...r, hint: "call browser_snapshot to read the page" };
      }),
  });

  registry.register({
    name: "browser_snapshot",
    description:
      "Read-only snapshot of the shared screen: URL, title, visible text, and interactive elements with refs for browser_click/browser_type. Does not require control of the screen.",
    parameters: snapSchema,
    handler: (_args: Record<string, never>, ctx) =>
      withScreen(ctx, async (key) => {
        const snap = await screenSnapshot(key);
 // defense-in-depth: scrub active secret (password login terisi
        // via kartu) sebelum hasil masuk konteks model, di luar masking
        // input[type=password] yang sudah dilakukan di sumber snapshot.
        return JSON.parse(redactActive(JSON.stringify(snap)));
      }),
  });

  registry.register({
    name: "browser_click",
    description:
      "Click an interactive element on the shared screen by ref (from browser_snapshot), or at viewport coordinates. Requires control (lease).",
    parameters: clickSchema,
    handler: (args: { ref?: number; x?: number; y?: number }, ctx) =>
      withScreen(ctx, async (key) => {
        if (typeof args.ref === "number") {
          const snap = await screenSnapshot(key);
          const it = snap.items[args.ref];
          if (!it) return { error: `ref ${args.ref} not found, snapshot may be stale, call browser_snapshot again` };
          await screenClick(key, actorOf(ctx), it.x, it.y);
          return { clicked: args.ref, name: it.name ?? null };
        }
        if (typeof args.x === "number" && typeof args.y === "number") {
          await screenClick(key, actorOf(ctx), args.x, args.y);
          return { clicked: [args.x, args.y] };
        }
        return { error: "provide ref, or x and y" };
      }),
  });

  registry.register({
    name: "browser_type",
    description:
      "Click an input by ref to focus it, then type text on the shared screen. Use submit=true to press Enter after typing (e.g. search boxes).",
    parameters: typeSchema,
    handler: (args: { ref: number; text: string; submit?: boolean }, ctx) =>
      withScreen(ctx, async (key) => {
        const snap = await screenSnapshot(key);
        const it = snap.items[args.ref];
        if (!it) return { error: `ref ${args.ref} not found, call browser_snapshot` };
        await screenClick(key, actorOf(ctx), it.x, it.y);
        await screenType(key, actorOf(ctx), args.text);
        if (args.submit) await screenPress(key, actorOf(ctx), "enter");
        return { typed: args.ref, submitted: args.submit ?? false };
      }),
  });

  registry.register({
    name: "browser_scroll",
    description: "Scroll the shared screen page by pixel deltas (positive deltaY scrolls down).",
    parameters: scrollSchema,
    handler: (args: { deltaY?: number; deltaX?: number }, ctx) =>
      withScreen(ctx, async (key) => {
        await screenScroll(key, actorOf(ctx), args.deltaX ?? 0, args.deltaY ?? 0);
        return { scrolled: true };
      }),
  });

  registry.register({
    name: "browser_press",
    description: "Press a key on the shared screen: enter, tab, escape, backspace, delete, arrow keys, or a single character.",
    parameters: pressSchema,
    handler: (args: { key: string }, ctx) =>
      withScreen(ctx, async (key) => {
        await screenPress(key, actorOf(ctx), args.key);
        return { pressed: args.key };
      }),
  });

  registry.register({
    name: "request_takeover",
    description:
      "Show a non-blocking card asking the user to hand over control of the shared screen, use when the user holds control and you need to act, or after they finish a manual step (login, captcha, review). Waits for the answer up to the deadline; expired/denied leaves you read-only (browser_snapshot still works).",
    parameters: takeoverSchema,
    handler: (args: { reason: string }, ctx) =>
      new Promise<ToolResult>((resolve) => {
        void (async () => {
          let key: string;
          try {
            key = await needScreen(ctx);
          } catch (e) {
            resolve({ isError: true, result: { error: e instanceof Error ? e.message : String(e) } });
            return;
          }
          if (leaseOwner(key) === actorOf(ctx)) {
            resolve({ result: { status: "granted", note: "already in control" } });
            return;
          }
          const { requestId, deadline, result } = openTakeoverRequest(key, actorOf(ctx), args.reason);
          ctx.emit({
            type: "takeover.requested",
            requestId,
            projectId: ctx.projectId!,
            personaId: actorOf(ctx),
            reason: args.reason,
            deadlineMs: deadline,
          });
          log.info({ requestId, key }, "takeover requested (waiting)");
          const r = await result;
          ctx.emit({
            type: "takeover.resolved",
            requestId,
            projectId: ctx.projectId!,
            personaId: actorOf(ctx),
            status: r.status,
          });
          resolve(
            r.status === "granted"
              ? { result: { status: "granted", note: "user handed control to you" } }
              : {
                  isError: true,
                  result: {
                    error: `takeover_${r.status}`,
                    status: r.status,
                    hint:
                      r.status === "expired"
                        ? "deadline passed with no answer, you may ask again or continue read-only via browser_snapshot"
                        : "user denied, continue read-only via browser_snapshot",
                  },
                },
          );
        })();
      }),
  });

  registry.register({
    name: "request_login",
    description:
      "Ask the user for login credentials for a site and fill the login form on the shared screen. Values go straight from the user's card into the form (never into your context). If the vault already has saved credentials for this origin they are used silently. Navigate to the login page first.",
    parameters: z.object({
      origin: z.string().min(1).describe("Site origin the login belongs to, e.g. https://accounts.google.com"),
      submit: z.boolean().optional().describe("Submit the form after filling (default true)"),
    }),
    handler: (args: { origin: string; submit?: boolean }, ctx) =>
      new Promise<ToolResult>((resolve) => {
        void (async () => {
          let key: string;
          try {
            key = await needScreen(ctx);
          } catch (e) {
            resolve({ isError: true, result: { error: e instanceof Error ? e.message : String(e) } });
            return;
          }
          const origin = args.origin.replace(/\/+$/, "");
          const name = `login:${origin}`;
 // 1) Vault auto-use : kredensial tersimpan → pakai diam-diam.
          //    Nilai tetap di proses ini (resolveForUse → registerActiveSecret).
          try {
            const used = getVault().resolveForUse(name, { personaId: actorOf(ctx), projectId: ctx.projectId });
            if (used) {
              try {
                const parsed = JSON.parse(used.value) as { user?: string; pass?: string };
                if (parsed.user && parsed.pass) {
                  const fill = await screenFillLogin(key, {
                    user: parsed.user,
                    pass: parsed.pass,
                    submit: args.submit ?? true,
                  });
                  if (fill.ok) {
                    resolve({ result: { status: "filled", source: "vault", submitted: fill.submitted } });
                    return;
                  }
                }
              } finally {
                used.release();
              }
            }
          } catch {
            /* vault tak siap / record rusak → minta user */
          }
          // 2) Kartu login (non-blocking, deadline YUI_LOGIN_TIMEOUT_MS).
          const { requestId, deadline, result } = openLoginRequest(key, actorOf(ctx), origin);
          ctx.emit({
            type: "login.requested",
            requestId,
            projectId: ctx.projectId!,
            personaId: actorOf(ctx),
            origin,
            deadlineMs: deadline,
          });
          log.info({ requestId, origin }, "login requested (waiting)");
          const r = await result;
          ctx.emit({
            type: "login.resolved",
            requestId,
            projectId: ctx.projectId!,
            personaId: actorOf(ctx),
            status: r.status,
            saved: r.saved,
          });
          resolve(
            r.status === "filled"
              ? { result: { status: "filled", source: "user", saved: r.saved, submitted: r.fill?.submitted } }
              : {
                  isError: true,
                  result: {
                    error: `login_${r.status}`,
                    status: r.status,
                    hint:
                      r.status === "skipped"
                        ? "user skipped, ask for an alternative or continue read-only via browser_snapshot"
                        : r.status === "expired"
                          ? "deadline passed with no answer, you may ask again"
                          : "no password field found, navigate to the login form first, then ask again",
                  },
                },
          );
        })();
      }),
  });

  registry.register({
    name: "screen_status",
    description: "List running shared-browser sessions for the current project (status, URL, controller).",
    parameters: snapSchema,
    handler: async (_args: Record<string, never>, ctx) => {
      if (!ctx.projectId) return { isError: true, result: { error: "no active project" } };
      return { result: { screens: listScreens(ctx.projectId) } };
    },
  });
}
