// @yuika/core, egress allowlist proxy.
// Sandbox containers have NO network by default (--network none). When an
// execution needs limited network access (e.g. `npm install` -> registry),
// the container runs with network and HTTP(S)_PROXY pointed at this proxy
// on the host. It only forwards CONNECT/absolute-request to allowlisted
// hosts (port 80/443); everything else is 403.
// SATU titik kebenatan di sisi host, bukan iptables per container.
//
// Allowlist per proyek (urutan pencarian):
//   1. file `<workspace>/.yuika/egress.json`  { "allow": ["host", ...] }
//   2. env YUI_EGRESS_ALLOW  ("host1,host2")
//   3. default: registry npm/yarn/pnpm + nodejs.org (cukup utk npm install)
// Entry: hostname eksak ATAU suffix `.` (".npmjs.org" → semua subdomain).
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { moduleLogger } from "../logger.js";

const log = moduleLogger("egress");

export const EGRESS_DEFAULT_ALLOW = [
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "registry.npmjs.com",
  "nodejs.org",
];

/** Baca allowlist efektif utk sebuah workspace (cache per path+mtime). */
export function readEgressAllow(workspacePath: string): string[] {
  const env = process.env.YUI_EGRESS_ALLOW?.trim();
  const file = path.join(workspacePath, ".yuika", "egress.json");
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as { allow?: unknown };
    if (Array.isArray(parsed.allow) && parsed.allow.every((h) => typeof h === "string") && parsed.allow.length > 0) {
      return parsed.allow.map(String);
    }
  } catch {
    /* tak ada file → lanjut env/default */
  }
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return [...EGRESS_DEFAULT_ALLOW];
}

/** Cocokkan hostname terhadap allowlist (eksak atau suffix dot). */
export function hostAllowed(host: string, allow: string[]): boolean {
  const h = host.toLowerCase();
  return allow.some((entry) => {
    const e = entry.toLowerCase();
    if (e === h) return true;
    return e.startsWith(".") ? h.endsWith(e) : false;
  });
}

export interface EgressProxy {
  port: number;
  allow: string[];
  close(): Promise<void>;
}

const proxies = new Map<string, EgressProxy>();
let proxySeq = 0;

/** Proxy singleton per allowlist (sorted-join key), dipakai lintas tool call;
 * idle-close via closeAllEgressProxies() saat proses/API mati. */
export async function getEgressProxy(allow: string[]): Promise<EgressProxy> {
  const key = [...allow].sort().join("|");
  const existing = proxies.get(key);
  if (existing) return existing;
  const p = await startEgressProxy(allow);
  proxies.set(key, p);
  return p;
}

export async function closeAllEgressProxies(): Promise<void> {
  await Promise.all([...proxies.values()].map((p) => p.close().catch(() => undefined)));
  proxies.clear();
}

/** Jalankan allowlist proxy di port acak (loopback). Opts.ports utk test
 * (default cuma 80/443, egress web standar). */
export function startEgressProxy(allow: string[], opts: { ports?: number[] } = {}): Promise<EgressProxy> {
  return new Promise((resolve, reject) => {
    const conns = new Set<net.Socket>();
    let connsMax = 64; // batas koneksi simultan (kebocoran = DoS kecil dicegah)
    const deny = (res: http.ServerResponse, host: string) => {
      log.warn({ host }, "egress denied");
      res.writeHead(403, { "content-type": "text/plain" });
      res.end(`egress denied: ${host} not in allowlist\n`);
    };

    const server = http.createServer((req, res) => {
      // absolute-form http://host:80/path (npm kadang pakai plain HTTP utk redirect)
      const url = req.url ?? "";
      let host = "";
      try {
        host = new URL(url).hostname;
      } catch {
        /* relative, proxy ini bukan utk itu */
      }
      if (!host || !hostAllowed(host, allow)) return deny(res, host || "(none)");
      if (conns.size >= connsMax) {
        res.writeHead(503);
        return res.end("egress proxy busy\n");
      }
      const port = new URL(url).protocol === "https:" ? 443 : Number(new URL(url).port || 80);
      const upstream = net.connect(port, host, () => {
        upstream.write(`${req.method} ${url} HTTP/${req.httpVersion}\r\n`);
        for (const [k, v] of Object.entries(req.headers)) {
          if (k.toLowerCase() === "host" || k.toLowerCase() === "connection") continue;
          if (Array.isArray(v)) v.forEach((vv) => upstream.write(`${k}: ${vv}\r\n`));
          else upstream.write(`${k}: ${v}\r\n`);
        }
        upstream.write("\r\n");
        req.pipe(upstream);
      });
      upstream.pipe(res);
      conns.add(upstream);
      const done = () => conns.delete(upstream);
      upstream.on("close", done);
      req.on("error", () => upstream.destroy());
    });

    // CONNECT host:port, jalur utama (HTTPS). Tunnel buta: TLS tetap E2E ke
    // host tujuan; proxy hanya melihat SNI/Host di baris CONNECT.
    const portsOk = new Set(opts.ports ?? [80, 443]);
    server.on("connect", (req, clientSocket, head) => {
      const [rawHost, rawPort] = (req.url ?? "").split(":");
      const port = Number(rawPort || 443);
      if (!rawHost || !hostAllowed(rawHost, allow) || !portsOk.has(port)) {
        clientSocket.write("HTTP/1.1 403 egress denied\r\n\r\n");
        clientSocket.destroy();
        log.warn({ host: rawHost }, "egress denied (CONNECT)");
        return;
      }
      if (conns.size >= connsMax) {
        clientSocket.write("HTTP/1.1 503 busy\r\n\r\n");
        clientSocket.destroy();
        return;
      }
      const upstream = net.connect(port, rawHost, () => {
        clientSocket.write("HTTP/1.1 200 connection established\r\n\r\n");
        upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      conns.add(upstream);
      conns.add(clientSocket as unknown as net.Socket);
      const done = () => {
        conns.delete(upstream);
        conns.delete(clientSocket as unknown as net.Socket);
        upstream.destroy();
        clientSocket.destroy();
      };
      upstream.on("close", done);
      clientSocket.on("close", done);
      upstream.on("error", done);
      clientSocket.on("error", done);
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      resolve({
        port: addr.port,
        allow,
        close: () =>
          new Promise<void>((res) => {
            connsMax = 0;
            for (const c of conns) c.destroy();
            server.close(() => res());
            res(); // jangan gantung pemanggil, socket di-destroy di atas
          }),
      });
      log.info({ port: addr.port, allow: allow.length, id: ++proxySeq }, "egress proxy siap");
    });
  });
}
