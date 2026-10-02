const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

/**
 * Resolve an API path.
 * - Empty NEXT_PUBLIC_API_URL (Docker default): same-origin `/api/...`, proxied
 *   by Next rewrites to the backend (see next.config.ts).
 * - Absolute NEXT_PUBLIC_API_URL: browser calls the backend directly.
 */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE_URL) return p;
  return `${API_BASE_URL}${p}`;
}

export function apiEventSource(path: string): EventSource {
  return new EventSource(apiUrl(path));
}
