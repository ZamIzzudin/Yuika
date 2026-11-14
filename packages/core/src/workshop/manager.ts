// Workshop persisten per project .
// Container yang MENETAP: volume /home/yui persist, tidur (docker stop) /
// bangun (docker start) cepat, egress allowlist via proxy host (reuse
// tools/egress.ts), cap resource + least-privilege (pola sandboxArgv).
//
// WorkshopHost = interface tipis (provider cloud bisa nempel nanti);
// implementasi: DockerWorkshopHost (utama) + LocalWorkshopHost (fallback
// TANPA isolasi, warning eksplisit, setara terminal lokal).
//
// Semua transisi = log ring + event workshop.state (emit hook ke sesi
// pemanggil; REST/UI poll ring utk sumber kebenaran).
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { WorkshopExecResult, WorkshopInfo, WorkshopLogItem, WorkshopState } from "@yuika/contracts";
import { WORKSHOP_DEFAULT_EGRESS, WorkshopConfig } from "@yuika/contracts";
import { moduleLogger } from "../logger.js";
import { getEgressProxy } from "../tools/egress.js";
import { dockerAvailable } from "../tools/sandbox.js";
import type { WorkshopStore } from "./store.js";

const log = moduleLogger("workshop");

// ── WorkshopHost ────────────────────────────────────────────────────────────

export interface HostEnsureInput {
  container: string;
  volume: string;
  memory: string;
  cpus: string;
  pidsLimit: number;
  image: string;
  /** Port proxy egress di host, undefined = --network none. */
  egressProxyPort?: number;
  /** Allowlist (utk log/audit host). */
  egressAllow: string[];
  /** Workspace project di HOST, di-bind ke /home/node/project (nested di
   *  atas volume): file project = satu dunia dengan tab Files & write_file;
   *  volume tetap menampung cache hangat (~/.npm, ~/.cache). */
  workspacePath: string;
}

export interface WorkshopHost {
  kind: "docker" | "local";
  available(): Promise<boolean>;
  /** Buat (bila belum ada) + jalankan container, idempotent. */
  ensureRunning(input: HostEnsureInput): Promise<void>;
  start(container: string): Promise<void>;
  stop(container: string): Promise<void>;
  /** Hapus container; volume ikut bila opts.volume. */
  remove(container: string, opts: { volume?: string }): Promise<void>;
  /** "running" | "stopped" | "absent". */
  state(container: string): Promise<"running" | "stopped" | "absent">;
  exec(container: string, cmd: string, args: string[], opts: { timeoutMs: number; cwd?: string }): Promise<WorkshopExecResult>;
  /** D114: inventori artefak workshop di host (container yuika-ws-* +
   *  volume yuika-ws-vol-*), utk sapuan yatim saat boot. */
  listArtifacts(): Promise<{ containers: string[]; volumes: string[] }>;
  /** D114: hapus volume tanpa container (yatim volume). */
  removeVolume(volume: string): Promise<void>;
}

/** Path docker-friendly (Windows backslash → slash), sama pola sandbox.mountPath. */
function mountPath(ws: string): string {
  return ws.replace(/\\/g, "/");
}

function run(cmd: string, args: string[], timeoutMs = 30_000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null;
      resolve({
        code: typeof e?.code === "number" ? e.code : e ? 1 : 0,
        out: String(stdout ?? ""),
        err: String(stderr ?? ""),
      });
    });
  });
}

/** Docker CLI, pola sandbox.ts (tanpa dependency dockerode). */
export class DockerWorkshopHost implements WorkshopHost {
  kind = "docker" as const;

  async available(): Promise<boolean> {
    // probe bisa kalah oleh load sistem saat ini (timeout 3s), sekali retry
    // sebelum jatuh ke fallback local (workshop di-host-docker itu primernya).
    if (await dockerAvailable(true)) return true;
    await new Promise((r) => setTimeout(r, 800));
    return await dockerAvailable(true);
  }

  async ensureRunning(input: HostEnsureInput): Promise<void> {
    // volume persist (buat bila belum, data lama utuh)
    const v = await run("docker", ["volume", "inspect", input.volume]);
    if (v.code !== 0) {
      const vc = await run("docker", ["volume", "create", input.volume]);
      if (vc.code !== 0) throw new Error(`volume create gagal: ${vc.err}`);
    }
    let st = await this.state(input.container);
    if (st !== "absent") {
      // Migrasi layout: container pra-label (mis. volume /home/yui, tanpa
      // bind workspace) → docker exec -w /home/node/project langsung mati.
      // Buang container (VOLUME diutuhkan, isinya cache; file project di
      // host) lalu buat ulang dengan layout sekarang.
      const lbl = await run("docker", [
        "inspect", "-f", `{{index .Config.Labels "yuika.workshop.layout"}}`, input.container,
      ]);
      if (lbl.code !== 0 || lbl.out.trim() !== WORKSHOP_LAYOUT) {
        log.warn({ container: input.container, label: lbl.out.trim() || "<none>" }, "workshop layout lama → recreate");
        await run("docker", ["rm", "-f", input.container]);
        st = "absent";
      }
    }
    if (st === "absent") {
      const egressOn = input.egressProxyPort !== undefined && input.egressAllow.length > 0;
      const argv = [
        "create",
        "--name", input.container,
        egressOn ? "--add-host" : "--network",
        ...(egressOn ? ["host.docker.internal:host-gateway", "--network", "bridge"] : ["none"]),
        "--memory", input.memory,
        "--cpus", input.cpus,
        "--pids-limit", String(input.pidsLimit),
        "--cap-drop", "ALL",
        // DAC_OVERRIDE + FOWNER: bind workspace dimiliki uid proses host
        // (root di VPS, uid user di desktop Linux, uid runner di CI) — root
        // container TANPA cap ini tidak bisa menulis file yang bukan
        // miliknya (mkdtemp 0700 runner langsung EACCES). Keduanya hanya
        // berlaku di dalam mount namespace container; isolasi utama tetap:
        // SYS_ADMIN/NET_ADMIN dll tetap drop, network none, pids limit.
        "--cap-add", "DAC_OVERRIDE",
        "--cap-add", "FOWNER", // npm/tar set mtime file yang bukan miliknya
        "--security-opt", "no-new-privileges",
        // ROOT, bukan uid 1000: bind workspace (/home/node/project) dimiliki
        // uid pemilik proses host (root di deploy, uid user di runner CI) —
        // uid tetap 1000 akan EACCES menulis file project (bug ketemu CI
        // runner uid 1001). Threat model sama dengan sandbox run-command:
        // root TANPA capability + no-new-privileges + network none (lihat
        // sandbox.ts) — eskalasi keluar container tetap tertutup.
        // Konsekuensi positif: volume cache /home/node (warisan image uid
        // 1000) juga bisa ditulis tanpa ritual chown.
        "-v", `${input.volume}:/home/node`,
        // Nested bind: FILES PROJECT = workspace host (rw), satu dunia
        // dengan tab Files / write_file / run_command sandbox (/workspace).
        "-v", `${mountPath(input.workspacePath)}:/home/node/project:rw`,
        "-w", "/home/node/project",
        `--label=yuika.workshop.layout=${WORKSHOP_LAYOUT}`,
      ];
      if (egressOn) {
        const proxy = `http://host.docker.internal:${input.egressProxyPort}`;
        for (const [k, val] of [
          ["HTTP_PROXY", proxy], ["HTTPS_PROXY", proxy],
          ["http_proxy", proxy], ["https_proxy", proxy],
          ["NO_PROXY", "localhost,127.0.0.1"],
        ] as const) argv.push("-e", `${k}=${val}`);
      }
      argv.push(input.image, "sleep", "infinity");
      const c = await run("docker", argv);
      if (c.code !== 0) throw new Error(`container create gagal: ${c.err || c.out}`);
    }
    if (st !== "running") await this.start(input.container);
  }

  async start(container: string): Promise<void> {
    const r = await run("docker", ["start", container]);
    if (r.code !== 0) throw new Error(`start gagal: ${r.err}`);
  }

  async stop(container: string): Promise<void> {
    const r = await run("docker", ["stop", "-t", "5", container]);
    if (r.code !== 0) throw new Error(`stop gagal: ${r.err}`);
  }

  async remove(container: string, opts: { volume?: string }): Promise<void> {
    await run("docker", ["rm", "-f", container]);
    if (opts.volume) await run("docker", ["volume", "rm", opts.volume]);
  }

  async listArtifacts(): Promise<{ containers: string[]; volumes: string[] }> {
    // Filter name= prefix-match di docker CLI; startsWith JS memastikan hanya
    // artefak Yuika workshop yang dianggap (bukan container lain mirip nama).
    const c = await run("docker", ["ps", "-a", "--format", "{{.Names}}", "--filter", "name=yuika-ws-"], 15_000);
    const v = await run("docker", ["volume", "ls", "--format", "{{.Name}}", "--filter", "name=yuika-ws-vol-"], 15_000);
    return {
      containers: c.code === 0 ? c.out.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.startsWith("yuika-ws-")) : [],
      volumes: v.code === 0 ? v.out.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.startsWith("yuika-ws-vol-")) : [],
    };
  }

  async removeVolume(volume: string): Promise<void> {
    await run("docker", ["volume", "rm", volume]);
  }

  async state(container: string): Promise<"running" | "stopped" | "absent"> {
    const r = await run("docker", ["inspect", "-f", "{{.State.Status}}", container], 8_000);
    if (r.code !== 0) return "absent";
    const s = r.out.trim();
    if (s === "running") return "running";
    return "stopped"; // created/exited/dead/paused → treat as stopped
  }

  async exec(container: string, cmd: string, args: string[], opts: { timeoutMs: number; cwd?: string }): Promise<WorkshopExecResult> {
    const t0 = Date.now();
    return await new Promise<WorkshopExecResult>((resolve) => {
      const argv = ["exec", ...(opts.cwd ? ["-w", opts.cwd] : []), container, cmd, ...args];
      const p = spawn("docker", argv, { windowsHide: true });
      let out = "";
      let err = "";
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        p.kill();
        resolve({ exitCode: 124, stdout: out, stderr: err + "\n[workshop] command timed out", durationMs: Date.now() - t0 });
      }, opts.timeoutMs);
      p.stdout?.on("data", (d: Buffer) => (out += d.toString("utf8")));
      p.stderr?.on("data", (d: Buffer) => (err += d.toString("utf8")));
      p.on("close", (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ exitCode: code ?? 1, stdout: out, stderr: err, durationMs: Date.now() - t0 });
      });
      p.on("error", (e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ exitCode: 1, stdout: out, stderr: `${err}\n${e.message}`, durationMs: Date.now() - t0 });
      });
    });
  }
}

/** Versi layout container, dinaikkan saat struktur mount/flag berubah.
 *  Container lama (tanpa label ini) dimigrasi otomatis: container dibuang
 *  (VOLUME & file project tetap) lalu dibuat ulang dengan layout baru. */
const WORKSHOP_LAYOUT = "2"; // 2 = bind workspace /home/node/project + cwd situ

/** Fallback TANPA Docker: direktori .yuika/workshop di project, shell lokal,
 *  TIDAK terisolasi (setara terminal lokal). Warning eksplisit di log/info. */
export class LocalWorkshopHost implements WorkshopHost {
  kind = "local" as const;
  private dirs = new Set<string>();

  constructor(private workspaceRootOf: (projectId: string) => string) {}

  async available(): Promise<boolean> {
    return true;
  }

  private dir(container: string): string {
    // container name unik per project, dipakai sbg nama dir
    return path.join(this.workspaceRootOf(container.replace(/^yuika-ws-/, "")), ".yuika", "workshop");
  }

  async ensureRunning(input: HostEnsureInput): Promise<void> {
    fs.mkdirSync(this.dir(input.container), { recursive: true });
    this.dirs.add(input.container);
    log.warn({ container: input.container }, "workshop LOCAL fallback, TANPA isolasi (no docker)");
  }

  async start(_container: string): Promise<void> {
    /* lokal selalu "hidup" */
  }

  async stop(_container: string): Promise<void> {
    /* noop, proses mati sendiri */
  }

  async remove(container: string, opts: { volume?: string }): Promise<void> {
    this.dirs.delete(container);
    if (opts.volume) {
      try {
        fs.rmSync(this.dir(container), { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  }

  async state(container: string): Promise<"running" | "stopped" | "absent"> {
    return this.dirs.has(container) ? "running" : "absent";
  }

  async listArtifacts(): Promise<{ containers: string[]; volumes: string[] }> {
    return { containers: [], volumes: [] }; // lokal: tanpa artefak docker
  }

  async removeVolume(_volume: string): Promise<void> {
    /* noop: volume lokal = dir, sudah dihapus remove() */
  }

  async exec(container: string, cmd: string, args: string[], opts: { timeoutMs: number; cwd?: string }): Promise<WorkshopExecResult> {
    const t0 = Date.now();
    const cwd = opts.cwd ?? this.dir(container);
    fs.mkdirSync(cwd, { recursive: true });
    return await new Promise<WorkshopExecResult>((resolve) => {
      const p = spawn(cmd, args, { cwd, shell: process.platform === "win32", windowsHide: true });
      let out = "";
      let err = "";
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        p.kill();
        resolve({ exitCode: 124, stdout: out, stderr: err + "\n[workshop] command timed out", durationMs: Date.now() - t0 });
      }, opts.timeoutMs);
      p.stdout?.on("data", (d: Buffer) => (out += d.toString("utf8")));
      p.stderr?.on("data", (d: Buffer) => (err += d.toString("utf8")));
      p.on("close", (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ exitCode: code ?? 1, stdout: out, stderr: err, durationMs: Date.now() - t0 });
      });
      p.on("error", (e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ exitCode: 1, stdout: out, stderr: `${err}\n${e.message}`, durationMs: Date.now() - t0 });
      });
    });
  }
}

// ── Manager ─────────────────────────────────────────────────────────────────

export interface WorkshopManagerDeps {
  store: WorkshopStore;
  /** Root absolut project (workspace) per projectId. */
  workspaceRootOf: (projectId: string) => string;
  /** Emit event ke sesi pemanggil (opsional, REST poll tetap sumber). */
  onEvent?: (ev: { type: "workshop.state" | "workshop.command"; projectId: string; [k: string]: unknown }) => void;
}

const RING_CAP = 200;

export class WorkshopManager {
  private host: WorkshopHost | null = null;
  private hostKind: "docker" | "local" = "docker";
  private rings = new Map<string, WorkshopLogItem[]>();
  private lastActivity = new Map<string, number>();
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private deps: WorkshopManagerDeps) {}

  /** Pilih backend sekali (docker bila ada; fallback local + warning). */
  async resolveHost(): Promise<WorkshopHost> {
    if (this.host) return this.host;
    const docker = new DockerWorkshopHost();
    if (await docker.available()) {
      this.host = docker;
      this.hostKind = "docker";
    } else {
      this.host = new LocalWorkshopHost(this.deps.workspaceRootOf);
      this.hostKind = "local";
      log.warn("docker tidak tersedia, workshop jalan LOCAL fallback (tanpa isolasi)");
    }
    return this.host;
  }

  /** WKS-5: idle sleep, workshop running tanpa aktivitas → asleep. */
  startIdleWatchdog(idleMs = Number(process.env.YUI_WORKSHOP_IDLE_MS ?? 1_800_000)): void {
    this.stopIdleWatchdog();
    if (!idleMs) return;
    this.idleTimer = setInterval(() => {
      for (const info of this.all()) {
        if (info.state !== "running") continue;
        const last = this.lastActivity.get(info.projectId) ?? Date.now();
        if (Date.now() - last >= idleMs) void this.sleep(info.projectId, "idle");
      }
    }, 60_000);
    this.idleTimer.unref?.();
  }

  stopIdleWatchdog(): void {
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = null;
  }

  private ring(projectId: string): WorkshopLogItem[] {
    let r = this.rings.get(projectId);
    if (!r) this.rings.set(projectId, (r = []));
    return r;
  }

  private push(projectId: string, item: WorkshopLogItem): void {
    const r = this.ring(projectId);
    r.push(item);
    if (r.length > RING_CAP) r.splice(0, r.length - RING_CAP);
  }

  private setState(info: WorkshopInfo, to: WorkshopState, reason: string, now = Date.now()): WorkshopInfo {
    const from = info.state;
    let next: WorkshopInfo = { ...info, state: to };
    if (to === "running" && from !== "running") {
      next = { ...next, lastWakeAt: now };
    }
    if (to !== "running" && from === "running" && info.lastWakeAt) {
      next = { ...next, lastSleepAt: now, uptimeMs: info.uptimeMs + (now - info.lastWakeAt) };
    }
    this.deps.store.upsert(next, to === "running" ? now : null);
    this.push(info.projectId, { at: now, kind: "state", by: "system", text: `${from} → ${to} (${reason})` });
    this.deps.onEvent?.({ type: "workshop.state", projectId: info.projectId, from, to, reason, ts: now });
    log.info({ projectId: info.projectId, from, to, reason }, "workshop state");
    return next;
  }

  info(projectId: string): WorkshopInfo {
    return (
      this.deps.store.get(projectId) ?? {
        projectId,
        state: "absent",
        containerName: `yuika-ws-${projectId}`,
        volumeName: `yuika-ws-vol-${projectId}`,
        backend: this.hostKind,
        createdAt: 0,
        lastWakeAt: null,
        lastSleepAt: null,
        uptimeMs: 0,
        egressAllow: [],
        resourceCap: {
          memory: process.env.YUI_WORKSHOP_MEMORY ?? "2g",
          cpus: process.env.YUI_WORKSHOP_CPUS ?? "2",
          pidsLimit: Number(process.env.YUI_WORKSHOP_PIDS ?? 512),
        },
      }
    );
  }

  all(): WorkshopInfo[] {
    return this.deps.store.list();
  }

  listLog(projectId: string, limit = 100): WorkshopLogItem[] {
    return this.ring(projectId).slice(-limit).reverse();
  }

  /** WKS-2: baca .yuika/workshop.json (default npm+github). */
  readConfig(projectId: string): WorkshopConfig {
    const root = this.deps.workspaceRootOf(projectId);
    const p = path.join(root, ".yuika", "workshop.json");
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
      return WorkshopConfig.parse(raw);
    } catch {
      return { egressAllow: [...WORKSHOP_DEFAULT_EGRESS] };
    }
  }

  /** Bangun (absent) atau bangunkan (asleep/stopped) workshop. */
  async start(projectId: string, opts: { egressAllow?: string[]; by?: string } = {}): Promise<WorkshopInfo> {
    const host = await this.resolveHost();
    let info = this.info(projectId);
    // Heal drift: store bilang running tapi container nyatanya hilang/mati
    // (docker prune, crash host, migrasi label) → jangan early-return;
    // jatuh ke ensureRunning (recreate, volume & file project utuh).
    if (info.state === "running") {
      const real = await host.state(info.containerName);
      if (real === "running") return info;
      log.warn({ projectId, real }, "workshop drift: store=running, docker≠running → heal");
      info = this.setState(info, "stopped", `drift-heal (${real})`);
    }
    const egressAllow = opts.egressAllow ?? (info.state === "absent" ? this.readConfig(projectId).egressAllow : info.egressAllow);
    info = this.setState(info, "starting", `start by ${opts.by ?? "user"}`);
    try {
      let proxyPort: number | undefined;
      if (egressAllow.length > 0) {
        const proxy = await getEgressProxy(egressAllow);
        proxyPort = proxy.port;
      }
      await host.ensureRunning({
        container: info.containerName,
        volume: info.volumeName,
        memory: info.resourceCap.memory,
        cpus: info.resourceCap.cpus,
        pidsLimit: info.resourceCap.pidsLimit,
        image: process.env.YUI_WORKSHOP_IMAGE ?? process.env.YUI_SANDBOX_IMAGE ?? "node:24-bookworm-slim",
        egressProxyPort: proxyPort,
        egressAllow,
        workspacePath: this.deps.workspaceRootOf(projectId),
      });
      const withEgress: WorkshopInfo = { ...info, egressAllow, backend: host.kind, createdAt: info.createdAt || Date.now() };
      this.deps.store.upsert(withEgress, null);
      const running = this.setState(withEgress, "running", `start by ${opts.by ?? "user"}`);
      this.lastActivity.set(projectId, Date.now());
      return running;
    } catch (e) {
      this.setState(info, "error", e instanceof Error ? e.message.slice(0, 200) : String(e));
      throw e;
    }
  }

  /** docker stop, volume utuh, bangun cepat. */
  async sleep(projectId: string, reason = "user"): Promise<WorkshopInfo> {
    const host = await this.resolveHost();
    const info = this.info(projectId);
    if (info.state !== "running") return info;
    try {
      await host.stop(info.containerName);
    } catch (e) {
      log.warn({ projectId }, "stop gagal: %s", e);
    }
    return this.setState(info, reason === "idle" ? "asleep" : reason === "user" ? "stopped" : "asleep", reason);
  }

  /** Recreate container (config baru), volume PERTAHAN. */
  async recover(projectId: string): Promise<WorkshopInfo> {
    const host = await this.resolveHost();
    const info = this.info(projectId);
    if (info.state !== "absent") await host.remove(info.containerName, {});
    this.deps.store.upsert({ ...info, state: "stopped" }, null);
    return await this.start(projectId, { egressAllow: info.egressAllow, by: "recover" });
  }

  /** Kembali ke kondisi bersih, volume DIHAPUS (checkpoint = kosong v0). */
  async reset(projectId: string): Promise<WorkshopInfo> {
    const host = await this.resolveHost();
    const info = this.info(projectId);
    await host.remove(info.containerName, { volume: info.volumeName });
    this.deps.store.delete(projectId);
    this.rings.delete(projectId);
    return await this.start(projectId, { by: "reset" });
  }

  /** Hapus total (container + volume + row), hanya eksplisit dari UI/hapus project. */
  async destroy(projectId: string): Promise<void> {
    const host = await this.resolveHost();
    const info = this.info(projectId);
    await host.remove(info.containerName, { volume: info.volumeName });
    this.deps.store.delete(projectId);
    this.rings.delete(projectId);
    this.lastActivity.delete(projectId);
    this.deps.onEvent?.({ type: "workshop.state", projectId, from: info.state, to: "absent", reason: "destroy", ts: Date.now() });
  }

  /** D114: sapu artefak YATIM - container yuika-ws-* / volume yuika-ws-vol-*
   *  / row registry yang projectId-nya tidak lagi ada (project terhapus saat
   *  docker mati, versi pra-cleanup, dsb.). Aman by-construction: hanya nama
   *  berpola Yuika yang dihitung, dan hanya bila projectId tak ada di daftar
   *  valid. */
  async sweepOrphans(
    validProjectIds: readonly string[],
  ): Promise<{ containers: number; volumes: number; rows: number }> {
    const host = await this.resolveHost();
    // Baca artefak DULU, daftar valid belakangan: project yang dibuat saat
    // sweep jalan pasti masuk daftar valid (tidak pernah dianggap yatim).
    const { containers, volumes } = await host.listArtifacts();
    const valid = new Set(validProjectIds);
    let removedContainers = 0;
    let removedVolumes = 0;
    for (const c of containers) {
      const pid = c.slice("yuika-ws-".length);
      if (!pid || valid.has(pid)) continue;
      try {
        await host.remove(c, {});
        removedContainers++;
        log.info({ container: c, projectId: pid }, "workshop yatim: container dihapus");
      } catch (e) {
        log.warn({ container: c, err: String(e) }, "workshop yatim: gagal hapus container");
      }
    }
    for (const v of volumes) {
      const pid = v.slice("yuika-ws-vol-".length);
      if (!pid || valid.has(pid)) continue;
      try {
        await host.removeVolume(v);
        removedVolumes++;
        log.info({ volume: v, projectId: pid }, "workshop yatim: volume dihapus");
      } catch (e) {
        log.warn({ volume: v, err: String(e) }, "workshop yatim: gagal hapus volume");
      }
    }
    // Row registry yatim: dibuang supaya koheren ulang (info() kembali absent).
    let rows = 0;
    for (const info of this.deps.store.list()) {
      if (valid.has(info.projectId)) continue;
      this.deps.store.delete(info.projectId);
      this.rings.delete(info.projectId);
      this.lastActivity.delete(info.projectId);
      rows++;
    }
    if (removedContainers || removedVolumes || rows) {
      log.info({ removedContainers, removedVolumes, rows }, "workshop orphan sweep selesai");
    }
    return { containers: removedContainers, volumes: removedVolumes, rows };
  }

  /** Eksekusi perintah (docker exec / lokal), audit by persona-first. */
  async exec(
    projectId: string,
    cmd: string,
    args: string[],
    opts: { by?: string; timeoutMs?: number; cwd?: string } = {},
  ): Promise<WorkshopExecResult> {
    const host = await this.resolveHost();
    let info = this.info(projectId);
    if (info.state === "absent") throw new Error("workshop belum dibuat, start dulu");
    if (info.state !== "running") info = await this.start(projectId, { by: opts.by ?? "user" });
    const by = opts.by ?? "user";
    const cmdline = [cmd, ...args].join(" ").slice(0, 2_000);
    this.push(projectId, { at: Date.now(), kind: "command", by, text: cmdline });
    this.lastActivity.set(projectId, Date.now());
    const res = await host.exec(info.containerName, cmd, args, {
      timeoutMs: opts.timeoutMs ?? Number(process.env.YUI_WORKSHOP_EXEC_TIMEOUT_MS ?? 120_000),
      // default = project workspace di dalam container (docker) / project root (local)
      cwd: opts.cwd ?? (host.kind === "docker" ? "/home/node/project" : undefined),
    });
    this.lastActivity.set(projectId, Date.now());
    this.deps.onEvent?.({ type: "workshop.command", projectId, by, cmd: cmdline, exitCode: res.exitCode, ts: Date.now() });
    return res;
  }

  /** Shutdown bersih (dispose runtime). Proxy egress TIDAK ditutup di sini,
   *  cache-nya shared dengan sandbox/terminal (getEgressProxy); shutdown
   *  proses yang membersihkan (pola egress.ts). */
  async close(): Promise<void> {
    this.stopIdleWatchdog();
  }
}
