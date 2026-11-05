// @yui/api — daftar persona + growth (P1-PER-4).
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yui/core";
import { PersonaGrowth } from "@yui/contracts";

export function registerPersonaRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.get("/api/personas", async () => ({ personas: getRt().listPersonas() }));

  /** GET /api/personas/growth — growth persona (level + statistik nyata). */
  app.get("/api/personas/growth", async () => PersonaGrowth.array().parse(getRt().personaGrowth()));
}
