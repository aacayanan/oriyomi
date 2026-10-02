import type { NextConfig } from "next";

/**
 * Backend origin for the `/api/*` same-origin proxy.
 * - `next dev` / local build: defaults to the FastAPI server on :8000
 * - Docker: set build-arg `API_PROXY_URL=http://tts-api:8000` (see docker-compose.yml)
 * - Vercel: the top-level rewrite in vercel.json routes `/api/*` to the FastAPI
 *   service directly, so the Next proxy stays off — routing into a service is
 *   final, and a stale localhost proxy target would 500 every API call.
 *
 * The browser always talks to the Next.js origin unless NEXT_PUBLIC_API_URL
 * is set to an absolute URL at build time.
 */
const onVercel = Boolean(process.env.VERCEL);

const backend = (process.env.API_PROXY_URL || "http://localhost:8000").replace(
  /\/+$/,
  "",
);

const nextConfig: NextConfig = {
  // Standalone output exists for the Docker runner; Vercel builds Next natively.
  ...(onVercel ? {} : { output: "standalone" as const }),
  async rewrites() {
    if (onVercel) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
