// P0-QA-1, mock provider OpenAI-compatible untuk E2E smoke.
// Deterministik & tanpa biaya: spec mengantri "script" jawaban via POST /__script,
// server menjawab POST /v1/chat/completions dengan SSE stream standar OpenAI.
// Panggilan tanpa script (mis. learn nudge) dijawab fallback "ok".
import http from "node:http";

const PORT = Number(process.env.E2E_MOCK_PORT ?? 3299);

/** FIFO script: { text?, reasoning?, toolCalls?: [{ id, name, args }] } */
const queue = [];
let n = 0;

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function chunk(delta, finish = null) {
  return {
    id: `cmpl-mock-${++n}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "mock-model",
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

/** Jawab satu completion sesuai script (atau fallback). */
function answer(res, script) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  // reasoning_content (GLM-compat), streaming "thinking"
  if (script?.reasoning) for (const w of script.reasoning.split(" ")) sse(res, chunk({ reasoning_content: w + " " }));
  if (script?.text) for (const w of script.text.split(" ")) sse(res, chunk({ content: w + " " }));
  if (script?.toolCalls?.length) {
    // kirim seluruh args dalam satu delta per call (SDK openai meng-akumulasi per index)
    for (let i = 0; i < script.toolCalls.length; i++) {
      const c = script.toolCalls[i];
      sse(res, chunk({ tool_calls: [{ index: i, id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } }] }));
    }
    sse(res, chunk({}, "tool_calls"));
  } else {
    sse(res, chunk({}, "stop"));
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (req.method === "GET" && url.pathname === "/__health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.method === "GET" && url.pathname === "/__queue") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ pending: queue.length }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/__script") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      // menerima satu objek atau array
      const parsed = JSON.parse(body || "{}");
      if (Array.isArray(parsed)) queue.push(...parsed);
      else queue.push(parsed);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ pending: queue.length }));
    });
    return;
  }
  if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
    // konsumsi script FIFO; tanpa script → fallback netral
    const script = queue.shift() ?? { text: "ok" };
    answer(res, script);
    return;
  }
  res.writeHead(404).end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-provider] http://127.0.0.1:${PORT} (openai-compat, queue=${queue.length})`);
});
