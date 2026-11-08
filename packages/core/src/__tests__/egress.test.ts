// P1-MCP-4: egress allowlist proxy, unit hermetic (upstream = server lokal).
import { afterAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import net from "node:net";
import { closeAllEgressProxies, hostAllowed, readEgressAllow, startEgressProxy } from "../tools/egress.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

afterAll(async () => {
  await closeAllEgressProxies();
});

describe("hostAllowed", () => {
  const allow = ["registry.npmjs.org", ".nodejs.org"];
  it("eksak + suffix dot", () => {
    expect(hostAllowed("registry.npmjs.org", allow)).toBe(true);
    expect(hostAllowed("nodejs.org", allow)).toBe(false); // suffix .nodejs.org, bukan eksak
    expect(hostAllowed("cdn.nodejs.org", allow)).toBe(true);
    expect(hostAllowed("evil-npmjs.org", allow)).toBe(false);
    expect(hostAllowed("registry.npmjs.org.evil.com", allow)).toBe(false);
  });
});

describe("readEgressAllow (per-project)", () => {
  it("default = registry npm/yarn/pnpm + nodejs.org", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-eg-"));
    expect(readEgressAllow(dir)).toContain("registry.npmjs.org");
  });
  it("file .yuika/egress.json menang atas default", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-eg2-"));
    fs.mkdirSync(path.join(dir, ".yuika"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".yuika", "egress.json"), JSON.stringify({ allow: ["internal.corp"] }));
    expect(readEgressAllow(dir)).toEqual(["internal.corp"]);
  });
});

describe("proxy CONNECT", () => {
  it("host di-allowlist → 200 + tunnel data dua arah; host lain → 403", async () => {
    // upstream lokal berdiri sebagai "host yang diizinkan"
    const upstream = net.createServer((sock) => {
      sock.on("data", (d) => sock.write(`UP:${d.toString("utf8").trim()}\n`));
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
    const port = (upstream.address() as net.AddressInfo).port;

    const proxy = await startEgressProxy(["127.0.0.1"], { ports: [port] });

    // 1) diizinkan
    const okSock = net.connect(proxy.port, "127.0.0.1");
    await new Promise<void>((r) => okSock.once("connect", r));
    okSock.write(`CONNECT 127.0.0.1:${port} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
    const head = await new Promise<string>((resolve) => {
      let buf = "";
      const onData = (d: Buffer) => {
        buf += d.toString("utf8");
        if (buf.includes("\r\n\r\n")) {
          okSock.removeListener("data", onData);
          resolve(buf);
        }
      };
      okSock.on("data", onData);
    });
    expect(head).toContain("200");
    okSock.write("ping\n");
    const echoed = await new Promise<string>((resolve) => {
      const onData = (d: Buffer) => {
        const s = d.toString("utf8");
        if (s.includes("UP:")) {
          okSock.removeListener("data", onData);
          resolve(s);
        }
      };
      okSock.on("data", onData);
    });
    expect(echoed).toContain("UP:ping");
    okSock.destroy();

    // 2) ditolak (host tak dikenal, port sama)
    const badSock = net.connect(proxy.port, "127.0.0.1");
    await new Promise<void>((r) => badSock.once("connect", r));
    badSock.write(`CONNECT evil.example.com:${port} HTTP/1.1\r\nHost: evil.example.com\r\n\r\n`);
    const denyHead = await new Promise<string>((resolve) => {
      let buf = "";
      const onData = (d: Buffer) => {
        buf += d.toString("utf8");
        if (buf.includes("\r\n\r\n")) {
          badSock.removeListener("data", onData);
          resolve(buf);
        }
      };
      badSock.on("data", onData);
      setTimeout(() => resolve(buf || "(no-resp)"), 2_000);
    });
    expect(denyHead).toContain("403");
    badSock.destroy();

    await proxy.close();
    upstream.close();
  });
});

describe("sandboxArgv egress (kontrak flag)", () => {
  it("egress non-kosong → network nyata via proxy env; kosong → --network none", async () => {
    const { sandboxArgv } = await import("../tools/sandbox.js");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-sbx-"));
    const withEgress = sandboxArgv("n1", "npm", ["install"], dir, { egress: ["registry.npmjs.org"] }, 8080);
    expect(withEgress).not.toContain("--network");
    expect(withEgress.join(" ")).toContain("host.docker.internal:8080");
    expect(withEgress.join(" ")).toContain("HTTPS_PROXY");
    const deny = sandboxArgv("n2", "node", ["x.js"], dir);
    const i = deny.indexOf("--network");
    expect(deny[i + 1]).toBe("none");
  });
});
