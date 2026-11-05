// P1 fix 2026-11: cold start `uvx`/`npx` (unduh paket pertama) melampaui timeout
// handshake SDK default 60s → -32001 "Request timed out" + proses anak zombie.
// Fixture: initialize DIBALAS LAMBAT (delay via argv[2]) → menguji connectTimeoutMs.
// argv[3]: path pidfile — fixture menulis PID-nya (test memverifikasi proses anak
// benar-benar dimatikan saat handshake gagal; portabel: tak andalkan sinyal,
// di Windows TerminateProcess tak menjalankan handler).
import readline from "node:readline";
import { writeFileSync } from "node:fs";

const delayMs = Number(process.argv[2] ?? 0);
const pidfile = process.argv[3];
if (pidfile) writeFileSync(pidfile, String(process.pid));

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const reply = (result) =>
    setTimeout(
      () => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n"),
      msg.method === "initialize" ? delayMs : 0,
    );
  if (msg.method === "initialize")
    reply({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "slow-server", version: "0.0.1" } });
  else if (msg.method === "tools/list")
    reply({ tools: [{ name: "slow", description: "server lambat", inputSchema: { type: "object", properties: {} } }] });
  else if (msg.method === "ping") reply({});
});
