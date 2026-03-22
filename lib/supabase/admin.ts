import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase admin client with service role key for server-side operations.
 * This client bypasses RLS and should only be used in secure server contexts.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
