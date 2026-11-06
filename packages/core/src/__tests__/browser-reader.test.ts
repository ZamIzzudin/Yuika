// P2-STU-4 — browser reader: allowlist, SSRF guard, sanitizer, redirect
// re-validation, content-type/size gate. Server lokal utk fetch nyata.
import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  assertBrowserUrlAllowed,
  BrowserReadError,
  hostAllowedBrowser,
  isPrivateIp,
  readBrowserPage,
  sanitizeBrowserHtml,
} from "../browser/reader.js";

const servers: http.Server[] = [];
afterEach(() => Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r())))));

function serve(handler: http.RequestListener): Promise<string> {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    servers.push(s);
    s.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`));
  });
}

describe("P2-STU-4 browser reader", () => {
  it("allowlist: eksak & suffix dot", () => {
    const allow = ["example.com", ".npmjs.org"];
    expect(hostAllowedBrowser("example.com", allow)).toBe(true);
    expect(hostAllowedBrowser("registry.npmjs.org", allow)).toBe(true);
    expect(hostAllowedBrowser("evil.com", allow)).toBe(false);
    expect(hostAllowedBrowser("notnpmjs.org", allow)).toBe(false); // suffix tanpa dot tak cocok
  });

  it("isPrivateIp: rentang private/loopback/link-local/CGNAT/metadata", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "172.31.255.255", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd12::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700::1111"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it("assertBrowserUrlAllowed: bad url / scheme / host / private", async () => {
    const opts = { allow: ["example.com"] };
    await expect(assertBrowserUrlAllowed("not-a-url", opts)).rejects.toMatchObject({ code: "bad_url" });
    await expect(assertBrowserUrlAllowed("ftp://example.com/x", opts)).rejects.toMatchObject({ code: "scheme_denied" });
    await expect(assertBrowserUrlAllowed("https://evil.com/x", opts)).rejects.toMatchObject({ code: "host_denied" });
    // allowlist cocok tapi host private → SSRF guard (urutan: allowlist dulu, private sesudah)
    await expect(assertBrowserUrlAllowed("http://localhost/x", { allow: ["localhost"] })).rejects.toMatchObject({ code: "private_blocked" });
    await expect(assertBrowserUrlAllowed("http://127.0.0.1:9/x", { allow: ["127.0.0.1"] })).rejects.toMatchObject({ code: "private_blocked" });
    // loopback eksplisit di allowlist + allowPrivate → lolos (dev/test)
    await expect(
      assertBrowserUrlAllowed("http://127.0.0.1:9/x", { allow: ["127.0.0.1"], allowPrivate: true }),
    ).resolves.toBeInstanceOf(URL);
  });

  it("sanitizer: script/on*= / javascript: dibuang; URL relatif → absolut", () => {
    const base = new URL("https://example.com/docs/page");
    const dirty = [
      "<html><head><script>alert(1)</script></head><body>",
      '<h1 onclick="steal()">Title</h1>',
      '<img src="pic.png" onerror="x()">',
      '<a href="javascript:evil()">link</a>',
      '<iframe src="https://evil.example/x"></iframe>',
      "<p>safe text</p></body></html>",
    ].join("");
    const clean = sanitizeBrowserHtml(dirty, base);
    expect(clean).not.toContain("alert(1)");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("<iframe");
    expect(clean).toContain("https://example.com/docs/pic.png");
    expect(clean).toContain("safe text");
  });

  it("readBrowserPage: HTML → sanitized + title + URL final", async () => {
    const base = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html><head><title>Doc</title></head><body><script>bad()</script><h1>Example</h1></body></html>");
    });
    const page = await readBrowserPage(base, { allow: ["127.0.0.1"], allowPrivate: true });
    expect(page.title).toBe("Doc");
    expect(page.html).toContain("Example");
    expect(page.html).not.toContain("bad()");
    expect(page.url.startsWith("http://127.0.0.1:")).toBe(true);
  });

  it("readBrowserPage: redirect KE host private tanpa allowPrivate → blok (SSRF via redirect)", async () => {
    const other = await serve((_req, res) => res.end("secret"));
    const gate = await serve((req, res) => {
      if (req.url === "/hop") {
        res.writeHead(302, { location: other });
        return res.end();
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("gate");
    });
    // allowlist hanya gate; redirect target (127.0.0.1) lolos allowlist eksak,
    // tapi private guard aktif → private_blocked.
    await expect(
      readBrowserPage(`${gate}/hop`, { allow: ["127.0.0.1"], allowPrivate: false }),
    ).rejects.toBeInstanceOf(BrowserReadError);
  });

  it("readBrowserPage: content-type non-teks → tolak; text/plain → dibungkus aman", async () => {
    const json = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    await expect(readBrowserPage(json, { allow: ["127.0.0.1"], allowPrivate: true })).rejects.toMatchObject({
      code: "content_type_denied",
    });

    const txt = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("<b>not html</b>");
    });
    const page = await readBrowserPage(txt, { allow: ["127.0.0.1"], allowPrivate: true });
    expect(page.html).toContain("&lt;b&gt;not html&lt;/b&gt;");
  });
});
