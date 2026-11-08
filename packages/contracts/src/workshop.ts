// P2-WKS, Workshop persisten per project .
// Workshop = kelas eksekusi KEDUA (selain sandbox disposable): container yang
// MENETAP (volume /home/yui persist, tidur/bangun, egress allowlist) sebagai
// rumah kerja persona. Milik PROJECT (1 project = ≤1 workshop).
import { z } from "zod";

export const WorkshopState = z.enum([
  "absent", // belum pernah dibuat (atau di-destroy)
  "starting", // transisi create/start
  "running", // container hidup
  "asleep", // docker stop, volume utuh, bangun cepat
  "stopped", // dihentikan eksplisit user (tidak auto-wake)
  "error",
]);
export type WorkshopState = z.infer<typeof WorkshopState>;

export const WorkshopInfo = z.object({
  projectId: z.string(),
  state: WorkshopState,
  /** docker: nama container/volume; local: direktori .yuika/workshop. */
  containerName: z.string(),
  volumeName: z.string(),
  backend: z.enum(["docker", "local"]),
  createdAt: z.number().int(),
  lastWakeAt: z.number().int().nullable(),
  lastSleepAt: z.number().int().nullable(),
  /** Total waktu hidup terakumulasi (ms), metering uptime (WKS-5). */
  uptimeMs: z.number().int(),
  /** Allowlist egress yang DIPAKAI workshop ini (workshop.json). */
  egressAllow: z.array(z.string()),
  resourceCap: z.object({
    memory: z.string(),
    cpus: z.string(),
    pidsLimit: z.number().int(),
  }),
});
export type WorkshopInfo = z.infer<typeof WorkshopInfo>;

/** Item ring log workshop (pola terminal): transisi state + audit perintah. */
export const WorkshopLogItem = z.object({
  at: z.number().int(),
  kind: z.enum(["state", "command", "error"]),
  /** "user" | "persona:<id>" | "system". */
  by: z.string(),
  text: z.string(),
});
export type WorkshopLogItem = z.infer<typeof WorkshopLogItem>;

/** `.yuika/workshop.json` di root project, konfigurasi allowlist egress. */
export const WorkshopConfig = z.object({
  egressAllow: z.array(z.string().min(3).max(200)).max(64).default([]),
});
export type WorkshopConfig = z.infer<typeof WorkshopConfig>;

/** Default egress (WKS-2): toolchain npm + GitHub, cukup untuk install &
 * clone; domain lain ditambah via UI/konfigurasi (kartu persetujuan ringan). */
export const WORKSHOP_DEFAULT_EGRESS = [
  "registry.npmjs.org",
  "github.com",
  "api.github.com",
  "objects.githubusercontent.com",
];

/** Hasil eksekusi perintah di workshop. */
export const WorkshopExecResult = z.object({
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().int(),
});
export type WorkshopExecResult = z.infer<typeof WorkshopExecResult>;
