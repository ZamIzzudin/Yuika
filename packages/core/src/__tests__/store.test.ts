// W2-B2 (TASKS.md): session store — id monotonic, replay ?since=, prompt/toolset frozen.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../session/store.js";

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-store-"));
  return new SessionStore(path.join(dir, "test.db"));
}

describe("SessionStore", () => {
  it("appendEvent → id monotonic; getEvents(since) = replay benar", () => {
    const store = makeStore();
    store.createSession("s1", "yui-scholar", "SYS", ["web_fetch"]);
    const e1 = store.appendEvent("s1", { type: "turn.started", turnId: "t1" });
    const e2 = store.appendEvent("s1", { type: "message.delta", turnId: "t1", delta: "ha" });
    const e3 = store.appendEvent("s1", { type: "message.done", turnId: "t1" });
    expect(e2.id).toBeGreaterThan(e1.id);
    expect(e3.id).toBeGreaterThan(e2.id);

    expect(store.getEvents("s1")).toHaveLength(3);
    expect(store.getEvents("s1", e1.id)).toHaveLength(2); // replay sejak e1 (eksklusif)
    expect(store.getEvents("s1", e2.id).map((e) => e.type)).toEqual(["message.done"]);
    // sesi lain terisolasi
    store.createSession("s2", "yui-scribe", "SYS2", []);
    expect(store.getEvents("s2")).toHaveLength(0);
    store.close();
  });

  it("system prompt & toolset FROZEN saat createSession (cache discipline)", () => {
    const store = makeStore();
    store.createSession("s1", "yui-conductor", "PROMPT-V1", ["a", "b"]);
    const s = store.getSession("s1")!;
    expect(s.systemPrompt).toBe("PROMPT-V1");
    expect(s.toolsets).toEqual(["a", "b"]);
    // tidak ada API untuk mutate — verifikasi tak ada method set/update
    const methods = Object.getOwnPropertyNames(SessionStore.prototype);
    expect(methods.filter((m) => /update|set(Session|Prompt|Toolset)/i.test(m))).toEqual([]);
    store.close();
  });

  it("messages append-only: urutan seq naik, tool_calls terserialisasi", () => {
    const store = makeStore();
    store.createSession("s1", "yui-coder", "SYS", []);
    store.appendMessage("s1", { role: "user", content: "halo" });
    store.appendMessage("s1", { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_file", args: { path: "x" } }] });
    store.appendMessage("s1", { role: "tool", content: "{}", toolCallId: "c1" });
    const msgs = store.getMessages("s1");
    expect(msgs).toHaveLength(3);
    expect(msgs[1]!.toolCalls?.[0]!.name).toBe("read_file");
    expect(msgs[2]!.toolCallId).toBe("c1");
    store.close();
  });

  it("P1-PRJ-2: projectId melekat di sesi (nullable); migrasi db lama jalan", () => {
    const store = makeStore();
    store.createSession("s_free", "yui-scholar", "SYS", []);
    store.createSession("s_prj", "yui-coder", "SYS", [], "p_demo123");
    expect(store.getSession("s_free")!.projectId).toBeNull();
    expect(store.getSession("s_prj")!.projectId).toBe("p_demo123");
    store.close();

    // db dibuat dengan schema v0 (tanpa kolom project_id) → dibuka ulang → kolom ditambah
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-store-old-"));
    const dbPath = path.join(dir, "old.db");
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const raw = new Database(dbPath);
    raw.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, persona_id TEXT NOT NULL, system_prompt TEXT NOT NULL, toolsets TEXT NOT NULL, created_at INTEGER NOT NULL)");
    raw.prepare("INSERT INTO sessions VALUES ('s_old','yui-scholar','SYS','[]',1)").run();
    raw.close();
    const reopened = new SessionStore(dbPath); // tidak boleh throw
    expect(reopened.getSession("s_old")!.projectId).toBeNull();
    reopened.close();
  });
});
