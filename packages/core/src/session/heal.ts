// @yuika/core — boot heal (P0 reliabilitas): turn yang mati bersama proses lama
// ditutup JUJUR saat server start — session.error (penjelasan) + persona.state
// idle + delegation.done sintetis untuk anak yang menggantung. Tanpa ini,
// replay UI menampilkan "berjalan"/chip thinking ZOMBIE selamanya (feedback
// user dev-10: matikan server saat iterasi → task tak kunjung selesai).
// Idempoten secara alami: heal menutup turn → tak lagi "interrupted".
import type { ISessionStore } from "./store.js";

export function healInterruptedTurns(store: ISessionStore): string[] {
  const healed: string[] = [];
  for (const it of store.findInterruptedTurns()) {
    const evs = store.getEvents(it.sessionId, it.lastTurnEventId); // setelah turn.started terakhir
    // Delegasi anak yang menggantung (started tanpa done) → tutup sintetis,
    // supaya kartu DelegationCard/TaskDrawer tidak "working" zombie.
    const doneChildren = new Set(evs.filter((e) => e.type === "delegation.done").map((e) => e.childSessionId));
    for (const e of evs) {
      if (e.type === "delegation.started" && !doneChildren.has(e.childSessionId)) {
        store.appendEvent(e.sessionId, {
          type: "delegation.done",
          turnId: e.turnId,
          childSessionId: e.childSessionId,
          summary: "_(terputus — server direstart saat persona anak berjalan)_",
        });
      }
    }
    store.appendEvent(it.sessionId, {
      type: "session.error",
      message:
        "Turn sebelumnya terputus — dev server direstart saat sedang berjalan. Tidak ada proses di belakang; kirim ulang bila perlu.",
      recoverable: true,
    });
    store.appendEvent(it.sessionId, { type: "persona.state", personaId: it.personaId, state: "idle" });
    healed.push(it.sessionId);
  }
  // P0-DEL-1: tutup job delegasi yang masih 'running' (proses mati bersama server)
  // → 'interrupted'. Tabel job = sumber kebenaran status lintas restart — tanpa
  // ini, job terlihat berjalan selamanya di audit/monitor.
  for (const job of store.findRunningDelegationJobs()) {
    store.finishDelegationJob(job.id, {
      status: "interrupted",
      error: "server direstart saat job berjalan",
    });
  }
  return healed;
}
