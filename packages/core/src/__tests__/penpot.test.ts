/**
 * P2-DSN-2: Penpot RPC connector + tools. fetch di-inject (tanpa network):
 * verifikasi kontrak endpoint (Authorization Token, /api/main/methods/...),
 * unwrap {status:"success",data}, cache revn state, share-link → viewerUrl,
 * pesan jelas saat belum dikonfigurasi / changes invalid.
 */
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerPenpotTools } from "../tools/penpot-tools.js";
import { createPenpotClient, PenpotRpcError, type PenpotFetchLike } from "../penpot/client.js";

let dir: string;
const ctx = () => ({ sessionId: "s", turnId: "t", workspacePath: dir, emit: () => {}, requestApproval: async () => true });

/** Mock Penpot RPC: rekaman calls + responder per method. */
function mockPenpot(respond: Record<string, (params: Record<string, unknown>) => unknown>) {
  const calls: Array<{ method: string; params: Record<string, unknown>; auth?: string }> = [];
  const doFetch: PenpotFetchLike = async (url, init) => {
    const method = url.split("/").pop()!.replace(/^methods\//, "");
    const params = JSON.parse((init?.body as string) ?? "{}") as Record<string, unknown>;
    calls.push({ method, params, auth: (init?.headers as Record<string, string>)?.authorization });
    const handler = respond[method];
    if (!handler) return { ok: false, status: 404, json: async () => ({ code: "not-found" }) };
    const data = handler(params);
    return { ok: true, status: 200, json: async () => ({ status: "success", data }) };
  };
  return { calls, doFetch };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-penpot-"));
  resetRegistryForTests();
  process.env.YUI_PENPOT_URL = "http://penpot.local:9001";
  process.env.YUI_PENPOT_TOKEN = "jwt-token";
});

/** Patch globalThis.fetch (client default) ke mock Penpot; restore otomatis. */
function withPenpotMock(respond: Record<string, (p: Record<string, unknown>) => unknown>, fn: () => Promise<void>): Promise<void> {
  const { calls, doFetch } = mockPenpot(respond);
  const g = globalThis as { fetch?: unknown };
  const orig = g.fetch;
  g.fetch = doFetch as unknown;
  return fn().finally(() => {
    g.fetch = orig;
    return void calls;
  });
}

describe("Penpot client (RPC)", () => {
  it("endpoint + header Authorization Token; unwrap {status:success,data}", async () => {
    const { calls, doFetch } = mockPenpot({
      "get-profile": () => ({ id: "p1", name: "Desainer" }),
    });
    const c = createPenpotClient({ baseUrl: "http://penpot.local:9001/", token: "jwt-token" }, doFetch);
    const profile = (await c.getProfile()) as { id: string };
    expect(profile.id).toBe("p1");
    expect(calls[0]!.method).toBe("get-profile");
    expect(calls[0]!.auth).toBe("Token jwt-token");
  });

  it("error RPC → PenpotRpcError berstatus + kode", async () => {
    const doFetch: PenpotFetchLike = async () => ({ ok: false, status: 403, json: async () => ({ code: "not-authorized", message: "nope" }) });
    const c = createPenpotClient({ baseUrl: "http://p", token: "t" }, doFetch);
    await expect(c.getProfile()).rejects.toMatchObject({ status: 403, code: "not-authorized" });
    await expect(c.getProfile()).rejects.toBeInstanceOf(PenpotRpcError);
  });

  it("viewerUrl: query share-id + index + page-id", () => {
    const c = createPenpotClient({ baseUrl: "http://p:9001/", token: "t" }, (async () => ({ ok: true, status: 200, json: async () => ({}) })) as PenpotFetchLike);
    expect(c.viewerUrl("sh1")).toBe("http://p:9001/?share-id=sh1&index=0");
    expect(c.viewerUrl("sh1", "pg1")).toBe("http://p:9001/?share-id=sh1&index=0&page-id=pg1");
  });

  it("updateFile mengirim id/sessionId/revn/changes dan menangkap revn baru", async () => {
    const { calls, doFetch } = mockPenpot({
      "update-file": () => [{ revn: 7, changes: [] }],
    });
    const c = createPenpotClient({ baseUrl: "http://p", token: "t" }, doFetch);
    const r = await c.updateFile("f1", [{ type: "add-obj", pageId: "pg", obj: { id: "o1" } }], 6);
    expect(r.revn).toBe(7);
    const p = calls[0]!.params;
    expect(p.id).toBe("f1");
    expect(p.revn).toBe(6);
    expect(Array.isArray(p.changes)).toBe(true);
    expect(typeof p.sessionId).toBe("string");
  });
});

describe("Penpot tools (P2-DSN-2)", () => {
  it("tanpa env → pesan konfigurasi jelas (bukan error mentah)", async () => {
    delete process.env.YUI_PENPOT_URL;
    delete process.env.YUI_PENPOT_TOKEN;
    registerPenpotTools(dir);
    const res = await registry.dispatch("penpot_status", {}, ctx());
    expect(res.isError).toBe(true);
    if (res.isError) expect(JSON.stringify(res.result)).toContain("YUI_PENPOT_URL");
  });

  it("setup → create_file (share-link page pertama) → update (revn cache) → get_file", async () => {
    registerPenpotTools(dir);
    await withPenpotMock(
      {
        "get-teams": () => ({ teams: [{ id: "team-1", name: "Studio" }] }),
        "get-projects": () => [],
        "create-project": (p) => ({ id: "proj-1", name: p.name, teamId: p.teamId }),
        "create-file": () => ({ id: "file-1", name: "Mockup", revn: 0, data: { pages: [{ id: "pg-1", name: "Page 1", objects: {} }] } }),
        "create-share-link": (p) => ({ id: "share-1", pages: p.pages }),
        "update-file": () => [{ revn: 3, changes: [] }],
        "get-file": () => ({
          id: "file-1",
          name: "Mockup",
          revn: 3,
          data: { pages: [{ id: "pg-1", name: "Page 1", objects: { o1: { id: "o1", name: "Hero", type: "frame", x: 0, y: 0, width: 120, height: 80 } } }] },
        }),
      },
      async () => {
        const setup = await registry.dispatch("penpot_setup_project", { name: "Yuika Designs" }, ctx());
        expect(setup.isError).toBeFalsy();
        const create = await registry.dispatch("penpot_create_file", { name: "Mockup Dashboard" }, ctx());
        expect(create.isError).toBeFalsy();
        if (!create.isError) {
          const r = create.result as { fileId: string; shareId: string; viewerUrl: string; page: { id: string } };
          expect(r.fileId).toBe("file-1");
          expect(r.shareId).toBe("share-1");
          expect(r.viewerUrl).toContain("share-id=share-1");
          expect(r.viewerUrl).toContain("page-id=pg-1");
        }

        const upd = await registry.dispatch(
          "penpot_update_file",
          { changes: JSON.stringify([{ type: "add-obj", pageId: "pg-1", obj: { id: "o1" } }]) },
          ctx(),
        );
        expect(upd.isError).toBeFalsy();
        if (!upd.isError) {
          const r = upd.result as { revn: number; applied: number; viewerUrl: string };
          expect(r.revn).toBe(3); // cache naik 0 → 3
          expect(r.applied).toBe(1);
        }

        const get = await registry.dispatch("penpot_get_file", {}, ctx());
        expect(get.isError).toBeFalsy();
        if (!get.isError) {
          const r = get.result as { objects: Array<{ id: string; type: string }>; revn: number };
          expect(r.objects[0]).toMatchObject({ id: "o1", type: "frame", name: "Hero" });
          expect(r.revn).toBe(3);
        }
      },
    );
    // revn update kedua memakai cache baru (3) tanpa param — verifikasi via mock terpisah
    const calls2: Array<Record<string, unknown>> = [];
    await withPenpotMock(
      {
        "get-teams": () => ({ teams: [] }),
        "update-file": (p) => {
          calls2.push(p);
          return [{ revn: 4, changes: [] }];
        },
      },
      async () => {
        await registry.dispatch("penpot_update_file", { changes: [{ type: "set-obj", id: "o1" }] }, ctx());
      },
    );
    expect(calls2[calls2.length - 1]!.revn).toBe(3);
  });

  it("changes invalid / tanpa project default → pesan jelas", async () => {
    registerPenpotTools(dir);
    const bad = await registry.dispatch("penpot_update_file", { changes: "[]" }, ctx());
    expect(bad.isError).toBe(true);
    if (bad.isError) expect(JSON.stringify(bad.result)).toContain("changes");

    const noProject = await registry.dispatch("penpot_create_file", { name: "X" }, ctx());
    expect(noProject.isError).toBe(true);
    if (noProject.isError) expect(JSON.stringify(noProject.result)).toContain("penpot_setup_project");
  });
});
