import type { NextConfig } from "next";

/**
 * Backend origin for the `/api/*` same-origin proxy.
 * - `next dev` / local build: defaults to the FastAPI server on :8000
 * - Docker: set build-arg `API_PROXY_URL=http://tts-api:8000` (see docker-compose.yml)
 *
 * The browser always talks to the Next.js origin unless NEXT_PUBLIC_API_URL
 * is set to an absolute URL at build time.
 */
const backend = (process.env.API_PROXY_URL || "http://localhost:8000").replace(
  /\/+$/,
  "",
);

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
