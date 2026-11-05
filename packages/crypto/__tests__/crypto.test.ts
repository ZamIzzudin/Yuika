// Unit test backend crypto (di luar vectors): perilaku dasar + kegagalan.
import type { DeviceKeys } from "../src/shared.js";
import { describe, expect, it } from "vitest";
import * as node from "../src/node.js";
import * as web from "../src/web.js";
import { pemDecode, pemEncode, bytesToB64, b64ToBytes } from "../src/shared.js";

for (const backend of [
  { name: "node", generate: async () => node.generateDeviceKeys(), seal: async (f: DeviceKeys, t: DeviceKeys, p: string) => node.seal(f, t, p), open: async (t: DeviceKeys, f: DeviceKeys, b: string) => node.open(t, f, b).toString("utf8"), sign: async (p: string, d: string, n: string) => node.signChallenge(p, d, n), verify: async (...a: Parameters<typeof node.verifyChallenge>) => node.verifyChallenge(...a) },
  { name: "web", generate: web.generateDeviceKeys, seal: web.seal, open: web.open, sign: web.signChallenge, verify: web.verifyChallenge },
] as const) {
  describe(`crypto ${backend.name}`, () => {
    it("generateDeviceKeys → deviceId dev_ + PEM valid", async () => {
      const k = await backend.generate();
      expect(k.deviceId).toMatch(/^dev_[0-9a-f]{16}$/);
      expect(k.signPriv).toContain("-----BEGIN PRIVATE KEY-----");
      expect(k.signPub).toContain("-----BEGIN PUBLIC KEY-----");
      expect(k.dhPriv).not.toHaveLength(0);
    });

    it("seal/open roundtrip dua arah (kunci A→B == B→A, AAD beda arah)", async () => {
      const a = await backend.generate();
      const b = await backend.generate();
      const box = await backend.seal(a, b, "hello relay");
      expect(await backend.open(b, a, box)).toBe("hello relay");
      // arah balik: B→A memakai box BARU (AAD dari|ke berbeda) — juga sah.
      const box2 = await backend.seal(b, a, "reply");
      expect(await backend.open(a, b, box2)).toBe("reply");
    });

    it("box tidak terbuka pihak ketiga", async () => {
      const a = await backend.generate();
      const b = await backend.generate();
      const c = await backend.generate();
      const box = await backend.seal(a, b, "secret");
      await expect(backend.open(c, a, box)).rejects.toThrow();
      await expect(backend.open(b, c, box)).rejects.toThrow();
    });

    it("sign/verify challenge — salah nonce gagal", async () => {
      const k = await backend.generate();
      const sig = await backend.sign(k.signPriv, k.deviceId, "nonce-abc");
      expect(await backend.verify(k.signPub, k.deviceId, "nonce-abc", sig)).toBe(true);
      expect(await backend.verify(k.signPub, k.deviceId, "nonce-xyz", sig)).toBe(false);
    });
  });
}

describe("shared pem/b64", () => {
  it("pemEncode/Decode roundtrip", () => {
    const der = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const pem = pemEncode(der, "PRIVATE KEY");
    expect(pem.startsWith("-----BEGIN PRIVATE KEY-----")).toBe(true);
    expect(Array.from(pemDecode(pem))).toEqual(Array.from(der));
  });
  it("b64 roundtrip binari acak", () => {
    const b = new Uint8Array(300);
    for (let i = 0; i < b.length; i++) b[i] = i & 0xff;
    expect(Array.from(b64ToBytes(bytesToB64(b)))).toEqual(Array.from(b));
  });
});
