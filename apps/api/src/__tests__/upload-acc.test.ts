// @yuika/api, test assembler upload relay (v1.3): fragmen base64 → file utuh,
// guard batas ukuran, idempotensi retry, entri basi.
import { describe, expect, it } from "vitest";
import { UploadAssembler, UploadRejectedError, UPLOAD_MAX_BYTES } from "../portal/upload-acc.js";

function chunked(b64: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += size) out.push(b64.slice(i, i + size));
  return out;
}

describe("UploadAssembler (relay v1.3)", () => {
  it("fragmen berurut → done dengan base64 utuh", () => {
    const a = new UploadAssembler();
    const b64 = Buffer.from("hello upload v13").toString("base64"); // 1 fragmen tidak aligned? pakai 2
    const parts = chunked(b64, 8); // paksa multi-fragmen aligned (8 % 4 == 0)
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((c, i) => {
      if (i === parts.length - 1) return; // final dikirim terpisah di bawah
      expect(a.add("d1", "s1", "doc.md", i, parts.length, c)).toEqual({ done: false });
    });
    const last = a.add("d1", "s1", "doc.md", parts.length - 1, parts.length, parts[parts.length - 1]!);
    expect(last.done).toBe(true);
    if (last.done) expect(Buffer.from(last.dataB64, "base64").toString()).toBe("hello upload v13");
    expect(a.size()).toBe(0); // entri dikonsumsi
  });

  it("fragmen terduplikasi (retry) idempoten", () => {
    const a = new UploadAssembler();
    const b64 = Buffer.from("0123456789").toString("base64");
    const parts = chunked(b64, 8);
    a.add("d1", "s1", "a.txt", 0, parts.length, parts[0]!);
    const r = a.add("d1", "s1", "a.txt", 0, parts.length, parts[0]!); // retry sama
    expect(r.done).toBe(false);
  });

  it("fragmen konflik (isi beda index sama) → rejected + reset", () => {
    const a = new UploadAssembler();
    expect(() => a.add("d1", "s1", "a.txt", 0, 2, "AAAA")).not.toThrow();
    expect(() => a.add("d1", "s1", "a.txt", 0, 2, "BBBB")).toThrow(UploadRejectedError);
  });

  it("chunk tidak base64 / tidak aligned / index rusak → rejected", () => {
    const a = new UploadAssembler();
    expect(() => a.add("d1", "s1", "a.txt", 0, 1, "A")).toThrow(/aligned/);
    expect(() => a.add("d1", "s1", "a.txt", 0, 1, "!!!!")).toThrow(/base64/);
    expect(() => a.add("d1", "s1", "a.txt", 5, 2, "AAAA")).toThrow(/malformed/);
  });

  it("melebihi 10MB total fragmen → rejected", () => {
    const a = new UploadAssembler();
    const many = "A".repeat(240_000); // satu fragmen besar
    expect(() => {
      for (let i = 0; i < 60; i++) a.add("d1", "s1", "big.bin", i, 60, many);
    }).toThrow(UploadRejectedError);
    expect(UPLOAD_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it("perangkat/sesi/nama berbeda = entri terpisah", () => {
    const a = new UploadAssembler();
    expect(a.add("d1", "s1", "x.md", 0, 2, "AAAA").done).toBe(false);
    expect(a.add("d2", "s1", "x.md", 0, 2, "AAAA").done).toBe(false); // device lain
    expect(a.add("d1", "s2", "x.md", 0, 2, "AAAA").done).toBe(false); // sesi lain
    expect(a.size()).toBe(3);
  });
});
