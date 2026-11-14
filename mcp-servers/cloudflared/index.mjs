#!/usr/bin/env node
// MCP server: Cloudflare Quick Tunnel (D106), expose dev lokal ke internet
// TANPA login/kredensial (trycloudflare.com). Membungkus CLI `cloudflared`:
//   • cf_quick_start(port)  → jalankan `cloudflared tunnel --url` sebagai
//     child process, parse URL trycloudflare.com dari output, balas URL.
//     Port sama = pakai tunnel lama; port beda = restart otomatis.
//   • cf_quick_status       → tunnel aktif? (url, port, startedAt)
//   • cf_quick_stop         → matikan tunnel
// Karakter quick tunnel: URL acak dan BERUBAH tiap start (by design, user
// sadar); persona cukup browser_open URL terbaru. Siapa pun yang tahu URL
// bisa mengakses, jadi hanya untuk dev yang memang mau dilihat/dibagikan.
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import readline from "node:readline";

// Windows: cloudflared sering tidak di PATH, cek lokasi umum instalasi.
function resolveBin() {
  if (process.platform === "win32") {
    for (const p of [
      "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
      "C:\\Program Files\\cloudflared\\cloudflared.exe",
    ]) {
      if (existsSync(p)) return p;
    }
  }
  return process.env.CLOUDFLARED_PATH || "cloudflared";
}
const BIN = resolveBin();

/** State satu tunnel aktif (satu per MCP server process). */
let tun = null; // { proc, url, port, startedAt, log }

const INSTALL_HINT =
  "cloudflared CLI not found. Install first (no Cloudflare account needed for quick tunnels):\n" +
  "- Windows: winget install --id Cloudflare.cloudflared  (or https://github.com/cloudflare/cloudflared/releases)\n" +
  "- macOS: brew install cloudflared\n" +
  "- Linux: apt install cloudflared  (or download from GitHub releases)\n" +
  "Set CLOUDFLARED_PATH if it is installed in a custom location.";

function binOk() {
  return new Promise((resolve) => {
    execFile(BIN, ["--version"], { timeout: 10_000, windowsHide: true }, (err) => {
      resolve(!err);
    });
  });
}

function stopTunnel() {
  if (!tun) return;
  try {
    tun.proc.kill();
  } catch {
    /* sudah mati */
  }
  tun = null;
}

async function startTunnel(port) {
  const proc = spawn(BIN, ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const state = { proc, url: null, port, startedAt: Date.now(), log: [] };
  tun = state;
  const onOut = (d) => {
    state.log.push(String(d));
    if (state.log.length > 200) state.log.shift();
  };
  proc.stdout.on("data", onOut);
  proc.stderr.on("data", onOut); // banner URL cloudflared muncul di stderr
  proc.on("exit", () => {
    if (tun === state) tun = null;
  });
  // Tunggu URL trycloudflare.com muncul (poll 300ms, maks 30 dtk).
  const re = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) break;
    const m = state.log.join("").match(re);
    if (m) {
      state.url = m[0];
      return { ok: true, url: state.url, port };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  const tail = state.log.join("").slice(-1200);
  stopTunnel();
  return {
    ok: false,
    error: "tunnel did not produce a trycloudflare.com URL within 30s",
    logTail: tail,
  };
}

const TOOLS = [
  {
    name: "cf_quick_start",
    description:
      "Expose a local dev server to the PUBLIC internet via a Cloudflare quick tunnel, no login needed. Returns a fresh https://<random>.trycloudflare.com URL; it CHANGES on every start, so always open the URL from the latest call (browser_open). Same port while running = reuse; different port = restart.",
    inputSchema: {
      type: "object",
      properties: { port: { type: "number", default: 3000 } },
      required: ["port"],
    },
  },
  {
    name: "cf_quick_status",
    description: "Is a quick tunnel running? Returns url, port and startedAt, or stopped.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "cf_quick_stop",
    description: "Stop the quick tunnel and release the URL.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function call(name, args) {
  switch (name) {
    case "cf_quick_start": {
      const port = Number(args?.port ?? 3000);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { ok: false, error: "port must be an integer 1-65535" };
      }
      if (!(await binOk())) return { ok: false, error: INSTALL_HINT };
      if (tun?.url && tun.port === port) {
        return { ok: true, url: tun.url, port, note: "reusing the running tunnel" };
      }
      stopTunnel();
      const r = await startTunnel(port);
      return r;
    }
    case "cf_quick_status":
      return tun?.url
        ? { ok: true, running: true, url: tun.url, port: tun.port, startedAt: tun.startedAt }
        : { ok: true, running: false, note: "no quick tunnel running" };
    case "cf_quick_stop": {
      const had = Boolean(tun);
      stopTunnel();
      return { ok: true, stopped: had };
    }
    default:
      return { ok: false, error: `unknown tool: ${name}` };
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id === undefined) return; // notification, keep silent
  const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n");
  if (msg.method === "initialize") {
    reply({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "yui-cloudflared", version: "0.1.0" },
    });
  } else if (msg.method === "tools/list") {
    reply({ tools: TOOLS });
  } else if (msg.method === "tools/call") {
    const p = msg.params ?? {};
    call(p.name, p.arguments ?? {})
      .then((r) => {
        reply({
          content: [{ type: "text", text: JSON.stringify(r, null, 2) }],
          isError: r.ok === false,
        });
      })
      .catch((e) =>
        reply({ content: [{ type: "text", text: `FAILED: ${e?.message ?? e}` }], isError: true }),
      );
  } else if (msg.method === "ping") {
    reply({});
  } else {
    reply({ error: { code: -32601, message: `unknown method: ${msg.method}` } });
  }
});

// Jangan warisan tunnel saat MCP server mati (restart API, dsb.).
for (const sig of ["SIGTERM", "SIGINT", "exit"]) {
  process.on(sig, () => {
    stopTunnel();
  });
}
