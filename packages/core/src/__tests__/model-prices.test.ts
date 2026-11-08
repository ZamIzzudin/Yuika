// P1-MDL-3: price book, roundtrip file, biaya = metering × harga,
// model tanpa harga → null (bukan 0, jujur).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPriceBook, saveModelPrice, costOf } from "../model-prices.js";

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-price-"));
  file = path.join(dir, "model-prices.json");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("price book (P1-MDL-3)", () => {
  it("file belum ada → kosong; upsert → persist & roundtrip", () => {
    expect(loadPriceBook(file)).toEqual({});
    saveModelPrice(file, "glm/glm-5.1", { inputPerMillion: 0.6, outputPerMillion: 2.2, currency: "USD" });
    saveModelPrice(file, "glm/glm-5", { inputPerMillion: 0.6, outputPerMillion: 2.2, currency: "USD" });
    const book = loadPriceBook(file);
    expect(book["glm/glm-5.1"]).toMatchObject({ inputPerMillion: 0.6, currency: "USD" });
    expect(Object.keys(book)).toHaveLength(2);
    // upsert menimpa, bukan duplikat
    saveModelPrice(file, "glm/glm-5.1", { inputPerMillion: 1, outputPerMillion: 4, currency: "USD" });
    expect(loadPriceBook(file)["glm/glm-5.1"]).toMatchObject({ inputPerMillion: 1 });
  });

  it("costOf: metering × harga; tanpa harga → null (bukan 0)", () => {
    expect(costOf(500_000, 250_000, { inputPerMillion: 2, outputPerMillion: 6, currency: "USD" })).toBeCloseTo(2.5); // 0.5*2 + 0.25*6
    expect(costOf(1000, 1000, undefined)).toBeNull();
    expect(costOf(1000, 1000, { inputPerMillion: 0, outputPerMillion: 0, currency: "USD" })).toBeNull();
  });
});
