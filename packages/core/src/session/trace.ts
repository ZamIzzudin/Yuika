// @yuika/core — trace view per turn (P1-INF-4). Sumber: event store append-only
// (sudah ada) + usage ledger (latensi/token per panggilan model) — TANPA tabel
// baru; join berdasarkan window waktu turn per sesi. (pino + tabel log terpisah
// menyusul bersama deploy INF-5.)
import type { SessionTrace, TraceStep, TraceTurn } from "@yuika/contracts";
import type { YuiEvent } from "@yuika/contracts";
import type { ISessionStore } from "./store.js";
import type { UsageLedger } from "../usage/ledger.js";

const TOOL_KIND = (name: string): TraceStep["kind"] =>
  name === "delegate_task" ? "delegate" : name.startsWith("mcp_") ? "tool" : "tool";

export function buildTrace(store: ISessionStore, ledger: UsageLedger, sessionId: string): SessionTrace {
  const events = store.getEvents(sessionId, 0);
  const turns: TraceTurn[] = [];
  let cur: TraceTurn | null = null;
  const toolNames = new Map<string, string>(); // callId → nama tool (tool.result tak membawa nama)

  for (const e of events) {
    const t = e.type;
    if (t === "turn.started") {
      cur = { turnId: e.turnId, startedAt: e.ts, endedAt: null, status: "running", steps: [], tokens: { input: 0, output: 0, calls: 0 } };
      turns.push(cur);
      continue;
    }
    if (!cur) continue;
    switch (t) {
      case "message.done":
        cur.steps.push({ at: e.ts, kind: "message", label: "pesan selesai", durationMs: null, isError: false });
        break;
      case "tool.call": {
        const ev = e as Extract<YuiEvent, { type: "tool.call" }>;
        toolNames.set(ev.callId, ev.name);
        cur.steps.push({ at: e.ts, kind: TOOL_KIND(ev.name), label: `${ev.name}${summarizeArgs(ev.args)}`, durationMs: null, isError: false });
        break;
      }
      case "tool.result": {
        const ev = e as Extract<YuiEvent, { type: "tool.result" }>;
        const name = toolNames.get(ev.callId) ?? "tool";
        cur.steps.push({
          at: e.ts,
          kind: TOOL_KIND(name),
          label: ev.isError ? `${name} GAGAL` : `${name} ok`,
          durationMs: null,
          isError: ev.isError,
        });
        break;
      }
      case "delegation.started": {
        const ev = e as Extract<YuiEvent, { type: "delegation.started" }>;
        cur.steps.push({ at: e.ts, kind: "delegate", label: `→ ${ev.personaId.replace("yui-", "")}: ${ev.goal.slice(0, 60)}`, durationMs: null, isError: false });
        break;
      }
      case "delegation.done": {
        const ev = e as Extract<YuiEvent, { type: "delegation.done" }>;
        cur.steps.push({ at: e.ts, kind: "delegate", label: `← anak ${ev.childSessionId.slice(0, 10)} selesai`, durationMs: null, isError: false });
        break;
      }
      case "approval.requested":
        cur.steps.push({ at: e.ts, kind: "approval", label: "menunggu persetujuan", durationMs: null, isError: false });
        break;
      case "approval.resolved":
        cur.steps.push({ at: e.ts, kind: "approval", label: "persetujuan dijawab", durationMs: null, isError: false });
        break;
      case "session.error":
        cur.status = "error";
        cur.steps.push({ at: e.ts, kind: "error", label: (e as Extract<YuiEvent, { type: "session.error" }>).message.slice(0, 120), durationMs: null, isError: true });
        break;
      case "memory.noted":
        cur.steps.push({ at: e.ts, kind: "memory", label: "memori dicatat", durationMs: null, isError: false });
        break;
      case "skill.proposed":
        cur.steps.push({ at: e.ts, kind: "skill", label: "draf skill diajukan", durationMs: null, isError: false });
        break;
      case "turn.cancelled":
        cur.status = "cancelled";
        cur.endedAt = e.ts;
        break;
      case "persona.state": {
        const ev = e as Extract<YuiEvent, { type: "persona.state" }>;
        if (ev.state === "done" || ev.state === "idle") {
          cur.status = cur.status === "error" ? "error" : cur.status === "cancelled" ? "cancelled" : "done";
          cur.endedAt ??= e.ts;
        }
        break;
      }
      default:
        break; // message.delta & lainnya: terlalu ramai untuk trace
    }
  }

  // Join panggilan model (ledger) per turn via window waktu — langkah "model"
  // disisipkan kronologis, latensi = kolom latencyMs ledger.
  const all = ledger.recent(500, { sessionId });
  for (const turn of turns) {
    const end = turn.endedAt ?? Number.MAX_SAFE_INTEGER;
    const calls = all.filter((u) => u.at >= turn.startedAt && u.at <= end).sort((a, b) => a.at - b.at);
    turn.tokens = {
      input: calls.reduce((s, c) => s + c.promptTokens, 0),
      output: calls.reduce((s, c) => s + c.outputTokens, 0),
      calls: calls.length,
    };
    for (const c of calls) {
      turn.steps.push({ at: c.at, kind: "model", label: `${c.model} · ${c.personaId.replace("yui-", "")} · ${c.promptTokens}+${c.outputTokens} tok`, durationMs: c.latencyMs, isError: false });
    }
    turn.steps.sort((a, b) => a.at - b.at);
  }

  return { sessionId, turns };
}

function summarizeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (!keys.length) return "";
  const first = keys[0]!;
  const v = args[first];
  const val = typeof v === "string" ? `"${v.slice(0, 40)}"` : typeof v === "object" ? "{…}" : String(v);
  return `(${first}: ${val}${keys.length > 1 ? `, +${keys.length - 1}` : ""})`;
}

// ── Project activity feed (Batch 14a++, user 2026-11) ────────────────────────
// Logs tab = observability PROJECT-WIDE: semua langkah persona di semua sesi
// project (tool calls, screen, vault, delegasi, approval) — bukan hanya sesi
// chat aktif. Digabung dengan browser visits di layer route.
export interface ProjectActivityItem {
  at: number;
  sessionId: string;
  personaId: string;
  kind: "tool" | "screen" | "vault" | "delegation" | "approval";
  label: string;
  isError?: boolean;
}

export function buildProjectActivity(
  store: ISessionStore,
  projectId: string,
  limit = 200,
): ProjectActivityItem[] {
  const out: ProjectActivityItem[] = [];
  const sessions = store.listProjectSessions(projectId);
  for (const sess of sessions) {
    // ambil ekor event saja (sesi panjang tak perlu dibaca penuh)
    const evs = store.getEvents(sess.id, 0).slice(-500);
    const nameByCall = new Map<string, string>();
    for (const e of evs) {
      if (e.type === "tool.call") {
        const ev = e as Extract<YuiEvent, { type: "tool.call" }>;
        nameByCall.set(ev.callId, ev.name);
      }
    }
    for (const e of evs) {
      const base = { at: e.ts, sessionId: sess.id, personaId: sess.personaId };
      switch (e.type) {
        case "tool.call": {
          const ev = e as Extract<YuiEvent, { type: "tool.call" }>;
          out.push({ ...base, kind: "tool", label: `${ev.name}${summarizeArgs(ev.args)}` });
          break;
        }
        case "tool.result": {
          const ev = e as Extract<YuiEvent, { type: "tool.result" }>;
          if (ev.isError) out.push({ ...base, kind: "tool", label: `${nameByCall.get(ev.callId) ?? "tool"} failed`, isError: true });
          break;
        }
        case "screen.state": {
          const ev = e as Extract<YuiEvent, { type: "screen.state" }>;
          out.push({ ...base, kind: "screen", label: `browser → ${ev.url}` });
          break;
        }
        case "vault.used":
          out.push({ ...base, kind: "vault", label: `vault used (${(e as { name: string }).name})` });
          break;
        case "vault.requested":
          out.push({ ...base, kind: "vault", label: `credential needed (${(e as { name: string }).name})` });
          break;
        case "delegation.started": {
          const ev = e as Extract<YuiEvent, { type: "delegation.started" }>;
          out.push({ ...base, kind: "delegation", label: `delegated → ${ev.personaId}` });
          break;
        }
        case "approval.requested":
          out.push({ ...base, kind: "approval", label: `approval: ${(e as { tool: string }).tool}` });
          break;
      }
    }
  }
  out.sort((a, b) => b.at - a.at);
  return out.slice(0, limit);
}
