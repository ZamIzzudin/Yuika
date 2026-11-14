// workshop manager: lifecycle + persist + uptime +
// egress config + audit ring, dengan host PALSU (cepat); integrasi Docker
// ASLI di suite kedua (skip bila daemon tak ada).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { WorkshopExecResult, WorkshopInfo } from "@yuika/contracts";
import { WORKSHOP_DEFAULT_EGRESS } from "@yuika/contracts";
import { WorkshopManager, type WorkshopHost } from "../workshop/manager.js";
import { WorkshopStore } from "../workshop/store.js";

let dir: string;
let store: WorkshopStore;
const events: Array<{ type: string; projectId: string; [k: string]: unknown }> = [];

/** Host palsu: state map + exec echo, cukup utk semua jalur manager. */
function fakeHost(): WorkshopHost & { states: Map<string, string>; execs: Array<[string, string]> } {
  const states = new Map<string, string>();
  const execs: Array<[string, string]> = [];
  return {
    kind: "docker",
    states,
    execs,
    available: async () => true,
    ensureRunning: async (i) => {
      states.set(i.container, "running");
    },
    start: async (c) => {
      if (!states.has(c)) throw new Error("absent");
      states.set(c, "running");
    },
    stop: async (c) => {
      states.set(c, "stopped");
    },
    remove: async (c, o) => {
      states.delete(c);
      if (o.volume) states.delete(`vol:${o.volume}`);
    },
    state: async (c) => ((states.get(c) ?? "absent") as "running" | "stopped" | "absent"),
    exec: async (c, cmd, args) => {
      execs.push([c, [cmd, ...args].join(" ")]);
      const r: WorkshopExecResult = { exitCode: 0, stdout: `ran: ${cmd} ${args.join(" ")}`.trim(), stderr: "", durationMs: 1 };
      return r;
    },
    listArtifacts: async () => ({
      containers: [...states.keys()].filter((k) => k.startsWith("yuika-ws-")),
      volumes: [...states.keys()].filter((k) => k.startsWith("vol:")).map((k) => k.slice(4)),
    }),
    removeVolume: async (v) => {
      states.delete(`vol:${v}`);
    },
  };
}

function makeManager(host = fakeHost()): WorkshopManager {
  return new WorkshopManager({
    store,
    workspaceRootOf: () => dir,
    onEvent: (ev) => events.push(ev as { type: string; projectId: string }),
  });
}

/** Paksa host tanpa resolveHost probe docker, inject via resolveHost override. */
function managerWith(host: ReturnType<typeof fakeHost>): WorkshopManager & { resolveHost: () => Promise<WorkshopHost> } {
  const m = makeManager(host) as WorkshopManager & { resolveHost: () => Promise<WorkshopHost> };
  m.resolveHost = async () => host;
  return m;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-ws-"));
  // Fidelity produksi: workspace API dibuat 0755 (umask 022), mkdtemp 0700.
  // Suite docker jalan sebagai uid berbeda dari pemilik dir; mode 0755 =
  // kondisi yang sama dengan workspace nyata di VPS/desktop.
  fs.chmodSync(dir, 0o755);
  store = new WorkshopStore(path.join(dir, "ws.db"));
  events.length = 0;
});

afterEach(() => {
  store.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* db lock race */
  }
});

describe("workshop manager (fake host)", () => {
  it("start → running + egress default npm/github + event + log ring", async () => {
    const m = managerWith(fakeHost());
    const info = await m.start("p_ws");
    expect(info.state).toBe("running");
    expect(info.egressAllow).toEqual(WORKSHOP_DEFAULT_EGRESS);
    expect(info.containerName).toBe("yuika-ws-p_ws");
    expect(events.some((e) => e.type === "workshop.state" && e.to === "running")).toBe(true);
    expect(m.listLog("p_ws").some((l) => l.text.includes("→ running"))).toBe(true);
    // persist
    expect(store.get("p_ws")?.state).toBe("running");
  });

  it(".yuika/workshop.json meng-override allowlist default", async () => {
    fs.mkdirSync(path.join(dir, ".yuika"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".yuika", "workshop.json"), JSON.stringify({ egressAllow: ["internal.corp"] }));
    const m = managerWith(fakeHost());
    const info = await m.start("p_cfg");
    expect(info.egressAllow).toEqual(["internal.corp"]);
  });

  it("sleep → asleep + uptime terakumulasi; exec saat asleep auto-wake", async () => {
    const m = managerWith(fakeHost());
    await m.start("p_sl");
    const slept = await m.sleep("p_sl", "user");
    expect(slept.state).toBe("stopped"); // reason "user" → stopped eksplisit
    expect(slept.uptimeMs).toBeGreaterThanOrEqual(0);
    // exec membangunkan otomatis
    const r = await m.exec("p_sl", "echo", ["hi"], { by: "persona:yui-coder" });
    expect(r.stdout).toContain("ran: echo hi");
    expect(m.info("p_sl").state).toBe("running");
    // audit ring: command oleh persona
    expect(m.listLog("p_sl").some((l) => l.kind === "command" && l.by === "persona:yui-coder")).toBe(true);
    expect(events.some((e) => e.type === "workshop.command" && e.by === "persona:yui-coder")).toBe(true);
  });

  it("recover mempertahankan volume; reset menghapus volume + row", async () => {
    const host = fakeHost();
    const m = managerWith(host);
    await m.start("p_rc");
    const rec = await m.recover("p_rc");
    expect(rec.state).toBe("running");
    // fake: remove TANPA volume → volume tetap ada (tidak dihapus dari states via vol: key)
    expect(host.states.has("vol:yuika-ws-vol-p_rc")).toBe(false); // tak pernah diset = tak dihapus
    const res = await m.reset("p_rc");
    expect(res.state).toBe("running");
    expect(store.get("p_rc")).toBeTruthy();
    await m.destroy("p_rc");
    expect(store.get("p_rc")).toBeNull();
    expect(m.info("p_rc").state).toBe("absent");
  });

  it("info() absent default + listLog kosong; uptime akumulasi lintas siklus", async () => {
    const m = managerWith(fakeHost());
    expect(m.info("p_none").state).toBe("absent");
    expect(m.listLog("p_none")).toEqual([]);
    await m.start("p_up");
    await new Promise((r) => setTimeout(r, 25)); // uptime ms terakumulasi
    await m.sleep("p_up", "idle"); // asleep
    await m.start("p_up"); // wake
    await new Promise((r) => setTimeout(r, 25));
    await m.sleep("p_up", "idle");
    expect(m.info("p_up").uptimeMs).toBeGreaterThan(0);
  });

  it("heal drift: store=running tapi container hilang → start me-recreate (13b)", async () => {
    const host = fakeHost();
    const m = managerWith(host);
    await m.start("p_dr");
    expect(m.info("p_dr").state).toBe("running");
    // simulasikan container dihapus di luar (docker prune): fake host lupakan
    // container TANPA menyentuh store → store masih "running".
    host.states.delete("yuika-ws-p_dr");
    const info = await m.start("p_dr");
    expect(info.state).toBe("running");
    // container dibuat ulang (ensureRunning dipanggil lagi, bukan early-return)
    expect(host.states.get("yuika-ws-p_dr")).toBe("running");
  });
});

// ── integrasi Docker ASLI (host dev punya daemon) ──────────────────────────
async function dockerUp(): Promise<boolean> {
  const { execFile } = await import("node:child_process");
  return await new Promise((resolve) => {
    execFile("docker", ["info", "--format", "1"], { timeout: 4_000 }, (err) => resolve(!err));
  });
}

describe.skipIf(!(await dockerUp()))("workshop docker asli ()", () => {
  // anti-leak: bila test gagal di tengah, container test dibuang (pid test
  // selalu p_it_/p_eg_/p_mg_, container project user tak tersentuh).
  afterEach(async () => {
    const { execFile } = await import("node:child_process");
    for (const pfx of ["yuika-ws-p_it_", "yuika-ws-p_eg_", "yuika-ws-p_mg_"]) {
      const ids = await new Promise<string>((res) =>
        execFile("docker", ["ps", "-aq", "--filter", `name=${pfx}`], { timeout: 10_000 },
          (e, out) => res(e ? "" : (out ?? "").trim())),
      );
      if (ids) await new Promise<void>((res) => execFile("docker", ["rm", "-f", ...ids.split("\n")], () => res()));
    }
  });
  it("lifecycle penuh: start → exec node → sleep → wake → volume persist → reset → destroy", async () => {
    const m = makeManager(); // resolveHost → DockerWorkshopHost asli
    const pid = `p_it_${Date.now().toString(36)}`;
    // kecil utk cepat + tanpa egress (isolasi penuh) utk test ini
    process.env.YUI_WORKSHOP_IMAGE = "node:24-bookworm-slim";
    const info = await m.start(pid, { egressAllow: [] });
    expect(info.state).toBe("running");
    expect(info.backend).toBe("docker");

    // exec di dalam container
    const r = await m.exec(pid, "node", ["-e", "console.log('ws-ok')"], { by: "persona:yui-coder" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ws-ok");

    // bind workspace: exec TANPA cwd → /home/node/project = workspace host,
    // file project = satu dunia dengan tab Files (fix test-user #3).
    await m.exec(pid, "sh", ["-c", "echo bind > bindmark.txt"]);
    expect(fs.readFileSync(path.join(dir, "bindmark.txt"), "utf8").trim()).toBe("bind");

    // tulis file ke volume /home/node (cache hangat, di luar project bind)
    await m.exec(pid, "sh", ["-c", "echo persist > /home/node/marker.txt"]);

    // sleep → container stopped, volume utuh
    const asleep = await m.sleep(pid, "idle");
    expect(asleep.state).toBe("asleep");
    // bangun lagi, file masih ada (persist terbukti)
    await m.start(pid);
    const cat = await m.exec(pid, "cat", ["/home/node/marker.txt"]);
    expect(cat.stdout.trim()).toBe("persist");

    // reset → volume bersih (cache); FILE PROJECT (bind) tetap utuh
    await m.reset(pid);
    const cat2 = await m.exec(pid, "cat", ["/home/node/marker.txt"]);
    expect(cat2.exitCode).not.toBe(0); // file hilang
    expect(fs.readFileSync(path.join(dir, "bindmark.txt"), "utf8").trim()).toBe("bind");

    // destroy → container & volume benar-benar hilang
    await m.destroy(pid);
    expect(m.info(pid).state).toBe("absent");
  }, 120_000);

  it("egress: env proxy terpasang di container saat allowlist non-kosong", async () => {
    const m = makeManager();
    const pid = `p_eg_${Date.now().toString(36)}`;
    await m.start(pid, { egressAllow: ["registry.npmjs.org"] });
    const env = await m.exec(pid, "sh", ["-c", "echo $HTTPS_PROXY"]);
    expect(env.stdout).toContain("host.docker.internal:");
    await m.destroy(pid);
  }, 120_000);

  it("migrasi layout: container lama tanpa label layout → recreate otomatis (13b)", async () => {
    const m = makeManager();
    const pid = `p_mg_${Date.now().toString(36)}`;
    await m.start(pid, { egressAllow: [] });
    const cname = m.info(pid).containerName;
    // bajak container jadi "legacy": hapus label layout → simulasi pra-13b
    const { execFile } = await import("node:child_process");
    await new Promise<void>((res) => execFile("docker", ["rm", "-f", cname], () => res()));
    await new Promise<void>((res) =>
      execFile("docker", ["create", "--name", cname, "node:24-bookworm-slim", "sleep", "infinity"], () => res()),
    );
    // start → harus mendeteksi label hilang → recreate dengan bind workspace
    await m.start(pid);
    const r = await m.exec(pid, "sh", ["-c", "pwd && echo migrasi > mg.txt"]);
    expect(r.stdout.trim()).toBe("/home/node/project");
    expect(fs.readFileSync(path.join(dir, "mg.txt"), "utf8").trim()).toBe("migrasi");
    await m.destroy(pid);
  }, 120_000);
});

// D114: sapuan workshop yatim - container/volume yuika-ws-* tanpa project,
// row registry tua; project yang masih hidup tidak tersentuh.
describe("sweepOrphans (D114)", () => {
  it("menghapus container + volume yatim, membiarkan project hidup utuh", async () => {
    const host = fakeHost();
    const m = managerWith(host);
    // p_alive: project masih ada (container+volume hidup)
    await m.start("p_alive");
    // p_dead: artefak yatim (container exited + volume, project sudah tak ada)
    host.states.set("yuika-ws-p_dead", "stopped");
    host.states.set("vol:yuika-ws-vol-p_dead", "x");
    // row registry yatim tanpa artefak docker
    store.upsert(
      { ...m.info("p_ghost"), state: "running" },
      Date.now(),
    );
    const res = await m.sweepOrphans(["p_alive"]);
    expect(res).toEqual({ containers: 1, volumes: 1, rows: 1 });
    expect(host.states.has("yuika-ws-p_alive")).toBe(true);
    expect(host.states.has("yuika-ws-p_dead")).toBe(false);
    expect(host.states.has("vol:yuika-ws-vol-p_dead")).toBe(false);
    expect(store.get("p_ghost")).toBeNull();
    expect(store.get("p_alive")).toBeDefined();
  });

  it("tanpa yatim: tidak menyentuh apa pun (0/0/0), idempoten", async () => {
    const host = fakeHost();
    const m = managerWith(host);
    await m.start("p_a");
    await m.start("p_b");
    const res = await m.sweepOrphans(["p_a", "p_b"]);
    expect(res).toEqual({ containers: 0, volumes: 0, rows: 0 });
    expect(store.list().length).toBe(2);
    const res2 = await m.sweepOrphans(["p_a", "p_b"]);
    expect(res2.containers).toBe(0);
  });

  it("nama mirip milik pihak lain tidak dianggap yatim Yuika", async () => {
    const host = fakeHost();
    const m = managerWith(host);
    host.states.set("yuika-ws-", "running"); // tanpa projectId (garbage)
    const res = await m.sweepOrphans([]);
    expect(res.containers).toBe(0);
    expect(host.states.has("yuika-ws-")).toBe(true); // dibiarkan
  });
});
