import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv, SUPABASE_CONFIG_HELP } from "./env";

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  const env = getSupabaseEnv();
  if (!env) throw new Error(SUPABASE_CONFIG_HELP);
  return createServerClient(
    env.url,
    env.key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
};
