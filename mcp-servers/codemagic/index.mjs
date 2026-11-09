#!/usr/bin/env node
// MCP server: Codemagic CI/CD (build mobile Android/iOS via REST API).
// stdio JSON-RPC minimal (tanpa SDK), pola sama dengan mcp-servers/tailscale.
//   • cm_apps          → daftar aplikasi terdaftar
//   • cm_app           → detail satu aplikasi
//   • cm_start_build   → POST /builds (workflowId = NAMA workflow di codemagic.yaml)
//   • cm_builds        → GET /builds (status build; tidak ada GET /builds/:id)
//   • cm_wait_build    → poll sampai build selesai (helper, default timeout 30m)
//   • cm_cancel_build  → POST /builds/:id/cancel
//   • cm_artifact_url  → POST /artifacts/:secureFilename/public-url (URL publik sementara)
// Prasyarat: env CM_API_TOKEN (atau CODEMAGIC_API_TOKEN). Token personal:
// Codemagic → Account settings → API token. Header auth: x-auth-token.
// Catatan penting dari docs (Juni 2026):
//   - workflow app codemagic.yaml TIDAK bisa di-list via API (baru terbaca
//     setelah repo di-clone saat build) — baca codemagic.yaml dari repo.
//   - status build via GET /builds (filter appId/limit), bukan GET /builds/:id.
import readline from "node:readline";

const TOKEN = process.env.CM_API_TOKEN || process.env.CODEMAGIC_API_TOKEN || "";
const BASE = process.env.CM_API_URL || "https://api.codemagic.io";

async function api(method, path, body) {
  if (!TOKEN) {
    return { ok: false, err: "CM_API_TOKEN belum di-set (Codemagic Account settings > API token, taruh di yuika.env / env proses)." };
  }
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", "x-auth-token": TOKEN },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* bukan JSON */
  }
  return { ok: res.ok, status: res.status, json, text };
}

const fmt = (r) =>
  r.ok
    ? JSON.stringify(r.json ?? r.text, null, 2)
    : r.err
      ? `GAGAL: ${r.err}`
      : `GAGAL (HTTP ${r.status}): ${r.text?.slice(0, 2000) || JSON.stringify(r.json) || "unknown error"}`;

const TOOLS = [
  {
    name: "cm_apps",
    description:
      "List all Codemagic applications (appId, name). workflowIds hanya terisi untuk app yang dikonfigurasi via Workflow Editor, bukan codemagic.yaml.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "cm_app",
    description: "Get one application by appId (branches, workflows).",
    inputSchema: {
      type: "object",
      properties: { appId: { type: "string" } },
      required: ["appId"],
    },
  },
  {
    name: "cm_start_build",
    description:
      "Start a build. workflowId = nama workflow di codemagic.yaml (e.g. 'android-release'), BUKAN ObjectId. branch atau tag wajib salah satu. environment.variables meng-override env build.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string" },
        workflowId: { type: "string" },
        branch: { type: "string" },
        tag: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
        instanceType: { type: "string", description: "e.g. mac_mini_m2, linux (default per yaml)" },
        environment: {
          type: "object",
          properties: {
            variables: { type: "object", additionalProperties: true },
            groups: { type: "array", items: { type: "string" } },
          },
        },
      },
      required: ["appId", "workflowId"],
    },
  },
  {
    name: "cm_builds",
    description:
      "List builds (status/polling). Filter appId bila perlu. Response berisi status, workflow, branch, dan info artifacts (secureFilename) bila build sudah selesai.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string" },
        limit: { type: "number", default: 10 },
      },
    },
  },
  {
    name: "cm_wait_build",
    description:
      "Poll one build until finished (status not queued/running/building). Returns final build record. Default timeout 30 minutes, interval 20s.",
    inputSchema: {
      type: "object",
      properties: {
        buildId: { type: "string" },
        timeoutSec: { type: "number", default: 1800 },
      },
      required: ["buildId"],
    },
  },
  {
    name: "cm_cancel_build",
    description: "Cancel a running build by buildId.",
    inputSchema: {
      type: "object",
      properties: { buildId: { type: "string" } },
      required: ["buildId"],
    },
  },
  {
    name: "cm_artifact_url",
    description:
      "Create a temporary PUBLIC download URL for a build artifact (secureFilename dari cm_builds). Hati-hati: siapa pun dengan URL bisa mengunduh. expiresAt = UNIX timestamp detik.",
    inputSchema: {
      type: "object",
      properties: {
        secureFilename: { type: "string", description: "full path: <uuid1>/<uuid2>/<filename> dari response builds" },
        expiresAt: { type: "number", description: "UNIX timestamp (seconds). Default: now + 1 hour." },
      },
      required: ["secureFilename"],
    },
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBuild(builds, buildId) {
  const arr = Array.isArray(builds) ? builds : Object.values(builds ?? {}).flat();
  return (arr ?? []).find?.((b) => b._id === buildId || b.buildId === buildId) ?? null;
}

async function call(name, args) {
  switch (name) {
    case "cm_apps":
      return fmt(await api("GET", "/apps"));
    case "cm_app":
      return fmt(await api("GET", `/apps/${encodeURIComponent(args.appId)}`));
    case "cm_start_build": {
      const body = { appId: args.appId, workflowId: args.workflowId };
      if (args.branch) body.branch = args.branch;
      if (args.tag) body.tag = args.tag;
      if (args.labels) body.labels = args.labels;
      if (args.instanceType) body.instanceType = args.instanceType;
      if (args.environment) body.environment = args.environment;
      return fmt(await api("POST", "/builds", body));
    }
    case "cm_builds": {
      const limit = Number(args?.limit ?? 10) || 10;
      const q = new URLSearchParams({ limit: String(limit) });
      if (args?.appId) q.set("appId", args.appId);
      return fmt(await api("GET", `/builds?${q}`));
    }
    case "cm_wait_build": {
      const timeoutSec = Number(args?.timeoutSec ?? 1800);
      const deadline = Date.now() + timeoutSec * 1000;
      let last = null;
      while (Date.now() < deadline) {
        const r = await api("GET", `/builds?limit=50`);
        if (!r.ok) return fmt(r);
        const list = r.json?.builds ?? r.json ?? [];
        const b = findBuild(list, args.buildId);
        if (!b) return `buildId ${args.buildId} tidak ditemukan di 50 build terakhir.`;
        last = b;
        const st = String(b.status ?? "").toLowerCase();
        if (!["queued", "running", "building", "preparing", "fetching"].includes(st)) {
          return JSON.stringify(b, null, 2);
        }
        await sleep(20_000);
      }
      return `TIMEOUT setelah ${timeoutSec}s. Status terakhir:\n${JSON.stringify(last, null, 2)}`;
    }
    case "cm_cancel_build":
      return fmt(await api("POST", `/builds/${encodeURIComponent(args.buildId)}/cancel`));
    case "cm_artifact_url": {
      const expiresAt = args.expiresAt ?? Math.floor(Date.now() / 1000) + 3600;
      return fmt(
        await api("POST", `/artifacts/${args.secureFilename.split("/").map(encodeURIComponent).join("/")}/public-url`, { expiresAt }),
      );
    }
    default:
      return `unknown tool: ${name}`;
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
  if (msg.id === undefined) return; // notification, diam saja
  const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n");
  const replyErr = (text) => reply({ content: [{ type: "text", text }], isError: true });
  if (msg.method === "initialize") {
    reply({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "yui-codemagic", version: "0.1.0" },
    });
  } else if (msg.method === "tools/list") {
    reply({ tools: TOOLS });
  } else if (msg.method === "tools/call") {
    const p = msg.params ?? {};
    call(p.name, p.arguments ?? {})
      .then((text) => {
        const isErr = text.startsWith("GAGAL") || text.startsWith("unknown") || text.startsWith("TIMEOUT");
        reply({ content: [{ type: "text", text }], isError: isErr });
      })
      .catch((e) => replyErr(`GAGAL: ${e?.message ?? e}`));
  } else if (msg.method === "ping") {
    reply({});
  } else {
    reply({ error: { code: -32601, message: `method tidak dikenal: ${msg.method}` } });
  }
});
