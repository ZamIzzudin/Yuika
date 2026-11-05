// P0-INF-1: API hidup di proses TERPISAH (apps/api, Fastify — default
// http://127.0.0.1:3211). Frontend tidak lagi fetch same-origin ke Next.
// Override via NEXT_PUBLIC_API_BASE (build-time; prod di balik reverse proxy
// bisa set "" untuk same-origin). Semua komponen WAJIB lewat apiUrl().
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:3211";

/** `/api/x` → `${API_BASE}/api/x` (path tidak berubah — hanya base URL). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
