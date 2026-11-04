// @yui/core — trace view per turn (P1-INF-4). Sumber: event store append-only
// (sudah ada) + usage ledger (latensi/token per panggilan model) — TANPA tabel
// baru; join berdasarkan window waktu turn per sesi. (pino + tabel log terpisah
// menyusul bersama deploy INF-5.)
import type { SessionTrace, TraceStep, TraceTurn } from "@yui/contracts";
import type { YuiEvent } from "@yui/contracts";
import type { SessionStore } from "./store.js";
import type { UsageLedger } from "../usage/ledger.js";

const TOOL_KIND = (name: string): TraceStep["kind"] =>
  name === "delegate_task" ? "delegate" : name.startsWith("mcp_") ? "tool" : "tool";

export function buildTrace(store: SessionStore, ledger: UsageLedger, sessionId: string): SessionTrace {
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
