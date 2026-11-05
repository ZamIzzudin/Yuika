// @yuika/core — kompresi konteks v0 (P0-CORE-4).
// Saat estimasi token prompt mendekati jendela model (>70%), history LAMA
// diringkas aux model menjadi CHECKPOINT. Invariant append-only DIJAGA:
// tabel messages tidak pernah diubah — checkpoint adalah lapisan VIEW:
// prompt = system + ringkasan checkpoint + messages setelah batas potong.
//
// Fail-soft by design: aux call gagal → turn jalan apa adanya (tanpa kompresi),
// kompresi dicoba lagi di turn berikutnya. Tidak pernah memblokir pekerjaan.
import type { ProviderAdapter, InternalMessage } from "../provider/adapter.js";
import type { ISessionStore } from "./store.js";
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
  /** Karakter payload tool lama yang diarsipkan (diet prompt). */
  archivedChars: number;
}

export interface SlimOptions {
  /** Pesan terakhir yang SELALU utuh (tak diarsipkan). Default 8. */
  keepRecent: number;
  /** Payload tool melebihi ini (karakter) → diarsipkan. Default 2500. */
  maxToolChars: number;
}

export const DEFAULT_SLIM: SlimOptions = { keepRecent: 8, maxToolChars: 2_500 };

/** Diet prompt (fix dev-10: "task sederhana 30 menit" — prompt membengkak
 *  4.7k→3 0k token karena isi file terkirim ulang tiap iterasi): di VIEW
 *  (tabel messages tak pernah diubah), payload tool LAMA diarsipkan —
 *  hasil read_file panjang → potong head+tail; args write_file (isi file)
 *  → placeholder. Pesan terbaru selalu utuh; model bisa re-read bila butuh.
 *  Sama seperti kompresi: langkah ini FAIL-SAFE & view-only. */
export function slimHistory(view: InternalMessage[], opts: SlimOptions = DEFAULT_SLIM): { messages: InternalMessage[]; archivedChars: number } {
  const keep = Math.max(1, opts.keepRecent);
  if (view.length <= keep) return { messages: view, archivedChars: 0 };
  const cut = view.length - keep;
  let archivedChars = 0;
  const messages = view.map((m, i): InternalMessage => {
    if (i >= cut) return m; // pesan terbaru utuh
    if (m.role === "tool" && typeof m.content === "string" && m.content.length > opts.maxToolChars) {
      const head = m.content.slice(0, 400);
      const tail = m.content.slice(-200);
      const repl = `${head}\n…[arsip ${m.content.length} chars — read_file/search_files bila butuh detail]…\n${tail}`;
      archivedChars += m.content.length - repl.length;
      return { ...m, content: repl };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      let changed = false;
      const toolCalls = m.toolCalls.map((c) => {
        const args = c.args as Record<string, unknown>;
        const s = typeof args.content === "string" ? args.content : null;
        if (s && s.length > opts.maxToolChars) {
          changed = true;
          archivedChars += s.length;
          const p = typeof args.path === "string" ? args.path : "?";
          return { ...c, args: { ...args, content: `[arsip: isi file ${p} (${s.length} chars) sudah ditulis ke workspace — read_file bila perlu]` } };
        }
        return c;
      });
      return changed ? { ...m, toolCalls } : m;
    }
    return m;
  });
  return { messages, archivedChars };
}

/** Susun view konteks sesi; kompresi bila estimasi token melewati ambang. */
export async function buildContextMessages(
  store: ISessionStore,
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

  // Diet prompt SELALU jalan (view-only) — payload tool lama diarsipkan
  // sebelum keputusan kompresi; ini yang meredam pertumbuhan prompt tiap
  // iterasi walau jendela konteks masih jauh.
  const slimmed = slimHistory(current);
  current = slimmed.messages;

  // Belum layak/butuh kompresi → view apa adanya.
  if (before <= budget || all.length < opts.minMessages) {
    return { messages: current, compressed: false, messagesSummarized: 0, estTokensBefore: before, estTokensAfter: estimateTokens(current), archivedChars: slimmed.archivedChars };
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
    return { messages: current, compressed: false, messagesSummarized: 0, estTokensBefore: before, estTokensAfter: estimateTokens(current), archivedChars: slimmed.archivedChars };
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
    return { messages: current, compressed: false, messagesSummarized: 0, estTokensBefore: before, estTokensAfter: estimateTokens(current), archivedChars: slimmed.archivedChars };
  }

  store.saveContextCheckpoint(sessionId, toSummarize[toSummarize.length - 1]!.seq, summary, model);
  checkpoint = store.latestContextCheckpoint(sessionId); // refresh — closure view() membaca variable ini
  const post = slimHistory(view()); // rebuild dari checkpoint baru + diet ulang
  current = post.messages;
  const after = estimateTokens(current);
  return { messages: current, compressed: true, messagesSummarized: toSummarize.length, estTokensBefore: before, estTokensAfter: after, archivedChars: slimmed.archivedChars + post.archivedChars };
}
