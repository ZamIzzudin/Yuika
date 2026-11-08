// P0-INF-1: API hidup di proses TERPISAH (apps/api, Fastify, default
// http://127.0.0.1:3211). Frontend tidak lagi fetch same-origin ke Next.
// Override via NEXT_PUBLIC_API_BASE (build-time; prod di balik reverse proxy
// bisa set "" untuk same-origin). Semua komponen WAJIB lewat apiUrl().
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:3211";

/** `/api/x` → `${API_BASE}/api/x` (path tidak berubah, hanya base URL). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

// P1-INF-1: bearer token auth (disimpan saat login/register oleh AuthGate).
const TOKEN_KEY = "yuika.auth.token";

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* SSR / storage disable, abaikan */
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

/** fetch + Authorization Bearer (bila token ada). Dipakai SEMUA panggilan
 *  API supaya gerbang auth (P1-INF-1) tak memutus request yang sah. */
export function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/** Token untuk URL (EventSource tak bisa set header, SSE pakai ?auth_token=). */
export function authTokenQuery(): string {
  const t = getAuthToken();
  return t ? `&auth_token=${encodeURIComponent(t)}` : "";
}
