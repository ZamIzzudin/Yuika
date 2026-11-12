// host worker portal: dispatch RemoteAction → runtime (fake) dan
// proyeksi YuiEvent → RemoteEvent (seq + ring resume), lewat SpecRelay nyata
// + koneksi SDK nyata (sama seperti produksi, runtime saja dipalsukan).
// SCR-7: bridge screen JUGA dipalsukan (vi.mock), stream frame sintetis.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { YuiRuntime, } from "@yuika/core";
import type { YuiEvent } from "@yuika/contracts";
import { generateDeviceKeys } from "@yuika/crypto";
import { RelayClient, RelayRemote } from "@yuika/relay-client";
import { nodeSocket } from "@yuika/relay-client/node";
import { createSpecRelay } from "@yuika/relay-client/testing";
import { PortalHostService } from "../portal/service.js";
import type { HostDeviceRecord } from "../portal/store.js";
import { _resetPortalStoreForTests, getHostDevice, saveHostDevice } from "../portal/store.js";

// ── v1.2: terminal manager dipalsukan (jangan spawn shell di CI) ──────
const term = vi.hoisted(() => ({
  input: [] as string[],
  subs: new Map<string, (chunk: string) => void>(),
  replay: "welcome!\n$ ",
}));
vi.mock("@yuika/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yuika/core")>();
  return {
    ...actual,
    ensureTerminalSession: async (workspacePath: string) => ({
      id: "term_test", workspacePath, backend: "local" as const,
      createdAt: 1, lastActivity: 1, exited: false,
    }),
    listTerminalSessions: () => [
      { id: "term_test", backend: "local" as const, workspacePath: "/w", createdAt: 1, lastActivity: 1, exited: false },
    ],
    subscribeTerminal: (id: string, onData: (chunk: string) => void) => {
      term.subs.set(id, onData);
      return { replay: term.replay, unsubscribe: () => { term.subs.delete(id); } };
    },
    writeTerminalInput: (id: string, data: string) => {
      term.input.push(data);
      term.subs.get(id)?.(`out:${data}`);
    },
  };
});

// ── SCR-7: fake screen-bridge (frame sintetis, tanpa browser) ────────────
const scr = vi.hoisted(() => {
  const states = new Map<string, Record<string, unknown>>();
  const subs = new Map<string, { onFrame: (f: unknown) => void; onState: (s: unknown) => void }>();
  return {
    states, subs,
    frame: (key: string, data: string) => ({ key, data, width: 4, height: 4, ts: Date.now() }),
    stateOf: (key: string) => ({
      key, projectId: key.split("/")[0] ?? "p", personaId: key.split("/")[1] ?? "yui",
      status: "running", url: "https://example.com", title: "Example",
      leaseOwner: "yui-coder", viewers: 0, watchers: 0, startedAt: Date.now(),
    }),
  };
});
vi.mock("../portal/screen-bridge.js", () => ({
  getScreenState: (key: string) => scr.states.get(key) ?? null,
  listScreens: () => [...scr.states.values()],
  subscribeScreen: (
    key: string,
    onFrame: (f: unknown) => void,
    onState: (s: unknown) => void,
  ) => {
    if (!scr.states.has(key)) return null;
    scr.subs.set(key, { onFrame, onState });
    return { state: scr.states.get(key), lastFrame: null, unsubscribe: () => { scr.subs.delete(key); } };
  },
}));

const ACC = "acc_test00000000009";
const modes = { approval: "ask" as "ask" | "auto" };
const providerCalls: Array<Record<string, string | null>> = [];

/** Runtime palsu: bus sederhana + pesan tersimpan + turn yang memancar delta. */
function fakeRuntime() {
  const listeners = new Map<string, Array<(e: YuiEvent) => void>>();
  const allListeners: Array<(e: YuiEvent) => void> = [];
  const messages = new Map<string, Array<{ role: string; content: string }>>();
  const uploadsLog: Array<{ target: { sessionId?: string; projectId?: string }; filename: string; bytes: number }> = [];
  const sessions = new Map<string, { personaId: string; projectId?: string | null }>();
  let eventSeq = 0;
  const emit = (sessionId: string, draft: Omit<YuiEvent, "id" | "ts" | "sessionId">) => {
    const e = { ...(draft as object), id: ++eventSeq, ts: Date.now(), sessionId } as YuiEvent;
    for (const l of listeners.get(sessionId) ?? []) l(e);
    for (const l of [...allListeners]) l(e);
  };
  return {
    emit,
    createSession: (personaId: string, projectId?: string | null) => {
      const id = `s_${Math.random().toString(36).slice(2, 10)}`;
      sessions.set(id, { personaId, projectId: projectId ?? null });
      return { sessionId: id, persona: { id: personaId }, projectId: projectId ?? null };
    },
    listRecentSessions: (limit = 20) =>
      [...sessions.entries()].slice(0, limit).map(([sessionId, s]) => ({
        sessionId, title: "t", personaId: s.personaId, updatedAt: 1,
      })),
    store: {
      getMessages: (sessionId: string) => (messages.get(sessionId) ?? []).map((m) => ({
        role: m.role as "user" | "assistant" | "tool", content: m.content,
      })),
      listProjectSessions: (projectId: string) =>
        [...sessions.entries()].filter(([, s]) => (s as { projectId?: string | null }).projectId === projectId)
          .map(([id, s]) => ({ id, personaId: s.personaId, createdAt: 1, lastEventAt: 2, lastEventId: 1 })),
    },
    // ── v1.2 mission-control ────────────────────────────────────────────
    listProjects: () => [{
      id: "p_demo", name: "Demo", description: "d", status: "active",
      rootPath: "projects/p_demo", kind: "project", createdAt: 1, updatedAt: 2,
    }],
    getProject: (id: string) => (id === "p_demo" ? {
      id: "p_demo", name: "Demo", description: "d", status: "active",
      rootPath: "projects/p_demo", kind: "project", createdAt: 1, updatedAt: 2,
    } : undefined),
    listProjectTasks: () => [{ status: "todo" }, { status: "done" }, { status: "doing" }],
    getTaskTree: () => [{
      id: "t1", parent: null, title: "Rencana", status: "todo", assignee: null,
      refs: [], artefak: [], description: null, acceptance: [], dependsOn: [], estimate: null, phase: null, children: [],
    }],
    listProjectFiles: () => [{
      name: "src", relPath: "src", dir: true, size: 0,
      children: [{ name: "main.ts", relPath: "src/main.ts", dir: false, size: 12 }],
    }],
    readProjectFile: (_id: string, rel: string) => ({ content: `body:${rel}`, size: 9, truncated: false }),
    getProjectRoster: () => [{ personaId: "yui-coder", role: "Coder", phases: [], mcp: [] }],
    delegationJobs: () => [{
      id: 1, parentSessionId: "s_p", parentTurnId: "t", childSessionId: "s_c",
      personaId: "yui-coder", goal: "g", status: "running", summary: null, error: null, createdAt: 1, updatedAt: 1,
    }],
    getProjectActivity: () => [{ at: 1, sessionId: "s_c", personaId: "yui-coder", kind: "tool", label: "run_command(npm test)" }],
    getModelRoutes: () => ({
      defaultModel: "m1", defaultFallback: "", overrides: { "yui-coder": { model: "m2" } },
      personas: [{ id: "yui-coder", name: "Hiro Yui" }, { id: "yui-scholar", name: "Pierre Yui" }],
    }),
    updateModelRoute: () => undefined,
    approvalMode: () => modes.approval,
    setApprovalMode: (m: "ask" | "auto") => { modes.approval = m; },
    getBudgetStatus: () => ({
      config: {}, spentToday: 0, spentTotal: 0, burnRatePerHour: 0, activeHolds: 0,
      coverage: "none", currency: null, dailyLimitHit: false, totalLimitHit: false,
    }),
    updateBudget: () => ({ config: {}, spentToday: 0, spentTotal: 0 }),
    getProviderSettings: () => ({
      kind: "openai-compat", baseUrl: "https://api", model: "m1", fallbackModel: "",
      auxModel: "", hasApiKey: true, keyPreview: "…abcd",
    }),
    updateProviderSettings: (input: Record<string, string | null>) => { providerCalls.push(input); },
    mcpServerStatuses: () => [{
      name: "codemagic", declared: true, trusted: true, denyTools: [], connected: true,
      toolCount: 7, tools: [], state: "connected", lastError: null, nextRetryAt: null,
    }],
    mcpRetryConnect: async () => undefined,
    setMcpTrust: async () => undefined,
    getUsageSummary: () => ({ calls: 3, promptTokens: 100, outputTokens: 50, byPersona: [], byModel: [], windowStart: 1 }),
    getUsageMatrix: () => [{ personaId: "yui-coder", model: "m1", calls: 1, promptTokens: 10, outputTokens: 5, cost: 0.001, currency: "USD" }],
    projectWorkspacePath: (id: string) => `/w/${id}`,
    paths: { workspacePath: "/w", dbPath: "/w/demo.db" },
    uploads: uploadsLog,
    writeUpload: async (target: { sessionId?: string; projectId?: string }, filename: string, buf: Buffer) => {
      const sess = sessions.get(target.sessionId ?? "");
      const inProject = sess?.projectId === "p_demo" || target.projectId === "p_demo";
      uploadsLog.push({ target, filename, bytes: buf.length });
      return { path: inProject ? `projects/p_demo/uploads/${filename}` : `uploads/${filename}`, bytes: buf.length };
    },
    runTurn: async (sessionId: string, text: string) => {
      messages.get(sessionId)?.push({ role: "user", content: text });
      emit(sessionId, { type: "message.delta", turnId: "t1", delta: `echo:${text}` } as YuiEvent);
      emit(sessionId, { type: "message.done", turnId: "t1" } as YuiEvent);
      messages.get(sessionId)?.push({ role: "assistant", content: `echo:${text}` });
    },
    subscribeAll: (l: (e: YuiEvent) => void) => { const h = (e: YuiEvent) => l(e); allListeners.push(h); return () => { const i = allListeners.indexOf(h); if (i >= 0) allListeners.splice(i, 1); }; },
    subscribe: (sessionId: string, l: (e: YuiEvent) => void) => {
      const arr = listeners.get(sessionId) ?? [];
      arr.push(l);
      listeners.set(sessionId, arr);
      return () => listeners.set(sessionId, (listeners.get(sessionId) ?? []).filter((x) => x !== l));
    },
    steerDelegation: () => false,
    cancelTurn: () => true,
    resolveApproval: (id: string) => id === "ap_ok",
    emitSessionError: (sessionId: string, message: string) =>
      emit(sessionId, { type: "session.error", message, recoverable: false } as YuiEvent),
  } as unknown as YuiRuntime & { emit: typeof emit; uploads: typeof uploadsLog };
}

let relay: ReturnType<typeof createSpecRelay>;
let svc: PortalHostService;
let remote: RelayRemote;
let rc: RelayClient;
const hostKeys = generateDeviceKeys();
const remoteKeys = generateDeviceKeys();
const events: import("@yuika/contracts").RemoteEvent[] = [];

beforeAll(async () => {
  process.env.YUI_PORTAL_DEVICE_DB = "e2e/.tmp/portal-device-unit.db";
  relay = createSpecRelay({
    devices: [
      { deviceId: hostKeys.deviceId, accountId: ACC, kind: "desktop", name: "Yuika host", signPub: hostKeys.signPub, dhPub: hostKeys.dhPub },
      { deviceId: remoteKeys.deviceId, accountId: ACC, kind: "web", name: "Dev remote", signPub: remoteKeys.signPub, dhPub: remoteKeys.dhPub },
    ],
  });
  await new Promise((r) => setTimeout(r, 300));
  const rt = fakeRuntime();
  (globalThis as unknown as { __rt?: YuiRuntime }).__rt = rt;
  svc = new PortalHostService();
  await svc.start(rt, {
    deviceId: hostKeys.deviceId, accountId: ACC, kind: "desktop", name: "Yuika host",
    signPriv: hostKeys.signPriv, signPub: hostKeys.signPub,
    dhPriv: hostKeys.dhPriv, dhPub: hostKeys.dhPub,
    portalUrl: "http://localhost:3100", relayUrl: relay.url(), linkedAt: Date.now(),
  });

  rc = new RelayClient({
    url: relay.url(), deviceId: remoteKeys.deviceId, signPriv: remoteKeys.signPriv,
    crypto: {
      signChallenge: async (p, d, n) => (await import("@yuika/crypto")).signChallenge(p, d, n),
      seal: async (f, t, pt) => (await import("@yuika/crypto")).seal(f, t, pt),
      open: async (t, f, b) => (await import("@yuika/crypto")).open(t, f, b).toString("utf8"),
    },
    socketFactory: nodeSocket,
  });
  await rc.connect();
  remote = new RelayRemote({
    client: rc, deviceId: remoteKeys.deviceId, dhPriv: remoteKeys.dhPriv, dhPub: remoteKeys.dhPub,
    onEvent: (ev) => events.push(ev),
  });
  await remote.join(hostKeys.deviceId);
});

afterAll(async () => {
  rc?.close();
  await svc?.stop();
  await relay?.close();
  _resetPortalStoreForTests();
});

async function waitUntil(cond: () => boolean, ms = 4_000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("waitUntil timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("portal host worker", () => {
  it("status: linked + remote terlihat", async () => {
    await waitUntil(() => svc.status().remotes.length === 1);
    const st = svc.status();
    expect(st).toMatchObject({ linked: true, accountId: ACC, relayState: "authed" });
    expect(st.remotes[0]).toMatchObject({ deviceId: remoteKeys.deviceId, kind: "web" });
  });

  it("ping_host → pong_host (rid)", async () => {
    await remote.sendAction({ proto: 1, act: "ping_host", rid: "r-ping" });
    await waitUntil(() => events.some((e) => e.ev === "pong_host"));
    expect(events.find((e) => e.ev === "pong_host")).toMatchObject({ rid: "r-ping" });
  });

  it("send_prompt sesi baru → snapshot{rid, sessionId asli} + delta + done (seq naik)", async () => {
    await remote.sendAction({
      proto: 1, act: "send_prompt", rid: "r-1", sessionId: "new", personaId: "yui-scholar",
      message: "halo host",
    });
    await waitUntil(() => events.some((e) => e.ev === "message.done"));
    const snap = events.find((e) => e.ev === "session.snapshot")!;
    expect(snap).toMatchObject({ rid: "r-1" });
    expect(snap.sessionId).toMatch(/^s_/);
    const deltas = events.filter((e) => e.ev === "message.delta");
    expect(deltas.at(-1)).toMatchObject({ sessionId: snap.sessionId, delta: "echo:halo host", seq: 1 });
    expect(events.find((e) => e.ev === "message.done")).toMatchObject({ finish: "stop", seq: 2 });
  });

  it("subscribe{sinceSeq} → snapshot + replay ring delta yang terlewat", async () => {
    const sid = (events.find((e) => e.ev === "session.snapshot") as { sessionId: string }).sessionId;
    events.length = 0;
    await remote.sendAction({ proto: 1, act: "subscribe", rid: "r-2", sessions: [sid], sinceSeq: { [sid]: 1 } });
    await waitUntil(() => events.some((e) => e.ev === "message.done"));
    // replay: hanya seq 2 (done), seq 1 (delta) sudah diterima remote
    expect(events.filter((e) => e.ev === "message.delta")).toHaveLength(0);
    expect(events.some((e) => e.ev === "message.done" && e.seq === 2)).toBe(true);
    // snapshot ikut terkirim (render cepat)
    expect(events.some((e) => e.ev === "session.snapshot" && e.sessionId === sid)).toBe(true);
  });

  it("approve id salah → error unknown_approval (rid)", async () => {
    await remote.sendAction({ proto: 1, act: "approve", rid: "r-3", approvalId: "ap_nope" });
    await waitUntil(() => events.some((e) => e.ev === "error" && e.code === "unknown_approval"));
    expect(events.find((e) => e.ev === "error")).toMatchObject({ rid: "r-3" });
  });

  it("approval.requested di bus → semua remote (tanpa subscribe sesi itu)", async () => {
    const rt = (globalThis as unknown as { __rt: ReturnType<typeof fakeRuntime> }).__rt;
    rt.emit("s_x", { type: "approval.requested", requestId: "ap_1", tool: "run_command", args: { cmd: "npm i" }, reason: "perintah berisiko" } as unknown as YuiEvent);
    await waitUntil(() => events.some((e) => e.ev === "approval.request"));
    expect(events.find((e) => e.ev === "approval.request")).toMatchObject({
      approvalId: "ap_1", title: "run_command", risk: "high",
    });
  });
});

describe("portal host worker, v1.2 mission-control", () => {
  it("list_projects → projects.list (taskStats + sesi per project)", async () => {
    await remote.sendAction({ proto: 1, act: "list_projects", rid: "r-projects" });
    await waitUntil(() => events.some((e) => e.ev === "projects.list"));
    const ev = events.find((e) => e.ev === "projects.list") as unknown as {
      projects: Array<{ project: { id: string }; taskStats: Record<string, number>; activeDelegations: number }>;
    };
    expect(ev.projects).toHaveLength(1);
    expect(ev.projects[0]!.project.id).toBe("p_demo");
    expect(ev.projects[0]!.taskStats).toMatchObject({ todo: 1, done: 1, doing: 1 });
    expect(ev.projects[0]!.activeDelegations).toBe(1);
  });

  it("project.tasks/files/team/activity → reply ber-rid", async () => {
    for (const [act, ev, rid] of [
      ["project.tasks", "project.tasks", "r-tasks"],
      ["project.files", "project.files", "r-files"],
      ["project.team", "project.team", "r-team"],
      ["project.activity", "project.activity", "r-act"],
    ] as const) {
      await remote.sendAction({ proto: 1, act, rid, projectId: "p_demo" } as never);
      await waitUntil(() => events.some((e) => e.ev === ev && (e as { rid?: string }).rid === rid));
    }
    const files = events.find((e) => e.ev === "project.files") as unknown as { tree: Array<{ name: string }> };
    expect(files.tree[0]!.name).toBe("src");
    const team = events.find((e) => e.ev === "project.team") as unknown as {
      roster: Array<{ personaId: string }>; delegations: Array<{ status: string }>;
    };
    expect(team.roster[0]!.personaId).toBe("yui-coder");
    expect(team.delegations[0]!.status).toBe("running");
    const activity = events.find((e) => e.ev === "project.activity") as unknown as { entries: Array<{ label: string }> };
    expect(activity.entries[0]!.label).toContain("run_command");
  });

  it("project.file.read → konten file", async () => {
    await remote.sendAction({ proto: 1, act: "project.file.read", rid: "r-file", projectId: "p_demo", relPath: "src/main.ts" });
    await waitUntil(() => events.some((e) => e.ev === "project.file"));
    expect(events.find((e) => e.ev === "project.file")).toMatchObject({ content: "body:src/main.ts", truncated: false });
  });

  it("project.detail tak dikenal → error unknown_project (rid)", async () => {
    await remote.sendAction({ proto: 1, act: "project.detail", rid: "r-404", projectId: "p_nope" });
    await waitUntil(() => events.some((e) => e.ev === "error" && e.code === "unknown_project"));
  });

  it("personas.list → display name + model override", async () => {
    await remote.sendAction({ proto: 1, act: "personas.list", rid: "r-personas" });
    await waitUntil(() => events.some((e) => e.ev === "personas.list"));
    const ev = events.find((e) => e.ev === "personas.list") as unknown as { personas: Array<{ id: string; name: string; model: string | null }> };
    expect(ev.personas.find((p) => p.id === "yui-scholar")).toMatchObject({ name: "Pierre Yui", model: null });
    expect(ev.personas.find((p) => p.id === "yui-coder")?.model).toBe("m2");
  });

  it("session.create {projectId} → snapshot{rid} + sesi menempel project", async () => {
    await remote.sendAction({ proto: 1, act: "session.create", rid: "r-create", personaId: "yui-scholar", projectId: "p_demo" });
    await waitUntil(() => events.some((e) => e.ev === "session.snapshot" && (e as { rid?: string }).rid === "r-create"));
    const snap = events.find((e) => e.ev === "session.snapshot" && (e as { rid?: string }).rid === "r-create") as unknown as { sessionId: string };
    await remote.sendAction({ proto: 1, act: "project.sessions", rid: "r-ps", projectId: "p_demo" });
    await waitUntil(() => events.some((e) => e.ev === "project.sessions"));
    const ps = events.find((e) => e.ev === "project.sessions") as unknown as { sessions: Array<{ sessionId: string }> };
    expect(ps.sessions.some((s) => s.sessionId === snap.sessionId)).toBe(true);
  });

  it("settings.get → settings.state; update approvalMode → auto terlihat", async () => {
    await remote.sendAction({ proto: 1, act: "settings.get", rid: "r-st" });
    await waitUntil(() => events.some((e) => e.ev === "settings.state"));
    expect(events.find((e) => e.ev === "settings.state")).toMatchObject({ approvalMode: "ask", resetPending: false });
    await remote.sendAction({ proto: 1, act: "settings.update", rid: "r-st2", approvalMode: "auto" });
    await waitUntil(() => events.some((e) => e.ev === "settings.state" && (e as { rid?: string }).rid === "r-st2"));
    expect(events.find((e) => e.ev === "settings.state" && (e as { rid?: string }).rid === "r-st2")).toMatchObject({ approvalMode: "auto" });
  });

  it("settings.usage + settings.mcp", async () => {
    await remote.sendAction({ proto: 1, act: "settings.usage", rid: "r-use" });
    await waitUntil(() => events.some((e) => e.ev === "settings.usage"));
    expect(events.find((e) => e.ev === "settings.usage")).toMatchObject({ rid: "r-use" });
    const usage = events.find((e) => e.ev === "settings.usage") as unknown as { summary: { calls: number } };
    expect(usage.summary.calls).toBe(3);
    await remote.sendAction({ proto: 1, act: "settings.mcp", rid: "r-mcp" });
    await waitUntil(() => events.some((e) => e.ev === "settings.mcp"));
    const mcp = events.find((e) => e.ev === "settings.mcp") as unknown as { servers: Array<{ name: string; state: string }> };
    expect(mcp.servers[0]).toMatchObject({ name: "codemagic", state: "connected" });
  });

  it("provider.update {model} → swap dipanggil + settings.state ack", async () => {
    await remote.sendAction({ proto: 1, act: "provider.update", rid: "r-prov", model: "m9" });
    await waitUntil(() => events.some((e) => e.ev === "settings.state" && (e as { rid?: string }).rid === "r-prov"));
    expect(providerCalls.at(-1)).toMatchObject({ model: "m9" });
  });

  it("terminal.open → state{rid}+replay; input → output; close → lepas", async () => {
    await remote.sendAction({ proto: 1, act: "terminal.open", rid: "r-term", projectId: "p_demo" });
    await waitUntil(() => events.some((e) => e.ev === "terminal.state" && (e as { rid?: string }).rid === "r-term"));
    const ts = events.find((e) => e.ev === "terminal.state" && (e as { rid?: string }).rid === "r-term") as unknown as { id: string; replay: string };
    expect(ts.id).toBe("term_test");
    expect(ts.replay).toContain("welcome!");
    await remote.sendAction({ proto: 1, act: "terminal.input", id: "term_test", data: "ls\n" });
    await waitUntil(() => events.some((e) => e.ev === "terminal.output"));
    expect(events.find((e) => e.ev === "terminal.output")).toMatchObject({ id: "term_test", data: "out:ls\n" });
    await remote.sendAction({ proto: 1, act: "terminal.close", rid: "r-tc", id: "term_test" });
    await new Promise((r) => setTimeout(r, 200));
    expect(term.subs.size).toBe(0);
  });

  it("list_screens → screens.list", async () => {
    scr.states.set("p_scr7/yui-coder", scr.stateOf("p_scr7/yui-coder"));
    await remote.sendAction({ proto: 1, act: "list_screens", rid: "r-scr" });
    await waitUntil(() => events.some((e) => e.ev === "screens.list"));
    const ev = events.find((e) => e.ev === "screens.list") as unknown as { screens: Array<{ key: string }> };
    expect(ev.screens.map((s) => s.key)).toContain("p_scr7/yui-coder");
    scr.states.delete("p_scr7/yui-coder");
  });
});

describe("portal host worker, SCR-7 screen watch", () => {
  const KEY = "p_scr7/yui-coder";

  beforeAll(() => {
    scr.states.set(KEY, scr.stateOf(KEY));
  });

  it("watch_screen → screen.state{rid}; frame dipompa ≤1fps + dedupe", async () => {
    await remote.sendAction({ proto: 1, act: "watch_screen", rid: "r-w1", key: KEY });
    await waitUntil(() => events.some((e) => e.ev === "screen.state" && e.rid === "r-w1"));
    expect(events.find((e) => e.ev === "screen.state" && e.rid === "r-w1")).toMatchObject({
      key: KEY, status: "running", title: "Example",
    });
    // frame AAAA → pump pertama kirim; BBBB → kirim; BBBB lagi → dedupe.
    const h = scr.subs.get(KEY)!;
    h.onFrame(scr.frame(KEY, "AAAA"));
    await waitUntil(() => events.some((e) => e.ev === "screen.frame" && e.data === "AAAA"), 3_000);
    h.onFrame(scr.frame(KEY, "BBBB"));
    await waitUntil(() => events.some((e) => e.ev === "screen.frame" && e.data === "BBBB"), 3_000);
    h.onFrame(scr.frame(KEY, "BBBB")); // identik, tak boleh dobel
    await new Promise((r) => setTimeout(r, 1_400)); // > 1 pump
    const frames = events.filter((e) => e.ev === "screen.frame") as unknown as { data: string }[];
    expect(frames.filter((f) => f.data === "AAAA").length).toBe(1);
    expect(frames.filter((f) => f.data === "BBBB").length).toBe(1);
  }, 12_000);

  it("unwatch_screen → ack screen.state{rid} + unsubscribe (frame berhenti)", async () => {
    await remote.sendAction({ proto: 1, act: "unwatch_screen", rid: "r-uw" });
    await waitUntil(() => events.some((e) => e.ev === "screen.state" && e.rid === "r-uw"));
    expect(scr.subs.has(KEY), "unsubscribe → subs dibersihkan").toBe(false);
  }, 8_000);

  it("watch_screen key tak dikenal → error unknown_screen", async () => {
    await remote.sendAction({ proto: 1, act: "watch_screen", rid: "r-bad", key: "p_x/nope" });
    await waitUntil(() => events.some((e) => e.ev === "error" && e.rid === "r-bad"));
    expect(events.find((e) => e.ev === "error" && e.rid === "r-bad")).toMatchObject({ code: "unknown_screen" });
  });


  it("v1.3 session.upload (2 fragmen) → progress + session.uploaded (scope sesi proyek)", async () => {
    await remote.sendAction({ proto: 1, act: "session.create", rid: "r-u1", personaId: "yui-scholar", projectId: "p_demo" });
    await waitUntil(() => events.some((e) => e.ev === "session.snapshot" && (e as { rid?: string }).rid === "r-u1"));
    const sid = (events.find((e) => e.ev === "session.snapshot" && (e as { rid?: string }).rid === "r-u1") as unknown as { sessionId: string }).sessionId;
    const b64 = Buffer.from("relay upload v13").toString("base64"); // 15 bytes → 20 chars
    const half = 12; // %4 == 0 → dua fragmen base64-valid
    await remote.sendAction({ proto: 1, act: "session.upload", rid: "r-up0", sessionId: sid, name: "note-v13.txt", part: 0, parts: 2, chunk: b64.slice(0, half) });
    await waitUntil(() => events.some((e) => e.ev === "session.upload.progress" && (e as { rid?: string }).rid === "r-up0"));
    expect(events.find((e) => e.ev === "session.upload.progress" && (e as { rid?: string }).rid === "r-up0")).toMatchObject({ received: 1 });
    await remote.sendAction({ proto: 1, act: "session.upload", rid: "r-up1", sessionId: sid, name: "note-v13.txt", part: 1, parts: 2, chunk: b64.slice(half) });
    await waitUntil(() => events.some((e) => e.ev === "session.uploaded" && (e as { rid?: string }).rid === "r-up1"));
    expect(events.find((e) => e.ev === "session.uploaded" && (e as { rid?: string }).rid === "r-up1")).toMatchObject({ path: "projects/p_demo/uploads/note-v13.txt", bytes: 16 });
    const rt = (globalThis as unknown as { __rt: ReturnType<typeof fakeRuntime> }).__rt;
    expect(rt.uploads).toEqual([{ target: { sessionId: sid }, filename: "note-v13.txt", bytes: 16 }]);
  });

  it("v1.3 session.upload nama buruk → error upload_rejected ber-rid", async () => {
    await remote.sendAction({ proto: 1, act: "session.create", rid: "r-u2", personaId: "yui-scholar" });
    await waitUntil(() => events.some((e) => e.ev === "session.snapshot" && (e as { rid?: string }).rid === "r-u2"));
    const sid = (events.find((e) => e.ev === "session.snapshot" && (e as { rid?: string }).rid === "r-u2") as unknown as { sessionId: string }).sessionId;
    await remote.sendAction({ proto: 1, act: "session.upload", rid: "r-badup", sessionId: sid, name: "evil.exe", part: 0, parts: 1, chunk: "QUJD" });
    await waitUntil(() => events.some((e) => e.ev === "error" && (e as { rid?: string }).rid === "r-badup"));
    expect(events.find((e) => e.ev === "error" && (e as { rid?: string }).rid === "r-badup")).toMatchObject({ code: "upload_rejected" });
  });

  it("host.state intro memuat daftar screens (v1.1)", async () => {
    // remote baru menempel → intro; pakai perangkat remote kedua di akun sama
    const keys2 = generateDeviceKeys();
    relay.devices.set(keys2.deviceId, { deviceId: keys2.deviceId, accountId: ACC, kind: "web", name: "Remote 2", signPub: keys2.signPub, dhPub: keys2.dhPub });
    const rc2 = new RelayClient({
      url: relay.url(), deviceId: keys2.deviceId, signPriv: keys2.signPriv,
      crypto: {
        signChallenge: async (p, d, n) => (await import("@yuika/crypto")).signChallenge(p, d, n),
        seal: async (f, t, pt) => (await import("@yuika/crypto")).seal(f, t, pt),
        open: async (t, f, b) => (await import("@yuika/crypto")).open(t, f, b).toString("utf8"),
      },
      socketFactory: nodeSocket,
    });
    await rc2.connect();
    const evs2: import("@yuika/contracts").RemoteEvent[] = [];
    const r2 = new RelayRemote({
      client: rc2, deviceId: keys2.deviceId, dhPriv: keys2.dhPriv, dhPub: keys2.dhPub,
      onEvent: (ev) => evs2.push(ev),
    });
    await r2.join(hostKeys.deviceId);
    await waitUntil(() => evs2.some((e) => e.ev === "host.state" && (e as { screens?: unknown }).screens !== undefined));
    const intro = evs2.find((e) => e.ev === "host.state") as unknown as { screens?: Array<{ key: string }> };
    expect(intro.screens?.map((s) => s.key)).toContain(KEY);
    rc2.close();
  }, 10_000);
});

describe("portal device store", () => {
  it("save/get/clear roundtrip (singleton row)", () => {
    _resetPortalStoreForTests();
    for (const f of ["portal-device-unit.db","portal-device-unit.db-wal","portal-device-unit.shm"]) {
      try { fs.rmSync(path.join("e2e/.tmp", f), { force: true }); } catch { /* WAL lock race di Windows */ }
    }
    _resetPortalStoreForTests();
    expect(getHostDevice()).toBeNull();
    saveHostDevice({
      deviceId: "dev_x", accountId: "acc_y", kind: "desktop", name: "n",
      signPriv: "p1", signPub: "p2", dhPriv: "p3", dhPub: "p4",
      portalUrl: "http://p", relayUrl: "ws://r", linkedAt: 1,
    });
    expect(getHostDevice()).toMatchObject({ deviceId: "dev_x", accountId: "acc_y" });
    saveHostDevice({
      deviceId: "dev_z", accountId: "acc_y", kind: "desktop", name: "n",
      signPriv: "p1", signPub: "p2", dhPriv: "p3", dhPub: "p4",
      portalUrl: "http://p", relayUrl: "ws://r", linkedAt: 2,
    });
    expect(getHostDevice()?.deviceId).toBe("dev_z");
  });
});
