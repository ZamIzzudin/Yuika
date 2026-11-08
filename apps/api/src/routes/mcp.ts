// @yuika/api, MCP: katalog, install, trust, audit, runtime uvx.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { YuiRuntime } from "@yuika/core";
import { InstallMcpRequest, SetMcpTrustRequest } from "@yuika/contracts";

export function registerMcpRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  /** GET /api/mcp/audit?limit=50, audit panggilan tool MCP (terbaru dulu). */
  app.get("/api/mcp/audit", async (req) => {
    const q = (req.query as Record<string, string | undefined>).limit;
    const limit = Math.min(Number(q ?? 50) || 50, 200);
    return { entries: getRt().mcpAuditRecent(limit) };
  });

  /** GET /api/mcp/catalog, katalog kurasi server MCP (P1-MCP-1). */
  app.get("/api/mcp/catalog", async () => ({ catalog: getRt().mcpCatalog() }));

  /** POST /api/mcp/install, pasang server dari katalog ke mcp.json (P1-MCP-1).
   *  Tidak auto-connect: fail-closed, user harus Trust setelah ini. */
  app.post("/api/mcp/install", async (req, reply) => {
    const body = InstallMcpRequest.parse(req.body);
    try {
      return getRt().installMcpServer(body.catalogId, body.env);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** DELETE /api/mcp/install?name=…, lepas server (disconnect + hapus deklarasi). */
  app.delete("/api/mcp/install", async (req, reply) => {
    const name = (req.query as Record<string, string | undefined>).name;
    if (!name) return reply.code(400).send({ error: "parameter name wajib" });
    try {
      return await getRt().uninstallMcpServer(name);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** GET /api/mcp/runtime, status uvx (server Python: git, time, sentry). */
  app.get("/api/mcp/runtime", async () => getRt().mcpUvxCheck());

  /** POST /api/mcp/runtime, jalankan installer resmi uv (astral.sh).
   *  UI WAJIB konfirmasi eksplisit dulu: ini memasang tool di mesin user. */
  app.post("/api/mcp/runtime", async (req, reply) => {
    const r = await getRt().mcpInstallUv();
    return reply.code(r.ok ? 200 : 500).send(r);
  });

  /** GET /api/mcp/servers, status trust + koneksi semua server MCP workspace. */
  app.get("/api/mcp/servers", async () => ({ servers: getRt().mcpServerStatuses() }));

  /** POST /api/mcp/servers, P0-MCP-1: hubungkan ulang server (parked/reconnecting)
   *  sekarang juga, tanpa menunggu backoff. */
  app.post("/api/mcp/servers", async (req, reply) => {
    const { server } = z.object({ server: z.string().min(1) }).parse(req.body);
    try {
      await getRt().mcpRetryConnect(server);
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** PUT /api/mcp/servers, set trust + deny list (connect/disconnect dinamis). */
  app.put("/api/mcp/servers", async (req, reply) => {
    const body = SetMcpTrustRequest.parse(req.body);
    try {
      return { entry: await getRt().setMcpTrust(body) };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
