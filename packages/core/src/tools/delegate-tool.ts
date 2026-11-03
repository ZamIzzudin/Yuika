// @yui/core — delegate_task: delegasi ke persona spesialis (prioritas #3, PLAN §4.6).
import { z } from "zod";
import { registry } from "../registry.js";
import type { DelegationDeps, ChildRunHandle } from "../delegation/runner.js";
import { runChildPersona } from "../delegation/runner.js";

const schema = z.object({
  persona: z.string().min(1).describe("persona id, mis. yui-scholar"),
  goal: z.string().min(1).describe("tujuan anak, spesifik dan berdiri sendiri"),
  context: z.string().nullish().describe("konteks tambahan untuk anak (opsional)"),
});

export function registerDelegateTool(deps: DelegationDeps): void {
  registry.register({
    name: "delegate_task",
    description:
      "Delegasikan sub-tugas ke persona spesialis (mis. riset → yui-scholar, menulis → yui-scribe, desain → yui-designer). " +
      "Kembalikan ringkasan hasil anak. Gunakan untuk tugas yang butuh keahlian domain.",
    parameters: schema,
    handler: async (args: z.infer<typeof schema>, ctx) => {
      // P1-PRJ-2: anak mewarisi scope workspace sesi pemanggil (project root bila
      // sesi parent melekat ke project) — bukan workspace global proses.
      const handle: ChildRunHandle = runChildPersona(
        { ...deps, workspacePath: ctx.workspacePath },
        { sessionId: ctx.sessionId, turnId: ctx.turnId },
        args.persona,
        args.goal,
        args.context ?? null,
        ctx.emit,
      );
      const summary = await handle.summary;
      return { result: { persona: args.persona, childSessionId: handle.childSessionId, summary } };
    },
  });
}
