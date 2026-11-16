// G-BETA load test: N sesi paralel, ukur turn-start (POST message -> event
// pertama SSE) + turn selesai. Target: p95 turn-start < 2 dtk @ 100 sesi.
//
// Zero-dep (fetch bawaan Node 24). Jalankan melawan stack lokal dengan
// mock provider (biaya nol), mis.:
//   YUI_API_PORT=3391 YUI_DB_PATH=.tmp-load/load.db YUI_WORKSPACE_DIR=.tmp-load/ws \
//   YUI_OPENAI_BASE_URL=http://127.0.0.1:3299/v1 YUI_OPENAI_API_KEY=x YUI_MODEL=mock-model \
//   npx tsx apps/api/src/server.ts
//   node e2e/mock-provider.mjs   (terminal lain; script /__script utk jawaban)
//   node scripts/load-test.mjs --url http://127.0.0.1:3391 --sessions 100
//
// Melawan host ber-auth: --token <bearer> (mode terbuka di stack kosong:
// tanpa token). Persona default yui-scribe (pelaksana, tanpa delegasi).
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : def;
};
const URL_BASE = flag("url", "http://127.0.0.1:3211").replace(/\/$/, "");
const N = Number(flag("sessions", 20));
const TOKEN = flag("token", "");
const PERSONA = flag("persona", "yui-scribe");
const PROMPT = flag("prompt", "Reply with exactly LOAD-OK and nothing else.");

const h = TOKEN ? { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" } : { "content-type": "application/json" };
const api = async (path, init) => {
  const r = await fetch(URL_BASE + path, { ...init, headers: h });
  if (!r.ok) throw new Error(`${path} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

function pct(sorted, p) {
  if (!sorted.length) return -1;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}
const ms = (v) => `${(v / 1000).toFixed(2)}s`;

// ── setup ────────────────────────────────────────────────────────────
const personas = (await api("/api/personas")).personas;
if (!personas.some((p) => p.id === PERSONA)) throw new Error(`persona ${PERSONA} tidak ada (lihat /api/personas)`);
const proj = await api("/api/projects", { method: "POST", body: JSON.stringify({ name: `load ${new Date().toISOString()}`, description: "load test" }) });
const projectId = proj.project?.id ?? proj.id ?? proj.projectId;
// Sesi di dalam project wajib persona ter-assign roster (guard roster).
await api(`/api/projects/${projectId}/roster`, { method: "PUT", body: JSON.stringify({ roster: [{ personaId: PERSONA, role: "load", phases: [], mcp: [] }] }) });
console.log(`target ${URL_BASE} | ${N} sesi paralel | persona ${PERSONA} | project ${projectId}`);

// ── satu sesi: create -> SSE listen -> message -> tunggu message.done ─
async function oneSession(i) {
  const { sessionId } = await api("/api/sessions", { method: "POST", body: JSON.stringify({ personaId: PERSONA, projectId }) });
  const ctrl = new AbortController();
  const res = await fetch(`${URL_BASE}/api/sessions/${sessionId}/stream?since=0${TOKEN ? `&auth_token=${encodeURIComponent(TOKEN)}` : ""}`, {
    signal: ctrl.signal,
    headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
  });
  if (!res.ok || !res.body) throw new Error(`stream ${sessionId} -> ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let firstEvent = -1;
  let done = -1;
  const t0 = Date.now();
  const msg = api(`/api/sessions/${sessionId}/message`, { method: "POST", body: JSON.stringify({ text: PROMPT }) });
  const readLoop = (async () => {
    while (true) {
      const { done: ended, value } = await reader.read();
      if (ended) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        if (firstEvent < 0) firstEvent = Date.now();
        try {
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === "message.done" || ev.type === "session.error" || ev.type === "turn.failed") {
            done = Date.now();
            ctrl.abort();
            return;
          }
        } catch {
          /* baris non-JSON: abaikan */
        }
      }
    }
  })();
  await Promise.all([msg, readLoop]).catch(() => {});
  ctrl.abort();
  return { start: firstEvent - t0, total: done > 0 ? done - t0 : -1, sessionId };
}

// ── run paralel penuh ────────────────────────────────────────────────
console.log("start…");
const t = Date.now();
const results = await Promise.allSettled(Array.from({ length: N }, (_, i) => oneSession(i)));
const wall = Date.now() - t;

const ok = results.filter((r) => r.status === "fulfilled" && r.value.start >= 0);
const fails = results.filter((r) => r.status === "rejected");
const errEvents = results.filter((r) => r.status === "fulfilled" && r.value.start < 0);
const starts = ok.map((r) => r.value.start).sort((a, b) => a - b);
const totals = ok.map((r) => r.value.total).filter((v) => v > 0).sort((a, b) => a - b);

console.log(`\nsesi OK ${ok.length}/${N} | gagal ${fails.length + errEvents.length} | wall ${ms(wall)}`);
if (fails.length) fails.slice(0, 3).forEach((f) => console.log("  err:", String(f.reason).slice(0, 160)));
if (starts.length) {
  console.log(`turn-start  p50 ${ms(pct(starts, 50))}  p95 ${ms(pct(starts, 95))}  p99 ${ms(pct(starts, 99))}  max ${ms(starts[starts.length - 1])}`);
  if (totals.length) console.log(`turn-total  p50 ${ms(pct(totals, 50))}  p95 ${ms(pct(totals, 95))}`);
  const gate = pct(starts, 95);
  console.log(gate < 2000 ? `GERBANG p95<2s: PASS (${ms(gate)})` : `GERBANG p95<2s: FAIL (${ms(gate)})`);
  process.exit(gate < 2000 ? 0 : 2);
}
process.exit(1);
