// @yuika/core, P2-SCR-2/4 (Batch 14a): lease layar user↔persona.
// Pola "fence" di-port dari rokazo packages/core/src/screen-lease.ts (benchmark
// D:\projects\rokazo), satu pengendali input; pengambilalihan hanya boleh
// bila fence LEBIH TINGGI (monotonic), pelepasan hanya oleh owner dengan
// fence >= miliknya. Mencegah dua penulis balapan pada mouse/keyboard.
//
// leaseId = "<owner>:<fence>"; owner = "user" | personaId (mis. "yui-scholar").

export function screenLeaseId(owner: string, fence: number): string {
  return `${owner}:${fence}`;
}

export function parseScreenLeaseId(leaseId: string): { ownerId: string; fence: number } {
  const separator = leaseId.lastIndexOf(":");
  if (separator <= 0) return { ownerId: leaseId, fence: 0 };
  const fence = Number(leaseId.slice(separator + 1));
  if (!Number.isInteger(fence) || fence < 0) return { ownerId: leaseId, fence: 0 };
  return { ownerId: leaseId.slice(0, separator), fence };
}

/** Ambil alih: boleh bila kosong, sama, atau fence MASUK lebih tinggi. */
export function canTakeScreenLease(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): boolean {
  if (!incoming) return false;
  if (!existing || existing === incoming) return true;
  return parseScreenLeaseId(incoming).fence > parseScreenLeaseId(existing).fence;
}

/** Lepas/renovasi: hanya owner sendiri, fence tak boleh mundur. */
export function canReleaseScreenLease(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): boolean {
  if (!incoming || !existing || existing === incoming) return true;
  const current = parseScreenLeaseId(existing);
  const next = parseScreenLeaseId(incoming);
  return next.ownerId === current.ownerId && next.fence >= current.fence;
}
