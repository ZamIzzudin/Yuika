// @yuika/api, entry : service API terpisah dari proses Next.js.
// Boot: load .env root (env-boot) → Fastify + runtime singleton → listen.
import { buildApp } from "./app.js";
import { getRuntime } from "./runtime.js";
import { moduleLogger } from "@yuika/core";
import { getHostDevice, getWebDevice } from "./portal/store.js";
import { getPortalHost } from "./portal/service.js";

const log = moduleLogger("api");
const port = Number(process.env.YUI_API_PORT ?? 3211);
const host = process.env.YUI_API_HOST ?? "127.0.0.1";

const app = buildApp();

// SIGTERM/SIGINT: matikan runtime dengan sopan (server MCP stdio, sqlite WAL)
//, tanpa ini proses anak MCP jadi zombie saat tsx watch restart.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log.info({ sig }, "api shutting down");
    void app.close().finally(() => {
      void getRuntime()
        .dispose?.()
        .catch((e: unknown) => log.warn({ err: e }, "dispose runtime gagal"))
        .finally(() => process.exit(0));
    });
  });
}

app
  .listen({ port, host })
  .then(() => {
    log.info({ port, host, pid: process.pid }, "yui api listening (web → http://host:port/api/…)");
    // Inisialisasi runtime DI SINI (bukan lazy saat request pertama): fail-fast
    // env tidak lengkap terlihat di log boot, bukan error 500 request pertama.
    try {
      getRuntime();
      log.info("runtime siap");
 // host portal auto-online saat API start: instance pernah pair (manual)
      // ATAU pernah SSO (device web = host penuh) → remote-controllable
      // walau tak ada tab web terbuka.
      const host = getHostDevice() ?? getWebDevice();
      if (host) {
        getPortalHost()
          .start(getRuntime(), host)
          .then(() => log.info({ deviceId: host.deviceId }, "portal host online"))
          .catch((e: unknown) => log.warn({ err: e }, "portal host gagal connect (relay down?), akan terus retry"));
      }
    } catch (e) {
      log.error({ err: e }, "runtime gagal init, env belum lengkap? (lihat .env.example)");
      process.exit(1);
    }
  })
  .catch((e: unknown) => {
    log.error({ err: e }, "api gagal listen");
    process.exit(1);
  });
