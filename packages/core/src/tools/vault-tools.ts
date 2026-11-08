// @yuika/core, vault tools (Batch 12 / P2-VLT-2..3, D27).
// INVARIAN KEAMANAN: nilai rahasia TIDAK PERNAH muncul di hasil tool (yang
// dibaca model) maupun event/trace, tool mengembalikan metadata saja.
//   vault_list     → metadata yang terlihat persona/project ini
//   vault_request  → kartu protected (user mengisi via UI; nilai masuk lewat
//                    REST fill, bukan lewat chat/model)
//   vault_forget   → hapus (butuh approval, tindakan destruktif)
//   secret_http    → request ter-auth: nilai disuntik backend sbg header,
//                    origin-bound (redirect DITOLAK), response di-redact
import { z } from "zod";
import { registry } from "../registry.js";
import { redactSecrets } from "../redact.js";
import { redactActive } from "../vault/redact.js";
import { getVault, type VaultManager } from "../vault/manager.js";

const NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;

const listSchema = z.object({});

const requestSchema = z.object({
  name: z.string().regex(NAME_RE, "name: lowercase identifier (a-z, 0-9, _, -), max 64"),
  kind: z.enum(["api_key", "command"]),
  reason: z.string().min(1).max(300),
  originHint: z.string().max(200).optional(),
  scope: z.enum(["workspace", "project", "persona"]).default("workspace"),
});

const forgetSchema = z.object({ name: z.string().regex(NAME_RE) });

const secretHttpSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  /** Rahasia vault utk auth, disuntik backend, TIDAK ditulis agent. */
  auth: z.object({
    name: z.string().regex(NAME_RE),
    via: z.enum(["bearer", "x-api-key", "header"]).default("bearer"),
    headerName: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).optional(),
  }),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().max(64_000).optional(),
  contentType: z.string().max(100).optional(),
  maxChars: z.number().int().min(500).max(20_000).default(8_000),
});

/** http:// hanya utk loopback dev; produksi HTTPS wajib (D27). */
function assertAllowedOrigin(rawUrl: string): URL {
  const u = new URL(rawUrl);
  const loopback = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]" || u.hostname === "::1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && loopback)) {
    throw new Error("secret_http requires https:// (http allowed only for localhost)");
  }
  return u;
}

export function registerVaultTools(opts: { vault?: VaultManager } = {}): void {
  const vault = () => opts.vault ?? getVault();

  registry.register({
    name: "vault_list",
    description:
      "List credentials available to you from the vault (metadata only: name, kind, scope, updatedAt). Values are never shown. Use the name as a reference in secret_http (auth.name) or run_command (env value `vault:<name>`).",
    parameters: listSchema,
    handler: async (_args, ctx) => {
      const viewer = { personaId: ctx.personaId, projectId: ctx.projectId };
      const secrets = vault()
        .list()
        .filter((m) => {
          // run-only hanya milik turn yang membuatnya
          if (m.runOnly) return true; // visibility kasar v0: hanya hidup selama turn
          if (m.scope === "workspace") return true;
          if (m.scope === "persona") return m.personaId === viewer.personaId;
          return m.projectId === viewer.projectId;
        })
        .map((m) => ({ name: m.name, kind: m.kind, scope: m.scope, runOnly: m.runOnly, updatedAt: m.updatedAt }));
      return { result: { secrets, note: "values are never returned, reference by name" } };
    },
  });

  registry.register({
    name: "vault_request",
    description:
      "Ask the user to provide a credential (API key/token). Shows a protected card; the user fills the value in the UI, it never passes through this chat. kind: `api_key` (for secret_http) or `command` (for env vars in run_command). If the name already exists the user is not asked again. The user may Skip (then fall back to asking them to run the step manually).",
    parameters: requestSchema,
    handler: async (args, ctx) => {
      const v = vault();
      const viewer = { personaId: ctx.personaId, projectId: ctx.projectId };
      const existing = v.list().find((m) => m.name === args.name && !m.runOnly);
      if (existing) {
        return { result: { name: existing.name, kind: existing.kind, hasValue: true, note: "already in vault (saved)" } };
      }
      const out = await v.requestFill({
        name: args.name,
        kind: args.kind,
        reason: args.reason,
        originHint: args.originHint,
        scope: args.scope,
        projectId: args.scope === "project" ? (ctx.projectId ?? null) : null,
        personaId: args.scope === "persona" ? (ctx.personaId ?? null) : null,
        runId: ctx.turnId,
        emit: ctx.emit,
      });
      if (out.status === "filled") {
        void viewer;
        return { result: { name: out.name, kind: args.kind, hasValue: true, saved: out.saved, note: out.saved ? "stored encrypted in the vault" : "run-only (deleted when this turn ends)" } };
      }
      return {
        result: { error: "not_provided", status: out.status, message: `user ${out.status} the credential request, fall back to manual steps` },
        isError: true,
      };
    },
  });

  registry.register({
    name: "vault_forget",
    description: "Delete a credential from the vault by name (destructive, needs user approval).",
    parameters: forgetSchema,
    handler: async (args, ctx) => {
      const ok = vault().forget(args.name);
      ctx.emit({ type: "vault.used", name: args.name, kind: "api_key", channel: "http", target: "vault_forget" });
      return ok
        ? { result: { name: args.name, deleted: true } }
        : { result: { error: "not_found", message: `no vault credential named "${args.name}"` }, isError: true };
    },
    approvalPolicy: (args: z.infer<typeof forgetSchema>) => `Delete vault credential "${args.name}"`,
  });

  registry.register({
    name: "secret_http",
    description:
      "Authenticated HTTP request with a vault credential: the value is injected backend-side as a header (bearer / x-api-key / custom header), it never appears in this conversation. Origin-bound: redirects are refused, HTTPS required (localhost http allowed for dev). Response is redacted and capped (default 8000 chars).",
    parameters: secretHttpSchema,
    handler: async (args, ctx) => {
      const v = vault();
      let url: URL;
      try {
        url = assertAllowedOrigin(args.url);
      } catch (e) {
        return { result: { error: "bad_origin", message: (e as Error).message }, isError: true };
      }
      const secret = v.resolveForUse(args.auth.name, { personaId: ctx.personaId, projectId: ctx.projectId });
      if (!secret) {
        return {
          result: { error: "not_found", message: `no vault credential "${args.auth.name}" visible here, call vault_request first` },
          isError: true,
        };
      }
      try {
        const headers: Record<string, string> = { accept: "application/json, text/*;q=0.8", ...(args.headers ?? {}) };
        if (args.contentType && args.body != null) headers["content-type"] = args.contentType;
        if (args.auth.via === "bearer") headers.authorization = `Bearer ${secret.value}`;
        else if (args.auth.via === "x-api-key") headers["x-api-key"] = secret.value;
        else if (args.auth.headerName) headers[args.auth.headerName.toLowerCase()] = secret.value;
        else return { result: { error: "bad_args", message: "via=header requires headerName" }, isError: true };

        const timeoutMs = Number(process.env.YUI_VAULT_HTTP_TIMEOUT_MS ?? 30_000);
        const res = await fetch(url, {
          method: args.method,
          headers,
          ...(args.body != null ? { body: args.body } : {}),
          redirect: "manual", // origin-bound: nilai tak boleh bocor ke host lain
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status >= 300 && res.status < 400) {
          return {
            result: { error: "redirect_refused", message: `redirect to ${res.headers.get("location") ?? "?"} refused, credentials are origin-bound; call the target origin separately if safe` },
            isError: true,
          };
        }
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 1_000_000) {
          return { result: { error: "too_large", message: "response exceeds 1 MB" }, isError: true };
        }
        const ctype = res.headers.get("content-type") ?? "";
        const raw = new TextDecoder().decode(buf);
        // P2-VLT-5: redaksi ganda, nilai aktif (vault) lalu pola bentuk-baku.
        const body = redactSecrets(redactActive(raw)).slice(0, args.maxChars);
        ctx.emit({ type: "vault.used", name: args.auth.name, kind: "api_key", channel: "http", target: url.origin });
        return {
          result: {
            status: res.status,
            ok: res.ok,
            contentType: ctype,
            body,
            ...(raw.length > args.maxChars ? { truncated: true } : {}),
          },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { result: { error: "request_failed", message: redactSecrets(redactActive(msg)) }, isError: true };
      } finally {
        secret.release(); // nilai keluar dari registry redaksi aktif
      }
    },
  });
}
