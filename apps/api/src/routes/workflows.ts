// @yuika/api, routes workflow (P2-FLOW): start/list/detail run, gate decision,
// stop. Default workflow = template 7 fase; custom diterima sebagai object
// atau teks YAML (divalidasi zod + lint, id unik, depends_on valid, tanpa siklus).
import type { FastifyInstance } from "fastify";
import type { YuiRuntime } from "@yuika/core";
import { z } from "zod";
import { SEVEN_PHASE_TEMPLATE_YAML, WorkflowDef, loadWorkflowYaml, lintWorkflow } from "@yuika/contracts";

const StartRunRequest = z.object({
  brief: z.string().max(4_000).optional(),
  /** Object WorkflowDef ATAU teks YAML workflow.yaml. Kosong = template 7 fase. */
  workflow: z.unknown().optional(),
  /** Sesi chat conductor sebagai lead (kendali via chat, 2026-11-08).
   *  Harus milik project ini. */
  leadSessionId: z.string().min(1).optional(),
});

const GateRequest = z.object({
  decision: z.enum(["approved", "rejected"]),
});

const SteerRequest = z.object({
  instruction: z.string().min(1).max(4_000),
});

const ReassignRequest = z.object({
  phaseId: z.string().min(1),
  stepId: z.string().min(1),
  persona: z.string().min(1),
});

/** Parse input workflow (object | YAML | undefined → template) + lint. */
function parseWorkflowInput(input: unknown): WorkflowDef {
  let def: WorkflowDef;
  if (input === undefined || input === null || input === "") {
    def = loadWorkflowYaml(SEVEN_PHASE_TEMPLATE_YAML);
  } else if (typeof input === "string") {
    def = loadWorkflowYaml(input);
  } else {
    def = WorkflowDef.parse(input);
  }
  const lint = lintWorkflow(def);
  if (lint.errors.length) throw new Error(`workflow tidak valid: ${lint.errors.join("; ")}`);
  return def;
}

export function registerWorkflowRoutes(app: FastifyInstance, getRt: () => YuiRuntime): void {
  app.post("/api/projects/:id/workflows/runs", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = StartRunRequest.parse(req.body ?? {});
    const rt = getRt();
    if (!rt.getProject(id)) return reply.code(404).send({ error: "project tidak ditemukan" });
    let workflow: WorkflowDef;
    try {
      workflow = parseWorkflowInput(body.workflow);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "workflow tidak valid" });
    }
    try {
      const started = rt.workflowEngine.startRun({
        projectId: id,
        workflow,
        brief: body.brief,
        leadSessionId: body.leadSessionId, // divalidasi engine (milik project?)
      });
      return reply.code(201).send(started);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "gagal memulai run" });
    }
  });

  app.get("/api/projects/:id/workflows/runs", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rt = getRt();
    if (!rt.getProject(id)) return reply.code(404).send({ error: "project tidak ditemukan" });
    const runs = rt.listWorkflowRuns(id).map((r) => ({ ...r, workflow: { name: r.workflow.name, phaseCount: r.workflow.phases.length } }));
    return { runs };
  });

  app.get("/api/workflows/runs/:runId", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = getRt().getWorkflowRun(runId);
    if (!run) return reply.code(404).send({ error: "run tidak ditemukan" });
    return { run };
  });

  app.post("/api/workflows/runs/:runId/gate", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const body = GateRequest.parse(req.body);
    const rt = getRt();
    if (!rt.getWorkflowRun(runId)) return reply.code(404).send({ error: "run tidak ditemukan" });
    const ok = rt.workflowEngine.approveGate(runId, body.decision);
    if (!ok) return reply.code(409).send({ error: "run tidak sedang menunggu gate" });
    return { ok: true };
  });

  app.post("/api/workflows/runs/:runId/stop", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const rt = getRt();
    if (!rt.getWorkflowRun(runId)) return reply.code(404).send({ error: "run tidak ditemukan" });
    rt.workflowEngine.stopRun(runId);
    return { ok: true };
  });

  // ── P2-FLOW-6: steering mid-run ──────────────────────────────────────────
  app.post("/api/workflows/runs/:runId/steer", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const body = SteerRequest.parse(req.body);
    if (!getRt().workflowEngine.steerRun(runId, body.instruction)) {
      return reply.code(409).send({ error: "run tidak aktif" });
    }
    return { ok: true };
  });

  app.post("/api/workflows/runs/:runId/pause", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    if (!getRt().workflowEngine.pauseRun(runId)) {
      return reply.code(409).send({ error: "run tidak aktif" });
    }
    return { ok: true };
  });

  app.post("/api/workflows/runs/:runId/resume", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    if (!getRt().workflowEngine.resumeRun(runId)) {
      return reply.code(409).send({ error: "run tidak aktif" });
    }
    return { ok: true };
  });

  app.post("/api/workflows/runs/:runId/steps/reassign", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const body = ReassignRequest.parse(req.body);
    const res = getRt().workflowEngine.reassignStep(runId, body.phaseId, body.stepId, body.persona);
    if (!res.ok) return reply.code(409).send({ error: res.error });
    return { ok: true };
  });

  /** Template 7 fase (YAML), dipakai UI utk preview/mulai cepat. */
  app.get("/api/workflows/template", async () => ({ yaml: SEVEN_PHASE_TEMPLATE_YAML }));
}
