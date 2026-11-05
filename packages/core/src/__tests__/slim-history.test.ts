// Fix dev-10 ("task sederhana 30 menit"): prompt sesi membengkak 4.7k→30k token
// karena isi file terkirim ulang penuh TIAP iterasi (args write_file & hasil
// read_file menetap di history). slimHistory mengarsipkan payload tool LAMA di
// VIEW — tabel messages tak pernah diubah (invariant append-only dijaga).
import { describe, expect, it } from "vitest";
import { slimHistory, DEFAULT_SLIM } from "../session/compress.js";
import type { InternalMessage } from "../provider/adapter.js";

const big = "x".repeat(20_000);

describe("slimHistory — diet prompt view-only", () => {
  it("hasil read_file lama diarsipkan head+tail; write_file args lama jadi placeholder; pesan terbaru UTUH", () => {
    const view: InternalMessage[] = [
      { role: "user", content: "tolong tulis landing page" },
      { role: "assistant", content: "oke", toolCalls: [{ id: "c1", name: "write_file", args: { path: "code/index.html", content: big } }] },
      { role: "tool", content: JSON.stringify({ ok: true }), toolCallId: "c1" },
      { role: "assistant", content: "cek", toolCalls: [{ id: "c2", name: "read_file", args: { path: "code/index.html" } }] },
      { role: "tool", content: big, toolCallId: "c2" },
      { role: "assistant", content: "lanjut", toolCalls: [{ id: "c3", name: "write_file", args: { path: "code/about.html", content: big } }] },
      { role: "tool", content: '{"ok":true}', toolCallId: "c3" },
      { role: "user", content: "bagus, sekarang footer" },
      { role: "assistant", content: "oke", toolCalls: [{ id: "c4", name: "write_file", args: { path: "code/footer.html", content: big } }] },
      { role: "tool", content: '{"ok":true}', toolCallId: "c4" },
    ];
    // keepRecent kecil supaya semua kecuali 2 terakhir diarsipkan
    const { messages, archivedChars } = slimHistory(view, { keepRecent: 2, maxToolChars: 2500 });

    expect(archivedChars).toBeGreaterThan(30_000); // 3 file 20k diarsipkan
    // args write_file lama → placeholder (path tetap terlihat)
    const oldCall = messages[1]!.toolCalls![0]!.args as { path: string; content: string };
    expect(oldCall.content).toContain("arsip");
    expect(oldCall.content).toContain("code/index.html");
    // hasil read_file lama → head+tail + penanda arsip
    expect(messages[4]!.content).toContain("[arsip");
    // pesan TERAKHIR utuh — pekerjaan berjalan tak terganggu
    const lastCall = messages[messages.length - 2]!.toolCalls![0]!.args as { content: string };
    expect(lastCall.content).toBe(big);

    // view-only: input tak dimutasi (invariant append-only di level caller)
    expect(view[1]!.toolCalls![0]!.args.content).toBe(big);
  });

  it("history pendek (≤ keepRecent) tak tersentuh", () => {
    const view: InternalMessage[] = [
      { role: "user", content: "hi" },
      { role: "tool", content: big, toolCallId: "c1" },
    ];
    const { messages, archivedChars } = slimHistory(view);
    expect(archivedChars).toBe(0);
    expect(messages[1]!.content).toBe(big);
  });

  it("payload kecil (< maxToolChars) tak diarsipkan", () => {
    const view: InternalMessage[] = [
      { role: "user", content: "hi" },
      { role: "tool", content: "kecil saja", toolCallId: "c1" },
      { role: "assistant", content: "done" },
    ];
    const { archivedChars } = slimHistory(view, { keepRecent: 1, maxToolChars: DEFAULT_SLIM.maxToolChars });
    expect(archivedChars).toBe(0);
  });
});
