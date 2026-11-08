// @yuika/contracts, Memory (P1-MEM-1): dua dokumen editable milik user,
// USER.md (workspace, lintas project) & MEMORY.md (per project).
// Agent hanya append terkurasi via tool memory_append; user bisa menimpa utuh.
import { z } from "zod";

export const MemoryScope = z.enum(["user", "project"]);
export type MemoryScope = z.infer<typeof MemoryScope>;

/** GET /api/memory?scope=…&projectId=… */
export const MemoryDoc = z.object({
  scope: MemoryScope,
  /** Wajib bila scope=project. */
  projectId: z.string().nullable().default(null),
  content: z.string(),
});
export type MemoryDoc = z.infer<typeof MemoryDoc>;

/** PUT /api/memory, cap 1MB utk payload input (mitigasi GHSA zod <4.6.6). */
export const SaveMemoryRequest = MemoryDoc.extend({ content: z.string().max(1_000_000) });
export type SaveMemoryRequest = z.infer<typeof SaveMemoryRequest>;
