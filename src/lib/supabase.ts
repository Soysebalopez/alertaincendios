import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Lazy-initialized Supabase client.
 * MUST be lazy — Netlify evaluates API routes at build time
 * when env vars are absent, so module-scope init crashes the build.
 */
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    _client = createClient(url, key);
  }
  return _client;
}
