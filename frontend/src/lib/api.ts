const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

/**
 * Resolve an API path.
 * - Empty NEXT_PUBLIC_API_URL (Docker / Vercel default): same-origin `/api/...`.
 *   On Vercel the top-level rewrite in vercel.json routes `/api/*` to the
 *   FastAPI service; in Docker the Next proxy forwards to API_PROXY_URL.
 * - Absolute NEXT_PUBLIC_API_URL: browser calls the backend directly.
 */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE_URL) return p;
  return `${API_BASE_URL}${p}`;
}
