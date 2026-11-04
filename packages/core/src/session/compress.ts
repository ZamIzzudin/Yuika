// @yui/core — kompresi konteks v0 (P0-CORE-4).
// Saat estimasi token prompt mendekati jendela model (>70%), history LAMA
// diringkas aux model menjadi CHECKPOINT. Invariant append-only DIJAGA:
// tabel messages tidak pernah diubah — checkpoint adalah lapisan VIEW:
// prompt = system + ringkasan checkpoint + messages setelah batas potong.
//
// Fail-soft by design: aux call gagal → turn jalan apa adanya (tanpa kompresi),
// kompresi dicoba lagi di turn berikutnya. Tidak pernah memblokir pekerjaan.
import type { ProviderAdapter, InternalMessage } from "../provider/adapter.js";
import type { SessionStore } from "./store.js";
import { estimateTokens } from "./tokens.js";

export interface CompressOptions {
  /** Estimasi kapasitas konteks model (token). Default 128k, override utk test. */
  contextTokens: number;
  /** Ambang mulai kompresi (fraksi jendela). Default 0.7. */
  threshold: number;
  /** Pesan terbaru yang SELALU utuh (tidak ikut diringkas). Default 6. */
  keepRecent: number;
  /** Minimal jumlah pesan sebelum kompresi dianggap layak. Default 10. */
  minMessages: number;
}

export const DEFAULT_COMPRESS: CompressOptions = {
  contextTokens: 128_000,
  threshold: 0.7,
  keepRecent: 6,
  minMessages: 10,
};

const SUMMARY_PROMPT =
  "Kamu membuat ringkasan konteks untuk asisten AI yang melanjutkan sesi kerja panjang. " +
  "Ringkas percakapan di bawah menjadi maksimal 300 kata. WAJIB memuat: (1) tujuan/tugas user, " +
  "(2) keputusan penting & alasannya, (3) artefak/file yang dibuat/diubah (nama persis), " +
  "(4) istilah/nama khusus yang dipakai, (5) langkah tersisa/todo, (6) preferensi user yang diketahui. " +
  "Output HANYA ringkasannya, tanpa pembuka.";

export interface CompressResult {
  /** View messages untuk prompt (BELUM termasuk system prompt). */
  messages: InternalMessage[];
  /** Terjadi kompresi baru pada panggilan ini (checkpoint baru dibuat). */
  compressed: boolean;
  messagesSummarized: number;
  estTokensBefore: number;
  estTokensAfter: number;
}

/** Susun view konteks sesi; kompresi bila estimasi token melewati ambang. */
export async function buildContextMessages(
  store: SessionStore,
  provider: ProviderAdapter,
  model: string,
  sessionId: string,
  opts: CompressOptions = DEFAULT_COMPRESS,
  /** Metering aux call (hanya bila provider mengembalikan usage — tanpa estimasi). */
  recordAuxUsage?: (u: { inputTokens: number; outputTokens: number; latencyMs: number }) => void,
): Promise<CompressResult> {
  const all = store.getMessagesWithSeq(sessionId);
  let checkpoint = store.latestContextCheckpoint(sessionId);
  // View basis: ringkasan checkpoint (bila ada) + pesan setelah batas potong.
  const view = (): InternalMessage[] => {
    const out: InternalMessage[] = [];
    if (checkpoint) {
      out.push({
        role: "user",
        content: `[ringkasan sesi sebelumnya — konteks dikompresi otomatis]\n${checkpoint.summary}`,
      });
      out.push({
        role: "assistant",
        content: "Baik, aku melanjutkan dari ringkasan di atas.",
      });
    }
    for (const { seq, msg } of all) if (seq > (checkpoint?.uptoSeq ?? 0)) out.push(msg);
    return out;
  };

  let current = view();
  const budget = Math.floor(opts.contextTokens * opts.threshold);
  const before = estimateTokens(current);

  // Belum layak/butuh kompresi → view apa adanya.
  if (before <= budget || all.length < opts.minMessages) {
    return { messages: current, compressed: false, messagesSummarized: 0, estTokensBefore: before, estTokensAfter: before };
  }

  // Batas potong AMAN: pesan ke-(len-keepRecent), digeser maju sampai berada
  // tepat sebelum pesan `user` (tidak memotong pasangan toolCalls/tool-result).
  const cpSeq = checkpoint?.uptoSeq ?? 0;
  const alreadySummarized = checkpoint ? all.filter((m) => m.seq <= cpSeq).length : 0;
  const cutIdx = Math.max(1, all.length - opts.keepRecent);
  let cut = cutIdx;
  while (cut < all.length && all[cut]!.msg.role !== "user") cut++;
  // Tak ada titik potong aman (semua sisa = satu blok) atau tidak ada yang baru
  // untuk diringkas → tunda kompresi ke turn berikutnya.
  if (cut <= alreadySummarized || cut >= all.length) {
    return { messages: current, compressed: false, messagesSummarized: 0, estTokensBefore: before, estTokensAfter: before };
  }

  const toSummarize = all.slice(0, cut);
  const transcript = toSummarize
    .map(({ msg }) => `${msg.role}: ${msg.content ?? ""}${msg.toolCalls ? ` [tool: ${msg.toolCalls.map((c) => c.name).join(",")}]` : ""}`)
    .join("\n")
    .slice(0, 120_000);

  let summary: string;
  try {
    const tAux = Date.now();
    const res = await provider.chatStream(
      { model, messages: [{ role: "user", content: `${SUMMARY_PROMPT}\n\n---\n${transcript}` }], tools: [] },
      () => {},
    );
    summary = res.text.trim();
    if (!summary) throw new Error("ringkasan kosong");
    if (res.usage && recordAuxUsage) {
      recordAuxUsage({ inputTokens: res.usage.inputTokens ?? 0, outputTokens: res.usage.outputTokens ?? 0, latencyMs: Date.now() - tAux });
    }
  } catch {
    // Fail-soft: tanpa kompresi — jangan ganggu turn user.
    return { messages: current, compressed: false, messagesSummarized: 0, estTokensBefore: before, estTokensAfter: before };
  }

  store.saveContextCheckpoint(sessionId, toSummarize[toSummarize.length - 1]!.seq, summary, model);
  checkpoint = store.latestContextCheckpoint(sessionId); // refresh — closure view() membaca variable ini
  current = view(); // rebuild dari checkpoint baru
  const after = estimateTokens(current);
  return { messages: current, compressed: true, messagesSummarized: toSummarize.length, estTokensBefore: before, estTokensAfter: after };
}
