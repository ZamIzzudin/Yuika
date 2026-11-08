// @yuika/core, : CDP client raw via global WebSocket
// (Node 22+; dibuktikan probe SCR-0 di Windows+Edge). NOL dependensi baru,
// tanpa playwright/puppeteer. Flat protocol: pesan ke page target membawa
// atribut `sessionId` langsung.
//
// Envelope: { id?, method, params, sessionId? }, balasan { id, result? , error? },
// event { method, params, sessionId? }.
import { moduleLogger } from "../logger.js";

const log = moduleLogger("screen:cdp");

/** Callback balasan call() yang masih menggantung. */
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class CdpError extends Error {
  constructor(
    public method: string,
    public code: number,
    message: string,
  ) {
    super(`${method}: ${message} (${code})`);
    this.name = "CdpError";
  }
}

/** Koneksi ke browser endpoint (ws://127.0.0.1:PORT/devtools/browser/...). */
export class CdpConnection {
  private ws: WebSocket;
  private nextId = 0;
  private pending = new Map<number, Pending>();
  /** event listener per (method, sessionId?), wildcard sessionId=undefined = browser-level. */
  private listeners = new Map<string, Set<(params: unknown, sessionId?: string) => void>>();
  private closeCbs = new Set<() => void>();

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
    this.ws.addEventListener("message", (ev) => this.onMessage(ev));
    this.ws.addEventListener("close", () => this.fireClose(), { once: true });
  }

  /** Dipanggil sekali saat websocket mati (sidecar down/restart, close()).
   *  Dipakai mode sidecar utk menandai semua sesi remote failed. */
  onClose(cb: () => void): () => void {
    this.closeCbs.add(cb);
    return () => this.closeCbs.delete(cb);
  }

  private fireClose(): void {
    for (const cb of this.closeCbs) cb();
    this.closeCbs.clear();
  }

  static async connect(wsUrl: string, timeoutMs = 10_000): Promise<CdpConnection> {
    const conn = new CdpConnection(wsUrl);
    const t = setTimeout(() => {
      void conn.close().catch(() => undefined);
      throw new Error(`CDP connect timeout (${timeoutMs}ms)`);
    }, timeoutMs);
    try {
      await conn.opened();
    } finally {
      clearTimeout(t);
    }
    return conn;
  }

  private opened_?: Promise<void>;
  private opened(): Promise<void> {
    this.opened_ ??= new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve(), { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP websocket error (open)")), { once: true });
    });
    return this.opened_;
  }

  private onMessage(ev: MessageEvent): void {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(String(ev.data));
    } catch {
      return; // frame non-JSON tak diharapkan, abaikan
    }
    if (typeof m.id === "number" && this.pending.has(m.id)) {
      const p = this.pending.get(m.id)!;
      this.pending.delete(m.id);
      if (m.error) p.reject(new CdpError(String(m.method ?? "?"), (m.error as { code: number }).code, String((m.error as { message: string }).message)));
      else p.resolve(m.result ?? {});
      return;
    }
    if (typeof m.method === "string") {
      const key = typeof m.sessionId === "string" ? `${m.sessionId}|${m.method}` : `*|${m.method}`;
      this.listeners.get(key)?.forEach((cb) => cb(m.params ?? {}, typeof m.sessionId === "string" ? m.sessionId : undefined));
      this.listeners.get(`*|*`)?.forEach((cb) => cb(m, undefined));
    }
  }

  /** Call browser-level (tanpa sesi). */
  call<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: CDP call timeout (${timeoutMs}ms)`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(t); resolve(v as T); },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method: string, cb: (params: unknown, sessionId?: string) => void, sessionId?: string): () => void {
    const key = sessionId ? `${sessionId}|${method}` : `*|${method}`;
    let set = this.listeners.get(key);
    if (!set) { set = new Set(); this.listeners.set(key, set); }
    set.add(cb);
    return () => set!.delete(cb);
  }

  get closed(): boolean {
    return this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING;
  }

  async close(): Promise<void> {
    for (const [, p] of this.pending) p.reject(new Error("CDP connection closed"));
    this.pending.clear();
    this.listeners.clear();
    if (!this.closed) {
      try { this.ws.close(); } catch { /* abaikan */ }
    }
    this.fireClose();
  }
}

/** Sesi page (flat protocol), call + event terikat satu tab. */
export class CdpPage {
  constructor(
    private conn: CdpConnection,
    public readonly sessionId: string,
    public readonly targetId: string,
  ) {}

  call<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
    // flat protocol: atribut sessionId dilekatkan LANGSUNG di pesan
    const conn = this.conn as unknown as { nextId: number; pending: Map<number, Pending>; ws: WebSocket };
    const id = ++conn.nextId;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        conn.pending.delete(id);
        reject(new Error(`${method}: CDP call timeout (${timeoutMs}ms)`));
      }, timeoutMs);
      conn.pending.set(id, {
        resolve: (v) => { clearTimeout(t); resolve(v as T); },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
      conn.ws.send(JSON.stringify({ id, method, params, sessionId: this.sessionId }));
    });
  }

  on(method: string, cb: (params: unknown) => void): () => void {
    return this.conn.on(method, cb, this.sessionId);
  }
}

/** Ambil target page pertama (tab about:blank saat launch). */
export async function attachFirstPage(conn: CdpConnection): Promise<CdpPage> {
  const { targetInfos } = await conn.call<{ targetInfos: { targetId: string; type: string }[] }>("Target.getTargets");
  const page = targetInfos.find((t) => t.type === "page");
  if (!page) throw new Error("no page target available");
  const { sessionId } = await conn.call<{ sessionId: string }>("Target.attachToTarget", {
    targetId: page.targetId,
    flatten: true,
  });
  return new CdpPage(conn, sessionId, page.targetId);
}

/** Resolve endpoint CDP. ws://wss:// dipakai langsung; http(s):// di-fetch
 *  /json/version (browser ws URL memuat UUID yang berubah tiap boot sidecar,
 *  endpoint http stabil adalah konfigurasi yang benar untuk sidecar). */
export async function resolveCdpEndpoint(url: string): Promise<string> {
  const u = url.trim();
  if (u.startsWith("ws://") || u.startsWith("wss://")) return u;
  const r = await fetch(`${u.replace(/\/+$/, "")}/json/version`, { signal: AbortSignal.timeout(5_000) });
  if (!r.ok) throw new Error(`CDP endpoint ${u} /json/version returned HTTP ${r.status}`);
  const v = (await r.json()) as { webSocketDebuggerUrl?: string };
  if (!v.webSocketDebuggerUrl) throw new Error(`CDP endpoint ${u} did not return webSocketDebuggerUrl`);
  return v.webSocketDebuggerUrl;
}

/** Mode sidecar (deployment): satu proses browser REMOTE di-share semua key
 *  project×persona. Isolasi antar key = browser CONTEXT terpisah (cookie /
 *  storage tidak terbagi), tanpa profil persist (context in-memory). */
export async function createIsolatedPage(conn: CdpConnection): Promise<{ page: CdpPage; browserContextId: string }> {
  const { browserContextId } = await conn.call<{ browserContextId: string }>("Target.createBrowserContext", {
    disposeOnDetach: true,
  });
  const { targetId } = await conn.call<{ targetId: string }>("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  });
  const { sessionId } = await conn.call<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  return { page: new CdpPage(conn, sessionId, targetId), browserContextId };
}

/** Parse baris "DevTools listening on ws://..." dari stderr proses browser. */
export function parseDevToolsUrl(stderrChunk: string): string | null {
  const m = /DevTools listening on (ws:\/\/\S+)/.exec(stderrChunk);
  return m ? m[1]! : null;
}

export { log as cdpLog };
