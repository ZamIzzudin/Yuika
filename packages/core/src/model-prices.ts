// @yui/core — price book (P1-MDL-3): harga per model untuk indikator biaya.
// File JSON di data/ (mirror model-overrides) — user isi lewat Settings.
// Estimasi biaya = metering (P1-CRED-1, tanpa estimasi token) × harga DI-SET
// user; model tanpa harga = biaya tidak dihitung (bukan 0 — jujur).
import fs from "node:fs";
import path from "node:path";
import { PriceBook, type ModelPrice } from "@yui/contracts";

export function loadPriceBook(file: string): PriceBook {
  try {
    return PriceBook.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    return {}; // belum ada / rusak → mulai kosong
  }
}

export function saveModelPrice(file: string, model: string, price: ModelPrice): PriceBook {
  const all = loadPriceBook(file);
  all[model] = price;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2), "utf-8");
  return all;
}

/** Biaya (unit mata uang price) dari token — 0 bila model tak berharga di buku. */
export function costOf(promptTokens: number, outputTokens: number, price: ModelPrice | undefined): number | null {
  if (!price || (!price.inputPerMillion && !price.outputPerMillion)) return null; // tanpa harga → tak dihitung
  return (promptTokens / 1_000_000) * price.inputPerMillion + (outputTokens / 1_000_000) * price.outputPerMillion;
}
