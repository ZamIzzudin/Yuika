/**
 * Golden vectors protokol v1 — file IDENTIK diverifikasi di dua repo
 * (yuika-portal & your-yui mirror). Hijau di keduanya ⇒ implementasi crypto
 * kompatibel di wire. Mengubah docs/portal/vectors/proto1.json = bump proto
 * (SPEC-PROTOCOL.md §12). Hash file tercatat di docs/portal/README.md.
 *
 * Suite ini menjalankan DUA backend (node + web/WebCrypto) terhadap vectors
 * yang sama — bukti interop node↔browser sekaligus.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as node from "../src/node.js";
import * as web from "../src/web.js";
import type { DeviceKeys } from "../src/shared.js";

const vectors = JSON.parse(
  readFileSync(new URL("../../../docs/portal/vectors/proto1.json", import.meta.url), "utf8"),
) as {
  proto: number;
  keys: Record<"alice" | "bob", { deviceId: string; signPriv: string; signPub: string; dhPriv: string; dhPub: string }>;
  signChallenge: { name: string; deviceId: string; nonce: string; signPub: string; sig: string; expect: boolean }[];
  envelope: { name: string; fromDeviceId: string; toDeviceId: string; plaintext: string; box: string }[];
  sha256Hex: { input: string; expect: string }[];
};

const keyOf = (deviceId: string): DeviceKeys => {
  const k = Object.values(vectors.keys).find((x) => x.deviceId === deviceId);
  if (!k) throw new Error(`vector key tidak ditemukan: ${deviceId}`);
  return k;
};

for (const backend of [
  { name: "node", verify: async (...a: Parameters<typeof node.verifyChallenge>) => node.verifyChallenge(...a), open: async (to: DeviceKeys, from: DeviceKeys, box: string) => node.open(to, from, box).toString("utf8"), seal: async (from: DeviceKeys, to: DeviceKeys, pt: string) => node.seal(from, to, pt), sha: async (s: string) => node.sha256Hex(s) },
  { name: "web", verify: web.verifyChallenge, open: web.open, seal: web.seal, sha: web.sha256Hex },
] as const) {
  describe(`golden vectors proto 1 — backend ${backend.name}`, () => {
    it("versi proto dikunci 1", () => {
      expect(vectors.proto).toBe(1);
    });

    for (const v of vectors.signChallenge) {
      it(`sign: ${v.name} → ${v.expect ? "valid" : "invalid"}`, async () => {
        expect(await backend.verify(v.signPub, v.deviceId, v.nonce, v.sig)).toBe(v.expect);
      });
    }

    for (const e of vectors.envelope) {
      const from = keyOf(e.fromDeviceId);
      const to = keyOf(e.toDeviceId);
      it(`envelope: ${e.name} terbuka oleh penerima`, async () => {
        expect(await backend.open(to, from, e.box)).toBe(e.plaintext);
      });
      it(`envelope: ${e.name} TIDAK terbuka pengirim (AAD arah)`, async () => {
        await expect(backend.open(from, to, e.box)).rejects.toThrow();
      });
      it(`envelope: ${e.name} seal() hidup roundtrip`, async () => {
        const live = await backend.seal(from, to, e.plaintext);
        expect(await backend.open(to, from, live)).toBe(e.plaintext);
      });
    }

    for (const h of vectors.sha256Hex) {
      it(`sha256Hex(${JSON.stringify(h.input.slice(0, 24))}…)`, async () => {
        expect(await backend.sha(h.input)).toBe(h.expect);
      });
    }
  });
}

/** Interop lintas backend: box dibuat web dibuka node (dan sebaliknya). */
describe("golden vectors — interop node ↔ web", () => {
  for (const e of vectors.envelope) {
    it(`box node ${e.name} terbuka web & sebaliknya (roundtrip)`, async () => {
      const from = keyOf(e.fromDeviceId);
      const to = keyOf(e.toDeviceId);
      const viaNode = node.seal(from, to, e.plaintext);
      expect(await web.open(to, from, viaNode)).toBe(e.plaintext);
      const viaWeb = await web.seal(from, to, e.plaintext);
      expect(node.open(to, from, viaWeb).toString("utf8")).toBe(e.plaintext);
    });
  }

  it("sign node diverifikasi web & sebaliknya", async () => {
    const alice = vectors.keys.alice!;
    const sig = node.signChallenge(alice.signPriv, alice.deviceId, "n-test-interop");
    expect(await web.verifyChallenge(alice.signPub, alice.deviceId, "n-test-interop", sig)).toBe(true);
    const sigWeb = await web.signChallenge(alice.signPriv, alice.deviceId, "n2");
    expect(node.verifyChallenge(alice.signPub, alice.deviceId, "n2", sigWeb)).toBe(true);
  });

  it("generateDeviceKeys web → PEM dipakai node (seal/open silang)", async () => {
    const nodeKeys = node.generateDeviceKeys();
    const webKeys = await web.generateDeviceKeys();
    const box = node.seal(
      { deviceId: nodeKeys.deviceId, dhPriv: nodeKeys.dhPriv },
      { deviceId: webKeys.deviceId, dhPub: webKeys.dhPub },
      "cross-backend",
    );
    expect(await web.open(
      { deviceId: webKeys.deviceId, dhPriv: webKeys.dhPriv },
      { deviceId: nodeKeys.deviceId, dhPub: nodeKeys.dhPub },
      box,
    )).toBe("cross-backend");
  });
});
