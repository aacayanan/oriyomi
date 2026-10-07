/**
 * Shared Supabase env resolution for the Next.js app.
 *
 * NEXT_PUBLIC_* vars are inlined at build time and live only in local
 * .env.local (gitignored). A fresh Vercel project without them builds fine
 * but every auth/library path throws at runtime — historically surfacing as
 * a site-wide "Internal Server Error". Read them in one place so the failure
 * mode is a single actionable message instead of a mystery 500.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const SUPABASE_CONFIG_HELP =
  "Supabase is not configured on this deployment. " +
  "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
  "(frontend service on Vercel → Settings → Environment Variables) and redeploy.";

export interface SupabaseEnv {
  url: string;
  key: string;
}

let warned = false;

/** Returns the Supabase config, or null when the public env vars are absent. */
export function getSupabaseEnv(): SupabaseEnv | null {
  if (supabaseUrl && supabaseKey) {
    return { url: supabaseUrl, key: supabaseKey };
  }
  if (!warned) {
    warned = true;
    const missing = [
      !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
      !supabaseKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ].filter(Boolean);
    console.error(`[supabase] ${SUPABASE_CONFIG_HELP} (missing: ${missing.join(", ")})`);
  }
  return null;
}

/** True when both public env vars are present. */
export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}
