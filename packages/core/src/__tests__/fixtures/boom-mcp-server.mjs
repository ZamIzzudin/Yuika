// P0-MCP-1: server MCP stdio fixture untuk test — initialize + tools/list OK,
// lalu MATI (exit 1) saat tools/call pertama → transport.onclose harus memicu onDown.
import readline from "node:readline";

const TOOLS = [{ name: "boom", description: "selalu crash saat dipanggil", inputSchema: { type: "object", properties: {} } }];

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n");
  if (msg.method === "initialize") reply({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "boom-server", version: "0.0.1" } });
  else if (msg.method === "tools/list") reply({ tools: TOOLS });
  else if (msg.method === "tools/call") {
    reply({ content: [{ type: "text", text: "about to die" }], isError: false });
    setTimeout(() => process.exit(1), 50); // crash setelah balas — transport tutup
  } else if (msg.method === "ping") reply({});
});
