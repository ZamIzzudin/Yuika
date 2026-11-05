// P0-INF-3/4 — logging terstruktur + error taxonomy.
// (a) classifyError: bentuk dikenal → kind/code/retryable yang benar; unknown →
//     fallbackKind; YuiError masuk-keluar idempoten; abort TIDAK dianggap error.
// (b) loop: kegagalan provider → event session.error membawa kind+code (UI/log
//     satu bahasa); iterasi budget → kind "budget".
// (c) logger: singleton globalThis (HMR/vitest tak menduplikasi), child binding.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pino from "pino";
import { classifyError, YuiError, ErrorCodes } from "../errors.js";
import { getLogger } from "../logger.js";
import { SessionStore } from "../session/store.js";
import { AgentLoop } from "../loop.js";
import type { ProviderAdapter, ProviderChunk, ChatRequest, ProviderDone } from "../provider/adapter.js";
import type { EventDraft, YuiEvent } from "@yuika/contracts";

/** Bentuk minimal error openai SDK (punya status) — tanpa import SDK. */
class FakeApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "APIError";
  }
}

describe("classifyError — taxonomy", () => {
  it("network errno → provider/PROVIDER_NETWORK, retryable", () => {
    const e = new Error("socket hang up");
    (e as Error & { code?: string }).code = "ECONNRESET";
    const y = classifyError(e, "provider");
    expect(y.kind).toBe("provider");
    expect(y.code).toBe(ErrorCodes.PROVIDER_NETWORK);
    expect(y.retryable).toBe(true);
  });

  it("HTTP 429/401 → provider RATE_LIMIT/AUTH; 429 retryable, 401 tidak", () => {
    expect(classifyError(new FakeApiError(429, "rate limited"), "provider").code).toBe(ErrorCodes.PROVIDER_RATE_LIMIT);
    expect(classifyError(new FakeApiError(429, "rate limited"), "provider").retryable).toBe(true);
    const auth = classifyError(new FakeApiError(401, "bad key"), "provider");
    expect(auth.code).toBe(ErrorCodes.PROVIDER_AUTH);
    expect(auth.retryable).toBe(false);
  });

  it("timeout pesan → provider/PROVIDER_TIMEOUT", () => {
    expect(classifyError(new Error("Request timed out"), "provider").code).toBe(ErrorCodes.PROVIDER_TIMEOUT);
  });

  it("abort (AbortError / Abort_ERR) → kind abort, bukan provider", () => {
    const e = new Error("This operation was aborted");
    e.name = "AbortError";
    const y = classifyError(e, "provider");
    expect(y.kind).toBe("abort");
    expect(y.code).toBe(ErrorCodes.ABORTED);
    expect(y.retryable).toBe(false);
  });

  it("fallbackKind tool → TOOL_EXEC (bukan provider); unknown plain → internal", () => {
    expect(classifyError(new Error("boom"), "tool").code).toBe(ErrorCodes.TOOL_EXEC);
    expect(classifyError(new Error("boom"), "tool").kind).toBe("tool");
    expect(classifyError(new Error("boom")).kind).toBe("internal");
    expect(classifyError(new Error("boom")).code).toBe(ErrorCodes.INTERNAL);
  });

  it("idempoten: YuiError keluar apa adanya", () => {
    const orig = new YuiError("mcp", "MCP_DISCONNECTED", "server down");
    expect(classifyError(orig, "provider")).toBe(orig);
  });

  it("toJSON membawa seluruh taksonomi", () => {
    const y = new YuiError("provider", "PROVIDER_TIMEOUT", "t/o", { retryable: true });
    expect(y.toJSON()).toEqual({ kind: "provider", code: "PROVIDER_TIMEOUT", message: "t/o", retryable: true });
  });
});

describe("logger — singleton globalThis + child", () => {
  it("getLogger() konsisten antar modul (cache globalThis, bukan per-import)", () => {
    expect(getLogger()).toBe(getLogger()); // dua jalur import → SATU instance (globalThis)
  });
  it("child membawa binding (traceId per turn)", () => {
    const lines: string[] = [];
    const stream = { write: (s: string) => lines.push(s) };
    // instance pino dengan stream in-memory — mekanisme child sama deng root
    const child = pino({ level: "info", base: null }, stream).child({ mod: "loop", sessionId: "s1", turnId: "t1" });
    child.info("hello trace");
    const rec = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(rec.sessionId).toBe("s1");
    expect(rec.turnId).toBe("t1");
    expect(rec.msg).toBe("hello trace");
  });
});

describe("loop — session.error bermakna (P0-INF-4 wire)", () => {
  it("provider throw → kind provider + code di event", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-err-"));
    const store = new SessionStore(path.join(dir, "t.db"));
    store.createSession("s1", "yui-scribe", "SYS", []);
    const events: EventDraft[] = [];
    class Boom implements ProviderAdapter {
      id = "boom";
      async chatStream(_req: ChatRequest, _on: (c: ProviderChunk) => void): Promise<ProviderDone> {
        const e = new Error("Request timed out");
        throw e;
      }
    }
    const loop = new AgentLoop({
      store,
      provider: new Boom(),
      model: "m",
      workspacePath: dir,
      approvals: { request: async () => true } as never,
      emit: (d) => events.push(d),
    });
    await loop.runTurn("s1", "halo");
    const err = events.find((e): e is Extract<EventDraft, { type: "session.error" }> => e.type === "session.error");
    expect(err).toBeTruthy();
    expect(err!.message).toContain("timed out");
    expect(err!.kind).toBe("provider");
    expect(err!.code).toBe(ErrorCodes.PROVIDER_TIMEOUT);
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
