import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv, SUPABASE_CONFIG_HELP } from "./env";

export const createClient = () => {
  const env = getSupabaseEnv();
  if (!env) throw new Error(SUPABASE_CONFIG_HELP);
  return createBrowserClient(env.url, env.key);
};
