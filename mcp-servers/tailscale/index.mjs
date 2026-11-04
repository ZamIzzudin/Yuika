#!/usr/bin/env node
// MCP server: Tailscale (dev-10) — expose dev lokal ke tailnet/Internet.
// stdio JSON-RPC minimal (tanpa SDK). Membungkus CLI `tailscale`:
//   • ts_status        → status node + tailnet (tailscale status --json)
//   • ts_ip            → IP tailnet node ini
//   • ts_serve_status  → tunnel serve/funnel yang aktif
//   • ts_serve_start   → publikasikan http://127.0.0.1:<port> ke tailnet (HTTPS)
//   • ts_funnel_start  → publikasikan ke INTERNET via Tailscale Funnel
//   • ts_serve_stop    → matikan semua tunnel serve/funnel node ini
// Prasyarat: tailscale terpasang & login (`tailscale up`). Funnel butuh
// funnel/HTTPS diizinkan admin ACL tailnet. Risiko TINGGI: funnel = akses
// publik — hanya untuk dev yang memang sengaja dibagikan.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import readline from "node:readline";

// Windows: CLI sering tidak di PATH (instal GUI) — coba lokasi umum.
function resolveBin() {
  if (process.platform === "win32") {
    for (const p of ["C:\\Program Files\\Tailscale\\tailscale.exe", "C:\\Program Files (x86)\\Tailscale\\tailscale.exe"]) {
      if (existsSync(p)) return p;
    }
  }
  return process.env.TAILSCALE_PATH || "tailscale";
}
const BIN = resolveBin();

const run = (args) =>
  new Promise((resolve) => {
    execFile(BIN, args, { timeout: 15_000, maxBuffer: 2_000_000, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout), stderr: String(stderr), err: err?.message ?? null });
    });
  });

const TOOLS = [
  {
    name: "ts_status",
    description: "Status node Tailscale ini & daftar peer tailnet (online/offline, IP).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ts_ip",
    description: "IP tailnet (100.x.y.z) node ini — untuk akses via VPN tailnet.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ts_serve_status",
    description: "Tunnel serve/funnel yang sedang aktif di node ini (URL → target).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ts_serve_start",
    description:
      "Publikasikan server dev lokal ke TAILNET (HTTPS, hanya anggota VPN): ts_serve_start(port=3000). Hasil = URL https://<host>.ts.net.",
    inputSchema: {
      type: "object",
      properties: { port: { type: "number", default: 3000 } },
      required: ["port"],
    },
  },
  {
    name: "ts_funnel_start",
    description:
      "Publikasikan server dev lokal ke INTERNET publik via Tailscale Funnel: ts_funnel_start(port=3000). RISIKO TINGGI — hanya untuk dev yang memang mau dibagikan publik. Butuh funnel diizinkan admin tailnet.",
    inputSchema: {
      type: "object",
      properties: { port: { type: "number", default: 3000 } },
      required: ["port"],
    },
  },
  {
    name: "ts_serve_stop",
    description: "Matikan SEMUA tunnel serve/funnel di node ini.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function call(name, args) {
  switch (name) {
    case "ts_status": {
      const r = await run(["status", "--json"]);
      if (!r.ok) return r;
      const j = JSON.parse(r.stdout || "{}");
      const self = j.Self ?? {};
      const peers = Object.values(j.Peer ?? {})
        .slice(0, 20)
        .map((p) => `${p.HostName} ${p.TailscaleIPs?.[0] ?? "?"} ${p.Online ? "online" : "offline"}`);
      return { ok: true, stdout: JSON.stringify({ self: { host: self.HostName, ip: self.TailscaleIPs?.[0], online: self.Online }, peers }, null, 2) };
    }
    case "ts_ip":
      return run(["ip", "-4"]);
    case "ts_serve_status":
      return run(["serve", "status", "--json"]);
    case "ts_serve_start": {
      const port = Number(args?.port ?? 3000);
      return run(["serve", "--bg", `http://127.0.0.1:${port}`]);
    }
    case "ts_funnel_start": {
      const port = Number(args?.port ?? 3000);
      return run(["funnel", "--bg", `http://127.0.0.1:${port}`]);
    }
    case "ts_serve_stop":
      return run(["serve", "reset"]);
    default:
      return { ok: false, err: `unknown tool: ${name}` };
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
  if (msg.id === undefined) return; // notification (initialized) — diam saja
  const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n");
  if (msg.method === "initialize") {
    reply({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "yui-tailscale", version: "0.1.0" },
    });
  } else if (msg.method === "tools/list") {
    reply({ tools: TOOLS });
  } else if (msg.method === "tools/call") {
    const p = msg.params ?? {};
    call(p.name, p.arguments ?? {})
      .then((r) => {
        const text = r.ok
          ? String(r.stdout).trim() || String(r.stderr).trim() || "(kosong)"
          : `GAGAL: ${r.err ?? r.stderr}\n(stdout: ${r.stdout})`;
        reply({ content: [{ type: "text", text }], isError: !r.ok });
      })
      .catch((e) => reply({ content: [{ type: "text", text: `GAGAL: ${e?.message ?? e}` }], isError: true }));
  } else if (msg.method === "ping") {
    reply({});
  } else {
    reply({ error: { code: -32601, message: `method tidak dikenal: ${msg.method}` } });
  }
});
