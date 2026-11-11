// @yuika/core, P2-DSN-2: Penpot RPC connector (v0 jalur utama, riset
// docs/refs/penpot.md). Self-host instance, autentikasi personal access
// token (header `Authorization: Token <jwt>`), endpoint tunggal
// POST /api/main/methods/<method-name>.
//
// Fetch di-inject agar test tanpa network; default globalThis.fetch.
// Semua method mengembalikan parsed JSON; error RPC (non-2xx) → PenpotRpcError.
import { randomUUID } from "node:crypto";

/** Subset Response yang dibutuhkan (mudah di-mock). */
export interface PenpotFetchLike {
  (url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
}

export class PenpotRpcError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly method: string,
    readonly code?: string,
  ) {
    super(`penpot ${method}: ${status}${code ? ` ${code}` : ""} ${message}`);
    this.name = "PenpotRpcError";
  }
}

export interface PenpotConfigSource {
  baseUrl: string;
  token: string;
}

export interface PenpotPageSummary {
  id: string;
  name: string;
}

export interface PenpotFileSummary {
  id: string;
  name: string;
  revn: number;
  vern: number;
  modifiedAt: string | null;
  pages: PenpotPageSummary[];
}

export interface PenpotShareLink {
  id: string;
  fileId: string;
  pages: string[];
}

export interface PenpotClient {
  readonly sessionId: string;
  getProfile(): Promise<Record<string, unknown>>;
  getTeams(): Promise<Array<Record<string, unknown>>>;
  getProjects(teamId: string): Promise<Array<Record<string, unknown>>>;
  createProject(teamId: string, name: string): Promise<{ id: string; name: string; teamId: string }>;
  createFile(projectId: string, name: string): Promise<PenpotFileSummary>;
  getFile(fileId: string): Promise<{ summary: PenpotFileSummary; data: Record<string, unknown> }>;
  updateFile(fileId: string, changes: unknown[], revn: number, vern: number): Promise<{ revn: number; vern: number }>;
  createShareLink(fileId: string, pageIds: string[], opts?: { whoComment?: string; whoInspect?: string }): Promise<PenpotShareLink>;
  viewerUrl(shareId: string, pageId?: string): string;
}

/** Env → config (pola researchConfig); kosong = connector off. */
export function penpotConfig(): PenpotConfigSource {
  return {
    baseUrl: (process.env.YUI_PENPOT_URL ?? "").trim().replace(/\/+$/, ""),
    token: (process.env.YUI_PENPOT_TOKEN ?? "").trim(),
  };
}

function toPages(data: Record<string, unknown>): PenpotPageSummary[] {
  // fdata (2.18): data.pages = [page-id]; detail (name, objects) ada di pagesIndex
  const ids = Array.isArray(data.pages) ? (data.pages as unknown[]) : [];
  const index = (data.pagesIndex as Record<string, Record<string, unknown>> | undefined) ?? {};
  return ids.map((id) => ({ id: String(id), name: String(index[String(id)]?.name ?? "") }));
}

function fileSummary(f: Record<string, unknown>): PenpotFileSummary {
  const data = (f.data as Record<string, unknown> | undefined) ?? {};
  return {
    id: String(f.id),
    name: String(f.name ?? ""),
    revn: Number(f.revn ?? 0),
    vern: Number(f.vern ?? 0),
    modifiedAt: typeof f.modifiedAt === "string" ? f.modifiedAt : null,
    pages: toPages(data),
  };
}

export function createPenpotClient(
  cfg: PenpotConfigSource,
  doFetch: PenpotFetchLike = ((u, i) => fetch(u, i)) as PenpotFetchLike,
): PenpotClient {
  if (!cfg.baseUrl || !cfg.token) throw new Error("penpot connector belum dikonfigurasi (YUI_PENPOT_URL + YUI_PENPOT_TOKEN)");
  const baseUrl = cfg.baseUrl.replace(/\/+$/, "");
  const sessionId = randomUUID(); // identitas editor headless; stabil per client

  async function call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    let res: { ok: boolean; status: number; json: () => Promise<unknown> };
    try {
      res = await doFetch(`${baseUrl}/api/main/methods/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", authorization: `Token ${cfg.token}` },
        body: JSON.stringify(params),
      });
    } catch (e) {
      throw new PenpotRpcError(e instanceof Error ? e.message : String(e), 0, method);
    }
    if (!res.ok) {
      let code = "";
      let msg = "";
      try {
        const j = (await res.json()) as Record<string, unknown>;
        code = typeof j.code === "string" ? j.code : "";
        msg = typeof j.message === "string" ? j.message : "";
      } catch {
        /* body non-JSON */
      }
      throw new PenpotRpcError(msg || "request ditolak", res.status, method, code);
    }
    // Penpot RPC membalas {status: "success", data?} atau langsung payload
    const j = (await res.json()) as Record<string, unknown>;
    return (j && typeof j === "object" && "status" in j && j.status === "success" && "data" in j ? j.data : j) as T;
  }

  return {
    sessionId,
    getProfile: () => call("get-profile", {}),
    getTeams: async () => {
      const r = await call<{ teams?: unknown[] } | unknown[]>("get-teams", {});
      return (Array.isArray(r) ? r : (Array.isArray((r as { teams?: unknown[] }).teams) ? (r as { teams: unknown[] }).teams : [])) as Array<Record<string, unknown>>;
    },
    getProjects: async (teamId) => {
      const r = await call<{ projects?: unknown[] } | unknown[]>("get-projects", { teamId });
      return (Array.isArray(r) ? r : (Array.isArray((r as { projects?: unknown[] }).projects) ? (r as { projects?: unknown[] }).projects : [])) as Array<Record<string, unknown>>;
    },
    createProject: async (teamId, name) => {
      const p = await call<Record<string, unknown>>("create-project", { teamId, name });
      return { id: String(p.id), name: String(p.name ?? name), teamId: String(p.teamId ?? teamId) };
    },
    createFile: async (projectId, name) => {
      const f = await call<Record<string, unknown>>("create-file", { projectId, name });
      let summary = fileSummary(f);
      // beberapa versi tidak menyertakan pages di create → refresh sekali
      if (summary.pages.length === 0) {
        const got = await call<Record<string, unknown>>("get-file", { id: summary.id });
        summary = fileSummary(got);
      }
      return summary;
    },
    getFile: async (fileId) => {
      const f = await call<Record<string, unknown>>("get-file", { id: fileId });
      const data = (f.data as Record<string, unknown> | undefined) ?? {};
      return { summary: fileSummary(f), data };
    },
    updateFile: async (fileId, changes, revn, vern) => {
      const r = await call<Record<string, unknown>>("update-file", { id: fileId, sessionId, revn, vern, changes });
      // hasil 2.18: {revn, lagged:[{revn,...}]}; revn baru = elemen lagged terakhir
      const lagged = Array.isArray(r.lagged) ? (r.lagged as Array<Record<string, unknown>>) : [];
      const last = lagged[lagged.length - 1];
      return { revn: Number(last?.revn ?? r.revn ?? revn), vern };
    },
    createShareLink: async (fileId, pageIds, opts) => {
      const s = await call<Record<string, unknown>>("create-share-link", {
        fileId,
        pages: pageIds,
        whoComment: opts?.whoComment ?? "none",
        whoInspect: opts?.whoInspect ?? "all",
      });
      const pages = Array.isArray(s.pages) ? (s.pages as unknown[]).map(String) : [];
      return { id: String(s.id), fileId, pages };
    },
    viewerUrl(shareId, pageId) {
      const q = new URLSearchParams({ "share-id": shareId, index: "0" });
      if (pageId) q.set("page-id", pageId);
      return `${baseUrl}/?${q.toString()}`;
    },
  };
}
